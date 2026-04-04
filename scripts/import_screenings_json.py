#!/usr/bin/env python3
"""
Import screenings.json into Supabase, completing missing TMDB enrichment fields.

The JSON format (docs/screenings.json) has basic film info but lacks the richer
TMDB fields added later (directors JSONB, top_cast, keywords, tmdb_rating,
tmdb_votes, production_companies, collection, overview, tagline, tmdb_id).
This script imports everything from the JSON and fetches the rest from TMDB.

Usage:
    python scripts/import_screenings_json.py [options]

Options:
    --json PATH       Path to JSON file (default: docs/screenings.json)
    --skip-tmdb       Don't fetch from TMDB (faster, only imports JSON fields)
    --dry-run         Print what would be inserted without writing to the DB
    --delay SECS      Delay between TMDB requests in seconds (default: 0.3)

Environment variables (required unless --dry-run):
    SUPABASE_URL
    SUPABASE_SECRET_KEY
    TMDB_API_KEY  (required unless --skip-tmdb)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()

MADRID_TZ = ZoneInfo("Europe/Madrid")


def parse_timestamp(ts: str) -> str:
    """Convert 'YYYY-MM-DD HH:MM' (Madrid local time) to ISO 8601 with offset."""
    dt = datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M").replace(tzinfo=MADRID_TZ)
    return dt.isoformat()


def build_film_row(film: dict, tmdb_info: dict | None) -> dict:
    """Build a films table row from JSON data, optionally merged with TMDB info."""
    row: dict = {
        "title": film.get("title"),
        "letterboxd_url": film.get("letterboxd_url"),
        "letterboxd_short_url": film.get("letterboxd_short_url"),
        "letterboxd_rating": film.get("letterboxd_rating"),
        "letterboxd_viewers": film.get("letterboxd_viewers"),
        "tmdb_url": film.get("tmdb_url"),
    }

    if tmdb_info:
        # TMDB is the authoritative source for all structured metadata
        row.update({
            "tmdb_id": tmdb_info.get("tmdb_id"),
            "year": tmdb_info.get("year") or film.get("year"),
            "genres": tmdb_info.get("genres") or film.get("genres", []),
            "country": tmdb_info.get("country") or film.get("country", []),
            "primary_language": tmdb_info.get("primary_language") or film.get("primary_language", []),
            "spoken_languages": tmdb_info.get("spoken_languages") or film.get("spoken_languages", []),
            "runtime_minutes": tmdb_info.get("runtime_minutes") or film.get("runtime_minutes"),
            "title_original": tmdb_info.get("title_original") or film.get("title_original"),
            "title_en": tmdb_info.get("title_en") or film.get("title_en"),
            "title_es": tmdb_info.get("title_es") or film.get("title_es"),
            "directors": tmdb_info.get("directors", []),
            "director": (tmdb_info.get("directors") or [{}])[0].get("name") or film.get("director"),
            "top_cast": tmdb_info.get("top_cast", []),
            "keywords": tmdb_info.get("keywords", []),
            "tmdb_rating": tmdb_info.get("tmdb_rating"),
            "tmdb_votes": tmdb_info.get("tmdb_votes"),
            "production_companies": tmdb_info.get("production_companies", []),
            "collection_name": tmdb_info.get("collection_name"),
            "collection_id": tmdb_info.get("collection_id"),
            "overview": tmdb_info.get("overview"),
            "tagline": tmdb_info.get("tagline"),
        })
    else:
        # No TMDB fetch — use whatever is in the JSON
        row.update({
            "year": film.get("year"),
            "genres": film.get("genres", []),
            "country": film.get("country", []),
            "primary_language": film.get("primary_language", []),
            "spoken_languages": film.get("spoken_languages", []),
            "runtime_minutes": film.get("runtime_minutes"),
            "title_original": film.get("title_original"),
            "title_en": film.get("title_en"),
            "title_es": film.get("title_es"),
            "director": film.get("director"),
        })

    return row


def main():
    parser = argparse.ArgumentParser(description="Import screenings.json into Supabase")
    parser.add_argument("--json", default="docs/screenings.json", help="Path to JSON file")
    parser.add_argument("--skip-tmdb", action="store_true", help="Skip TMDB enrichment")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    parser.add_argument("--delay", type=float, default=0.3, help="Delay between TMDB requests (seconds)")
    args = parser.parse_args()

    # Load JSON
    with open(args.json, "r", encoding="utf-8") as f:
        films_data = json.load(f)
    print(f"Loaded {len(films_data)} films from {args.json}")

    # Set up TMDB if needed
    fetch_tmdb = not args.skip_tmdb
    if fetch_tmdb:
        try:
            sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
            from tmdb import fetch_tmdb_info
        except ImportError:
            print("Could not import tmdb.py — run from the project root or use --skip-tmdb")
            sys.exit(1)

    # Set up Supabase if not dry-run
    supabase = None
    if not args.dry_run:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            print("Set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
            sys.exit(1)
        try:
            from supabase import create_client
            supabase = create_client(url, key)
        except ImportError:
            print("Install supabase-py:  pip install supabase")
            sys.exit(1)

    films_upserted = 0
    screenings_upserted = 0
    tmdb_fetched = 0
    tmdb_failed = 0

    for i, film in enumerate(films_data):
        title = film.get("title") or film.get("title_original") or "(unknown)"
        short_url = film.get("letterboxd_short_url")
        tmdb_url = film.get("tmdb_url")

        print(f"[{i+1}/{len(films_data)}] {title}")

        # Fetch TMDB enrichment
        tmdb_info = None
        if fetch_tmdb and tmdb_url:
            try:
                tmdb_info = fetch_tmdb_info(tmdb_url)
                if tmdb_info:
                    tmdb_fetched += 1
                else:
                    print(f"  Warning: TMDB returned nothing for {tmdb_url}")
                    tmdb_failed += 1
                if i < len(films_data) - 1:
                    time.sleep(args.delay)
            except Exception as e:
                print(f"  TMDB error: {e}")
                tmdb_failed += 1
        elif fetch_tmdb and not tmdb_url:
            print("  No TMDB URL — skipping enrichment")

        film_row = build_film_row(film, tmdb_info)

        if args.dry_run:
            print(f"  [dry-run] Would upsert film: {film_row.get('title')} "
                  f"(tmdb_id={film_row.get('tmdb_id')}, "
                  f"directors={film_row.get('directors', 'n/a')})")
            for d in film.get("dates", []):
                print(f"  [dry-run] Would upsert screening: {d.get('timestamp')} @ {d.get('location')}")
            continue

        # Upsert film
        try:
            result = supabase.table("films").upsert(
                film_row,
                on_conflict="letterboxd_short_url" if short_url else None,
            ).execute()
            film_id = result.data[0]["id"]
            films_upserted += 1
        except Exception as e:
            print(f"  Error upserting film: {e}")
            continue

        # Upsert screenings
        for d in film.get("dates", []):
            ts = d.get("timestamp", "")
            if not ts:
                continue
            screening_row = {
                "film_id": film_id,
                "showtime": parse_timestamp(ts),
                "location": d.get("location", "Unknown"),
                "url_tickets": d.get("url_tickets", ""),
                "url_info": d.get("url_info", ""),
                "version": d.get("version"),
            }
            try:
                supabase.table("screenings").upsert(
                    screening_row,
                    on_conflict="film_id,showtime,location",
                ).execute()
                screenings_upserted += 1
            except Exception as e:
                print(f"  Warning: screening {ts} @ {d.get('location')}: {e}")

    print(f"\nDone!")
    if not args.dry_run:
        print(f"  Films upserted:      {films_upserted}")
        print(f"  Screenings upserted: {screenings_upserted}")
    if fetch_tmdb:
        print(f"  TMDB fetched:        {tmdb_fetched}")
        if tmdb_failed:
            print(f"  TMDB failed:         {tmdb_failed}")


if __name__ == "__main__":
    main()
