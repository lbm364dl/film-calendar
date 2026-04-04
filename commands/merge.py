"""Merge command: merge matched CSV into master JSON with metadata fetching."""

import pandas as pd

from json_io import read_master_json, write_master_json, parse_dates_column
from rate import fetch_letterboxd_info_batch
from tmdb import fetch_tmdb_info_batch


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
METADATA_FIELDS = LETTERBOXD_FIELDS + TMDB_FIELDS


def _merge_input_into_master(input_df, master_films, url_to_idx, title_to_idx):
    """Merge input CSV rows into the master films list. Returns (updated_count, new_count)."""
    updated_count = 0
    new_count = 0

    for _, row in input_df.iterrows():
        lb_url = row.get("letterboxd_url")
        title = row.get("title")

        raw_dates = parse_dates_column(row.get("dates"))
        theater = row.get("theater", "Unknown") if pd.notna(row.get("theater")) else "Unknown"
        link = row.get("theater_film_link", "") if pd.notna(row.get("theater_film_link")) else ""

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
            elif isinstance(d, str):
                item = {"timestamp": d, "location": theater, "url_tickets": "", "url_info": link}
            else:
                continue
            if item.get("timestamp"):
                new_dates.append(item)

        # Find existing film in master
        target_idx = None
        if pd.notna(lb_url) and lb_url in url_to_idx:
            target_idx = url_to_idx[lb_url]
        elif pd.notna(title) and title in title_to_idx:
            target_idx = title_to_idx[title]

        if target_idx is not None:
            master_film = master_films[target_idx]
            existing_dates = master_film.get("dates", [])
            existing_keys = {(d.get("timestamp"), d.get("location")) for d in existing_dates}

            added = False
            for d in new_dates:
                key = (d.get("timestamp"), d.get("location"))
                if key not in existing_keys:
                    existing_dates.append(d)
                    existing_keys.add(key)
                    added = True

            if added:
                existing_dates.sort(key=lambda x: x.get("timestamp", ""))
                master_film["dates"] = existing_dates
                updated_count += 1

            if pd.notna(lb_url) and not master_film.get("letterboxd_url"):
                master_film["letterboxd_url"] = lb_url
                url_to_idx[lb_url] = target_idx

            for field in METADATA_FIELDS:
                input_val = row.get(field)
                if pd.notna(input_val) if isinstance(input_val, float) else input_val:
                    master_val = master_film.get(field)
                    if not master_val:
                        master_film[field] = input_val
        else:
            film = {
                "title": title if pd.notna(title) else None,
                "dates": new_dates,
                "director": row.get("director") if pd.notna(row.get("director")) else None,
                "year": int(row["year"]) if pd.notna(row.get("year")) else None,
                "letterboxd_url": lb_url if pd.notna(lb_url) else None,
                "letterboxd_rating": None,
                "letterboxd_viewers": None,
                "letterboxd_short_url": None,
                "tmdb_url": None,
                "tmdb_id": None,
                "genres": [],
                "country": [],
                "primary_language": [],
                "spoken_languages": [],
                "runtime_minutes": None,
                "directors": [],
                "top_cast": [],
                "keywords": [],
                "tmdb_rating": None,
                "tmdb_votes": None,
                "production_companies": [],
                "collection_name": None,
                "collection_id": None,
                "overview": None,
                "tagline": None,
                "title_original": None,
                "title_en": None,
                "title_es": None,
            }

            for field in METADATA_FIELDS:
                input_val = row.get(field)
                if pd.notna(input_val) if isinstance(input_val, float) else input_val:
                    film[field] = input_val

            idx = len(master_films)
            master_films.append(film)
            if film["letterboxd_url"]:
                url_to_idx[film["letterboxd_url"]] = idx
            if film["title"]:
                title_to_idx[film["title"]] = idx
            new_count += 1

    return updated_count, new_count


