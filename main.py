"""Main entry point for film-calendar."""

import ast
import json

import pandas as pd

from cli import parse_args, generate_cinema_boilerplate
from rate import match_films, fetch_letterboxd_info_batch
from tmdb import fetch_tmdb_info_batch
from pathlib import Path
import theaters


# =============================================================================
# JSON I/O helpers for the master screenings file
# =============================================================================

def read_master_json(path: str) -> list[dict]:
    """Read the master screenings JSON file."""
    p = Path(path)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_master_json(films: list[dict], path: str):
    """Write films list to the master screenings JSON file."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(films, f, ensure_ascii=False, indent=2)


def parse_dates_column(val):
    """Parse a dates column value (JSON string, Python repr, or list)."""
    if pd.isna(val) if isinstance(val, float) else not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            try:
                return ast.literal_eval(val)
            except (ValueError, SyntaxError):
                return []
    return []


def run_scrape(args):
    """Execute the scrape command - fetch films from theaters (no Letterboxd)."""
    start_date = args.start_date
    end_date = args.end_date
    
    if args.fetch_from:
        theaters_list = args.fetch_from
    elif args.period:
        theaters_list = theaters.get_theaters_by_period(args.period)
    else:
        theaters_list = theaters.all_theaters()
    output_csv = args.output

    fetched_films = []
    for theater in theaters_list:
        fetched_films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(fetched_films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
    )
    df = df[~df["title"].isna()]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    
    df.to_csv(output_csv, index=False)
    print(f"\n✓ Scraped {len(df)} films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")


def run_match(args):
    """Execute the match command - find Letterboxd URLs."""
    input_csv = args.input
    output_csv = args.output
    skip_existing = args.skip_existing

    # Build cache from master text (args.cache)
    # We want {theater_film_link: letterboxd_url}
    url_cache = {}
    
    master_path = Path(args.cache) if args.cache else None

    if master_path and master_path.exists():
        print(f"Loading cache from {master_path} ...")
        try:
            # Support both JSON and CSV master files
            if master_path.suffix == ".json":
                master_films = read_master_json(str(master_path))
                count_cached = 0
                for film in master_films:
                    lb_url = film.get("letterboxd_url")
                    if not lb_url:
                        continue
                    for d in film.get("dates", []):
                        if isinstance(d, dict):
                            link = d.get("url_info")
                            if link and link not in url_cache:
                                url_cache[link] = lb_url
                                count_cached += 1
            else:
                master_df = pd.read_csv(str(master_path))
                count_cached = 0
                for _, row in master_df.iterrows():
                    lb_url = row.get("letterboxd_url")
                    if pd.isna(lb_url):
                        continue
                    dates = parse_dates_column(row.get("dates"))
                    for d in dates:
                        if isinstance(d, dict):
                            link = d.get("url_info")
                            if link and link not in url_cache:
                                url_cache[link] = lb_url
                                count_cached += 1

            print(f"  → Cached {count_cached} links")
        except Exception as e:
            print(f"  → Failed to load cache: {e}")

    df = pd.read_csv(input_csv)
    df = match_films(df, skip_existing=skip_existing, url_cache=url_cache)
    
    df.to_csv(output_csv, index=False)
    matched = df["letterboxd_url"].notna().sum()
    print(f"\n✓ Matched {matched}/{len(df)} films → {output_csv}")
    print(f"  Next: python main.py merge --input {output_csv}")



def run_merge(args):
    """Execute the merge command - merge matched CSV into master JSON.

    For new films: fetches full Letterboxd metadata (Selenium) automatically.
    With --backfill: re-fetches metadata for ALL films in the master JSON.
    """
    source_json = args.source
    input_csv = args.input
    output_json = args.output if args.output else source_json
    backfill = args.backfill

    print(f"Merging {input_csv} into {source_json} ...")

    # ── Load master JSON ──────────────────────────────────────────────────
    master_films = read_master_json(source_json)  # list of dicts
    # Build lookup by letterboxd_url
    url_to_idx = {}
    title_to_idx = {}
    for i, film in enumerate(master_films):
        url = film.get("letterboxd_url")
        title = film.get("title")
        if url:
            url_to_idx[url] = i
        if title:
            title_to_idx[title] = i

    # ── Load input CSV ────────────────────────────────────────────────────
    input_df = pd.read_csv(input_csv)

    updated_count = 0
    new_count = 0

    letterboxd_fields = [
        "letterboxd_rating", "letterboxd_viewers", "letterboxd_short_url",
        "tmdb_url",
    ]
    tmdb_fields = [
        "genres", "country", "primary_language", "spoken_languages",
        "runtime_minutes", "title_original", "title_en", "title_es",
    ]
    new_fields = letterboxd_fields + tmdb_fields

    for _, row in input_df.iterrows():
        lb_url = row.get("letterboxd_url")
        title = row.get("title")

        # Parse input dates into standard format
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
            # ── Merge into existing film ──────────────────────────────
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

            # Fill missing metadata from input
            if pd.notna(lb_url) and not master_film.get("letterboxd_url"):
                master_film["letterboxd_url"] = lb_url
                url_to_idx[lb_url] = target_idx

            for field in new_fields:
                input_val = row.get(field)
                if pd.notna(input_val) if isinstance(input_val, float) else input_val:
                    master_val = master_film.get(field)
                    if not master_val:
                        master_film[field] = input_val

        else:
            # ── New film ──────────────────────────────────────────────
            film = {
                "title": title if pd.notna(title) else None,
                "dates": new_dates,
                "director": row.get("director") if pd.notna(row.get("director")) else None,
                "year": int(row["year"]) if pd.notna(row.get("year")) else None,
                "letterboxd_url": lb_url if pd.notna(lb_url) else None,
                "letterboxd_rating": None,
                "letterboxd_viewers": None,
                "letterboxd_short_url": None,
                "genres": [],
                "country": [],
                "primary_language": [],
                "spoken_languages": [],
                "runtime_minutes": None,
                "tmdb_url": None,
                "title_original": None,
                "title_en": None,
                "title_es": None,
            }

            # Copy any fields that came from the rate step
            for field in new_fields:
                input_val = row.get(field)
                if pd.notna(input_val) if isinstance(input_val, float) else input_val:
                    film[field] = input_val

            # Fetch Letterboxd info for new films with a URL
            if film["letterboxd_url"]:
                # We'll batch-fetch below instead of one-by-one
                pass

            idx = len(master_films)
            master_films.append(film)
            if film["letterboxd_url"]:
                url_to_idx[film["letterboxd_url"]] = idx
            if film["title"]:
                title_to_idx[film["title"]] = idx
            new_count += 1

    # ── Batch-fetch Letterboxd metadata ────────────────────────────────────
    # ── Step 1: Letterboxd metadata ────────────────────────────────────
    if backfill:
        # Backfill: re-fetch for ALL films with a letterboxd_url
        lb_urls_to_fetch = []
        lb_indices = []
        for i, film in enumerate(master_films):
            if film.get("letterboxd_url"):
                lb_urls_to_fetch.append(film["letterboxd_url"])
                lb_indices.append(i)
        print(f"\n  Backfilling Letterboxd metadata for {len(lb_urls_to_fetch)} films (Selenium)...")
    else:
        # Default: only fetch for films that have a letterboxd_url but no
        # Letterboxd-specific metadata yet.
        lb_meta_fields = [
            "letterboxd_rating", "letterboxd_viewers", "letterboxd_short_url",
            "tmdb_url",
        ]
        lb_urls_to_fetch = []
        lb_indices = []
        for i, film in enumerate(master_films):
            if not film.get("letterboxd_url"):
                continue
            has_lb_meta = any(
                (film.get(f) not in (None, [], ""))
                for f in lb_meta_fields
            )
            if not has_lb_meta:
                lb_urls_to_fetch.append(film["letterboxd_url"])
                lb_indices.append(i)
        if lb_urls_to_fetch:
            print(f"\n  Fetching Letterboxd metadata for {len(lb_urls_to_fetch)} new films (Selenium)...")

    if lb_urls_to_fetch:
        try:
            infos = fetch_letterboxd_info_batch(lb_urls_to_fetch, use_selenium=True)
            for idx, info in zip(lb_indices, infos):
                for key in letterboxd_fields:
                    val = info.get(key)
                    if val is not None:
                        if isinstance(val, list) and len(val) == 0:
                            continue
                        master_films[idx][key] = val
        except Exception as e:
            print(f"  Error during Letterboxd batch fetch: {e}")

    # ── Step 2: TMDB metadata ─────────────────────────────────────────
    if backfill:
        tmdb_urls_to_fetch = []
        tmdb_indices = []
        for i, film in enumerate(master_films):
            if film.get("tmdb_url"):
                tmdb_urls_to_fetch.append(film["tmdb_url"])
                tmdb_indices.append(i)
        print(f"\n  Backfilling TMDB metadata for {len(tmdb_urls_to_fetch)} films...")
    else:
        tmdb_urls_to_fetch = []
        tmdb_indices = []
        for i, film in enumerate(master_films):
            tmdb_url = film.get("tmdb_url")
            if not tmdb_url:
                continue
            has_tmdb_meta = any(
                (film.get(f) not in (None, [], ""))
                for f in tmdb_fields
            )
            if not has_tmdb_meta:
                tmdb_urls_to_fetch.append(tmdb_url)
                tmdb_indices.append(i)
        if tmdb_urls_to_fetch:
            print(f"\n  Fetching TMDB metadata for {len(tmdb_urls_to_fetch)} films...")

    if tmdb_urls_to_fetch:
        try:
            tmdb_infos = fetch_tmdb_info_batch(tmdb_urls_to_fetch)
            for idx, info in zip(tmdb_indices, tmdb_infos):
                if info is None:
                    continue
                for key in tmdb_fields:
                    val = info.get(key)
                    if val is not None:
                        if isinstance(val, list) and len(val) == 0:
                            continue
                        master_films[idx][key] = val
        except Exception as e:
            print(f"  Error during TMDB batch fetch: {e}")

    # ── Sort by rating and write ──────────────────────────────────────────
    master_films.sort(
        key=lambda f: (f.get("letterboxd_rating") or 0,),
        reverse=True,
    )

    write_master_json(master_films, output_json)
    print(f"\n✓ Merged data saved to {output_json}")
    print(f"  Updates: {updated_count} screening updates/merges")
    print(f"  New: {new_count} films added")
    print(f"  Total: {len(master_films)} films")


def run_new_cinema(args):
    """Execute the new-cinema command."""
    generate_cinema_boilerplate(args.key, args.name, args.url)


if __name__ == "__main__":
    args = parse_args()

    if args.command == "scrape":
        run_scrape(args)
    elif args.command == "match":
        run_match(args)
    elif args.command == "merge":
        run_merge(args)
    elif args.command == "new-cinema":
        run_new_cinema(args)
