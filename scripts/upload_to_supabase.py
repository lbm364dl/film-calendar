#!/usr/bin/env python3
"""
Upload screenings.json data to Supabase.

Usage:
    pip install supabase python-dotenv
    export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
    export SUPABASE_SECRET_KEY="sb_secret_..."
    python scripts/upload_to_supabase.py [--json docs/screenings.json] [--clear]

Flags:
    --json   Path to screenings.json (default: docs/screenings.json)
    --clear  Delete all existing data before uploading
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    from supabase import create_client, Client
except ImportError:
    print("Install supabase-py first:  pip install supabase python-dotenv")
    sys.exit(1)


def parse_timestamp(ts: str) -> str:
    """Convert 'YYYY-MM-DD HH:MM' to ISO 8601 with Madrid timezone offset."""
    # Assume Madrid local time (CET/CEST). For simplicity, store as-is
    # with a fixed offset. A production system might use pytz.
    try:
        dt = datetime.strptime(ts.strip(), "%Y-%m-%d %H:%M")
        # Store as UTC-naive ISO string; Supabase TIMESTAMPTZ will interpret
        # based on your project timezone setting (set to Europe/Madrid).
        return dt.isoformat()
    except ValueError:
        return ts


def main():
    parser = argparse.ArgumentParser(description="Upload screenings.json to Supabase")
    parser.add_argument("--json", default="docs/screenings.json", help="Path to screenings.json")
    parser.add_argument("--clear", action="store_true", help="Delete all existing data first")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        print("  SUPABASE_URL = your project URL  (Dashboard → Settings → API)")
        print("  SUPABASE_SECRET_KEY = secret key (Dashboard → Settings → API)")
        print("  (Legacy fallback also supported: SUPABASE_SERVICE_KEY)")
        sys.exit(1)

    supabase: Client = create_client(url, key)

    # Load JSON
    with open(args.json, "r", encoding="utf-8") as f:
        films_data = json.load(f)

    print(f"Loaded {len(films_data)} films from {args.json}")

    # Optionally clear existing data
    if args.clear:
        print("Clearing existing data...")
        # Delete screenings first (foreign key), then films
        supabase.table("screenings").delete().neq("id", 0).execute()
        supabase.table("films").delete().neq("id", 0).execute()
        print("  Cleared.")

    # Upload films and their screenings
    uploaded_films = 0
    uploaded_screenings = 0
    skipped = 0

    for film in films_data:
        title = film.get("title")
        if not title:
            skipped += 1
            continue

        # Check if film already exists (by letterboxd_short_url or title+director)
        lb_short = film.get("letterboxd_short_url")
        existing = None
        if lb_short:
            result = supabase.table("films").select("id").eq("letterboxd_short_url", lb_short).execute()
            if result.data:
                existing = result.data[0]

        if not existing:
            # Try title + director match
            director = film.get("director", "")
            result = (
                supabase.table("films")
                .select("id")
                .eq("title", title)
                .eq("director", director)
                .execute()
            )
            if result.data:
                existing = result.data[0]

        film_row = {
            "title": title,
            "director": film.get("director"),
            "year": film.get("year"),
            "letterboxd_url": film.get("letterboxd_url"),
            "letterboxd_short_url": film.get("letterboxd_short_url"),
            "letterboxd_rating": film.get("letterboxd_rating"),
            "letterboxd_viewers": film.get("letterboxd_viewers"),
            "genres": film.get("genres", []),
            "country": film.get("country", []),
            "primary_language": film.get("primary_language", []),
            "spoken_languages": film.get("spoken_languages", []),
            "tmdb_url": film.get("tmdb_url"),
            "title_original": film.get("title_original"),
            "title_en": film.get("title_en"),
            "title_es": film.get("title_es"),
            "runtime_minutes": film.get("runtime_minutes"),
        }

        if existing:
            film_id = existing["id"]
            # Update the film metadata
            supabase.table("films").update(film_row).eq("id", film_id).execute()
        else:
            result = supabase.table("films").insert(film_row).execute()
            film_id = result.data[0]["id"]
            uploaded_films += 1

        # Upload screenings (upsert to avoid duplicates)
        dates = film.get("dates", [])
        for d in dates:
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
                    on_conflict="film_id,showtime,location"
                ).execute()
                uploaded_screenings += 1
            except Exception as e:
                print(f"  Warning: could not insert screening for '{title}' at {ts}: {e}")

    print(f"\n✓ Done!")
    print(f"  New films inserted:  {uploaded_films}")
    print(f"  Screenings upserted: {uploaded_screenings}")
    if skipped:
        print(f"  Skipped (no title):  {skipped}")


if __name__ == "__main__":
    main()
