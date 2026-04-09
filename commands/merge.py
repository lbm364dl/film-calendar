"""Merge command: merge matched CSV into Supabase with metadata fetching."""

import os
import sys
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv

from json_io import parse_dates_column
from rate import fetch_letterboxd_info_batch
from tmdb import fetch_tmdb_info_batch

load_dotenv()


LETTERBOXD_FIELDS = [
    "letterboxd_rating", "letterboxd_viewers", "letterboxd_short_url",
    "tmdb_url",
]
TMDB_FIELDS = [
    "tmdb_id", "genres", "country", "primary_language", "spoken_languages",
    "runtime_minutes", "directors", "top_cast", "keywords",
    "tmdb_rating", "tmdb_votes", "production_companies",
    "collection_name", "collection_id", "overview", "tagline",
    "title_original", "title_en", "title_es",
]


def _init_supabase():
    """Initialize and return Supabase client."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: Set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        sys.exit(1)
    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        print("Error: Install supabase-py:  pip install supabase")
        sys.exit(1)


def _parse_timestamp(ts: str) -> str:
    """Normalize 'YYYY-MM-DD HH:MM' to 'YYYY-MM-DD HH:MM:00' for DB storage."""
    dt = datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M")
    return dt.strftime("%Y-%m-%d %H:%M:00")


def _build_film_row(film: dict) -> dict:
    """Build a films table row from a film dict (already has all metadata)."""
    row = {
        "title": film.get("title"),
        "director": film.get("director"),
        "year": film.get("year"),
        "letterboxd_url": film.get("letterboxd_url"),
        "letterboxd_short_url": film.get("letterboxd_short_url"),
        "letterboxd_rating": film.get("letterboxd_rating"),
        "letterboxd_viewers": film.get("letterboxd_viewers"),
        "tmdb_url": film.get("tmdb_url"),
        "tmdb_id": film.get("tmdb_id"),
        "genres": film.get("genres", []),
        "country": film.get("country", []),
        "primary_language": film.get("primary_language", []),
        "spoken_languages": film.get("spoken_languages", []),
        "runtime_minutes": film.get("runtime_minutes"),
        "directors": film.get("directors", []),
        "top_cast": film.get("top_cast", []),
        "keywords": film.get("keywords", []),
        "tmdb_rating": film.get("tmdb_rating"),
        "tmdb_votes": film.get("tmdb_votes"),
        "production_companies": film.get("production_companies", []),
        "collection_name": film.get("collection_name"),
        "collection_id": film.get("collection_id"),
        "overview": film.get("overview"),
        "tagline": film.get("tagline"),
        "title_original": film.get("title_original"),
        "title_en": film.get("title_en"),
        "title_es": film.get("title_es"),
    }
    # Remove None values so we don't overwrite existing DB data with nulls
    return {k: v for k, v in row.items() if v is not None}


def _parse_csv_to_films(input_df):
    """Parse input CSV into a list of film dicts with dates. Returns list of film dicts."""
    films = []
    seen_urls = {}   # letterboxd_url -> index in films
    seen_titles = {} # title -> index in films

    for _, row in input_df.iterrows():
        lb_url = row.get("letterboxd_url")
        lb_url = lb_url if pd.notna(lb_url) else None
        title = row.get("title")
        title = title if pd.notna(title) else None

        raw_dates = parse_dates_column(row.get("dates"))
        theater = row.get("theater", "Unknown") if pd.notna(row.get("theater")) else "Unknown"
        link = row.get("theater_film_link", "") if pd.notna(row.get("theater_film_link")) else ""
        row_special = row.get("special") if pd.notna(row.get("special")) else None

        new_dates = []
        for d in raw_dates:
            if isinstance(d, dict):
                item = {
                    "timestamp": d.get("timestamp"),
                    "location": d.get("location", theater),
                    "url_tickets": d.get("url_tickets", d.get("url", "")),
                    "url_info": d.get("url_info", link),
                }
                if d.get("version"):
                    item["version"] = d["version"]
                special = d.get("special") or row_special
                if special:
                    item["special"] = special
            elif isinstance(d, str):
                item = {"timestamp": d, "location": theater, "url_tickets": "", "url_info": link}
            else:
                continue
            if item.get("timestamp"):
                new_dates.append(item)

        # Deduplicate within the CSV itself
        existing_idx = None
        if lb_url and lb_url in seen_urls:
            existing_idx = seen_urls[lb_url]
        elif title and title in seen_titles:
            existing_idx = seen_titles[title]

        if existing_idx is not None:
            existing = films[existing_idx]
            existing_keys = {(d.get("timestamp"), d.get("location")) for d in existing["dates"]}
            for d in new_dates:
                if (d.get("timestamp"), d.get("location")) not in existing_keys:
                    existing["dates"].append(d)
            if lb_url and not existing.get("letterboxd_url"):
                existing["letterboxd_url"] = lb_url
                seen_urls[lb_url] = existing_idx
        else:
            film = {
                "title": title,
                "dates": new_dates,
                "director": row.get("director") if pd.notna(row.get("director")) else None,
                "year": int(row["year"]) if pd.notna(row.get("year")) else None,
                "letterboxd_url": lb_url,
            }
            idx = len(films)
            films.append(film)
            if lb_url:
                seen_urls[lb_url] = idx
            if title:
                seen_titles[title] = idx

    return films


def _prefill_metadata_from_db(supabase, films):
    """Check Supabase for films that already have metadata and prefill them.

    This prevents re-fetching Letterboxd/TMDB data for films already in the DB.
    Only queries for films present in the CSV by letterboxd_url.
    """
    urls = [f["letterboxd_url"] for f in films if f.get("letterboxd_url")]
    if not urls:
        return

    # Query existing films by letterboxd_url (batch in chunks to avoid URL length limits)
    CHUNK = 50
    db_films = {}
    for i in range(0, len(urls), CHUNK):
        chunk = urls[i:i + CHUNK]
        result = supabase.table("films").select("*").in_("letterboxd_url", chunk).execute()
        for row in (result.data or []):
            if row.get("letterboxd_url"):
                db_films[row["letterboxd_url"]] = row

    prefilled = 0
    for film in films:
        lb_url = film.get("letterboxd_url")
        if not lb_url or lb_url not in db_films:
            continue
        db_row = db_films[lb_url]
        # Copy metadata fields from DB into the film dict (don't overwrite CSV data)
        for field in LETTERBOXD_FIELDS + TMDB_FIELDS:
            db_val = db_row.get(field)
            if db_val is not None and db_val != [] and db_val != "":
                if not film.get(field):
                    film[field] = db_val
        prefilled += 1

    if prefilled:
        print(f"  {prefilled} films already have metadata in DB, skipping re-fetch")


def _batch_fetch_letterboxd(films, backfill):
    """Fetch Letterboxd metadata for films that need it."""
    urls = []
    indices = []
    for i, film in enumerate(films):
        if not film.get("letterboxd_url"):
            continue
        if not backfill:
            has_meta = any(
                film.get(f) not in (None, [], "")
                for f in LETTERBOXD_FIELDS
            )
            if has_meta:
                continue
        urls.append(film["letterboxd_url"])
        indices.append(i)

    if not urls:
        return

    label = "Backfilling" if backfill else "Fetching"
    print(f"\n  {label} Letterboxd metadata for {len(urls)} films (Selenium)...")

    try:
        infos = fetch_letterboxd_info_batch(urls, use_selenium=True)
        for idx, info in zip(indices, infos):
            for key in LETTERBOXD_FIELDS:
                val = info.get(key)
                if val is not None and not (isinstance(val, list) and len(val) == 0):
                    films[idx][key] = val
    except Exception as e:
        print(f"  Error during Letterboxd batch fetch: {e}")


def _batch_fetch_tmdb(films, backfill):
    """Fetch TMDB metadata for films that need it."""
    urls = []
    indices = []
    for i, film in enumerate(films):
        tmdb_url = film.get("tmdb_url")
        if not tmdb_url:
            continue
        if not backfill:
            has_meta = any(
                film.get(f) not in (None, [], "")
                for f in TMDB_FIELDS
            )
            if has_meta:
                continue
        urls.append(tmdb_url)
        indices.append(i)

    if not urls:
        return

    label = "Backfilling" if backfill else "Fetching"
    print(f"\n  {label} TMDB metadata for {len(urls)} films...")

    try:
        tmdb_infos = fetch_tmdb_info_batch(urls)
        for idx, info in zip(indices, tmdb_infos):
            if info is None:
                print(f"  Warning: TMDB returned no data for {films[idx].get('tmdb_url')}")
                continue
            for key in TMDB_FIELDS:
                val = info.get(key)
                if val is not None and not (isinstance(val, list) and len(val) == 0):
                    films[idx][key] = val
    except Exception as e:
        print(f"  Error during TMDB batch fetch: {e}")


def _upsert_to_supabase(supabase, films, dry_run=False):
    """Upsert films and their screenings to Supabase. Returns (films_upserted, screenings_upserted)."""
    films_upserted = 0
    screenings_upserted = 0

    for i, film in enumerate(films):
        title = film.get("title") or "(unknown)"
        short_url = film.get("letterboxd_short_url")

        if dry_run:
            print(f"  [{i+1}/{len(films)}] [dry-run] Would upsert: {title}")
            for d in film.get("dates", []):
                print(f"    screening: {d.get('timestamp')} @ {d.get('location')}")
            continue

        film_row = _build_film_row(film)

        # Upsert film
        try:
            if short_url:
                result = supabase.table("films").upsert(
                    film_row, on_conflict="letterboxd_short_url"
                ).execute()
            else:
                result = supabase.table("films").insert(film_row).execute()
            film_id = result.data[0]["id"]
            films_upserted += 1
        except Exception as e:
            print(f"  Error upserting film '{title}': {e}")
            continue

        # Upsert screenings in batch
        screening_rows = []
        for d in film.get("dates", []):
            ts = d.get("timestamp", "")
            if not ts:
                continue
            screening_rows.append({
                "film_id": film_id,
                "showtime": _parse_timestamp(ts),
                "location": d.get("location", "Unknown"),
                "url_tickets": d.get("url_tickets", ""),
                "url_info": d.get("url_info", ""),
                "version": d.get("version"),
                "special": d.get("special"),
            })

        if screening_rows:
            try:
                supabase.table("screenings").upsert(
                    screening_rows, on_conflict="film_id,showtime,location"
                ).execute()
                screenings_upserted += len(screening_rows)
            except Exception as e:
                print(f"  Warning: screenings batch for '{title}': {e}")

        print(f"  [{i+1}/{len(films)}] {title} — {len(screening_rows)} screenings")

    return films_upserted, screenings_upserted


def run_merge(args):
    """Execute the merge command.

    Merges a matched CSV into Supabase, fetching metadata for new films.
    With --backfill: re-fetches metadata for ALL films in the CSV.
    """
    input_csv = args.input
    backfill = args.backfill
    dry_run = args.dry_run

    print(f"Merging {input_csv} into Supabase ...")

    # Initialize Supabase
    supabase = None if dry_run else _init_supabase()

    # Parse CSV into film dicts (deduplicating within the CSV)
    input_df = pd.read_csv(input_csv)
    films = _parse_csv_to_films(input_df)
    print(f"  Parsed {len(films)} unique films from {len(input_df)} CSV rows")

    # Check DB for films that already have metadata (avoids re-fetching)
    if supabase and not backfill:
        _prefill_metadata_from_db(supabase, films)

    # Fetch metadata for films that still need it
    _batch_fetch_letterboxd(films, backfill)
    _batch_fetch_tmdb(films, backfill)

    # Upsert to Supabase (DB handles deduplication via conflict keys)
    print(f"\n  Upserting to Supabase...")
    films_upserted, screenings_upserted = _upsert_to_supabase(supabase, films, dry_run)

    print(f"\n{'[dry-run] ' if dry_run else ''}Merge complete!")
    print(f"  Films: {films_upserted}")
    print(f"  Screenings: {screenings_upserted}")