def _batch_fetch_letterboxd(master_films, backfill):
    """Fetch Letterboxd metadata for films that need it."""
    if backfill:
        urls = []
        indices = []
        for i, film in enumerate(master_films):
            if film.get("letterboxd_url"):
                urls.append(film["letterboxd_url"])
                indices.append(i)
        print(f"\n  Backfilling Letterboxd metadata for {len(urls)} films (Selenium)...")
    else:
        lb_meta_fields = [
            "letterboxd_rating", "letterboxd_viewers", "letterboxd_short_url",
            "tmdb_url",
        ]
        urls = []
        indices = []
        for i, film in enumerate(master_films):
            if not film.get("letterboxd_url"):
                continue
            has_lb_meta = any(
                (film.get(f) not in (None, [], ""))
                for f in lb_meta_fields
            )
            if not has_lb_meta:
                urls.append(film["letterboxd_url"])
                indices.append(i)
        if urls:
            print(f"\n  Fetching Letterboxd metadata for {len(urls)} new films (Selenium)...")

    if urls:
        try:
            infos = fetch_letterboxd_info_batch(urls, use_selenium=True)
            for idx, info in zip(indices, infos):
                for key in LETTERBOXD_FIELDS:
                    val = info.get(key)
                    if val is not None:
                        if isinstance(val, list) and len(val) == 0:
                            continue
                        master_films[idx][key] = val
        except Exception as e:
            print(f"  Error during Letterboxd batch fetch: {e}")


def _batch_fetch_tmdb(master_films, backfill):
    """Fetch TMDB metadata for films that need it."""
    if backfill:
        urls = []
        indices = []
        for i, film in enumerate(master_films):
            if film.get("tmdb_url"):
                urls.append(film["tmdb_url"])
                indices.append(i)
        print(f"\n  Backfilling TMDB metadata for {len(urls)} films...")
    else:
        urls = []
        indices = []
        for i, film in enumerate(master_films):
            tmdb_url = film.get("tmdb_url")
            if not tmdb_url:
                continue
            has_tmdb_meta = any(
                (film.get(f) not in (None, [], ""))
                for f in TMDB_FIELDS
            )
            if not has_tmdb_meta:
                urls.append(tmdb_url)
                indices.append(i)
        if urls:
            print(f"\n  Fetching TMDB metadata for {len(urls)} films...")

    if urls:
        try:
            tmdb_infos = fetch_tmdb_info_batch(urls)
            for idx, info in zip(indices, tmdb_infos):
                if info is None:
                    print(f"  Warning: TMDB returned no data for {master_films[idx].get('tmdb_url')}")
                    continue
                for key in TMDB_FIELDS:
                    val = info.get(key)
                    if val is not None:
                        if isinstance(val, list) and len(val) == 0:
                            continue
                        master_films[idx][key] = val
        except Exception as e:
            print(f"  Error during TMDB batch fetch: {e}")


def run_merge(args):
    """Execute the merge command.

    For new films: fetches full Letterboxd metadata (Selenium) automatically.
    With --backfill: re-fetches metadata for ALL films in the master JSON.
    """
    source_json = args.source
    input_csv = args.input
    output_json = args.output if args.output else source_json
    backfill = args.backfill

    print(f"Merging {input_csv} into {source_json} ...")

    # Load master JSON
    master_films = read_master_json(source_json)
    url_to_idx = {}
    title_to_idx = {}
    for i, film in enumerate(master_films):
        url = film.get("letterboxd_url")
        title = film.get("title")
        if url:
            url_to_idx[url] = i
        if title:
            title_to_idx[title] = i

    # Load and merge input CSV
    input_df = pd.read_csv(input_csv)
    updated_count, new_count = _merge_input_into_master(
        input_df, master_films, url_to_idx, title_to_idx
    )

    # Batch-fetch metadata
    _batch_fetch_letterboxd(master_films, backfill)
    _batch_fetch_tmdb(master_films, backfill)

    # Sort by rating and write
    master_films.sort(
        key=lambda f: (f.get("letterboxd_rating") or 0,),
        reverse=True,
    )

    write_master_json(master_films, output_json)
    print(f"\n✓ Merged data saved to {output_json}")
    print(f"  Updates: {updated_count} screening updates/merges")
    print(f"  New: {new_count} films added")
    print(f"  Total: {len(master_films)} films")
