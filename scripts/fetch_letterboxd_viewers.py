#!/usr/bin/env python3
"""
Fetch Letterboxd viewer (watch) counts for films and update the database.

Viewer counts are JavaScript-rendered behind Cloudflare, so this script uses
undetected-chromedriver (a real Chrome browser) to scrape them.
Run this manually when you want to refresh viewer counts.

Usage:
    python scripts/fetch_letterboxd_viewers.py [options]

Options:
    --only-missing           Only process films that have no letterboxd_viewers yet (NULL or 0)
    --only-active            Only process films with missing viewers AND current/future screenings (>= today)
    --limit N                Stop after updating N films
    --dry-run                Print scraped counts without writing to DB

Environment variables (required):
    SUPABASE_URL
    SUPABASE_SECRET_KEY
"""

import argparse
from datetime import datetime, timezone
import os
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from rate import fetch_viewers_batch


def main():
    parser = argparse.ArgumentParser(description="Fetch Letterboxd viewer counts")
    parser.add_argument("--only-missing", action="store_true",
                        help="Only process films without a viewer count (NULL or 0)")
    parser.add_argument("--only-active", action="store_true",
                        help="Only process films with missing viewers AND current/future screenings (>= today)")
    parser.add_argument("--limit", type=int, default=0, help="Max films to process")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print counts without writing to DB")
    args = parser.parse_args()

    # Set up Supabase (always required)
    db_url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not db_url or not key:
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        sys.exit(1)
    try:
        from supabase import create_client
        supabase = create_client(db_url, key)
    except ImportError:
        print("Install supabase-py:  pip install supabase")
        sys.exit(1)

    # Always exclude films without a Letterboxd URL (can't scrape them)
    query = (
        supabase.table("films")
        .select("id, title, letterboxd_url, letterboxd_viewers")
        .not_.is_("letterboxd_url", "null")
    )
    if args.only_missing or args.only_active:
        query = query.or_("letterboxd_viewers.is.null,letterboxd_viewers.eq.0")
    result = query.order("id").execute()
    films = result.data

    # If --only-active, filter to films with current/future screenings
    if args.only_active and films:
        today = datetime.now(timezone.utc).date()
        film_ids = [f["id"] for f in films if f and "id" in f]
        if film_ids:
            screenings = (
                supabase.table("screenings")
                .select("film_id")
                .in_("film_id", film_ids)
                .gte("showtime", today.isoformat())
                .execute()
            )
            active_film_ids = {s["film_id"] for s in (screenings.data or []) if s and "film_id" in s}
            films = [f for f in films if f["id"] in active_film_ids]
        else:
            films = []

        if not films:
            print(f"No films with missing viewers and screenings >= {today}.")
            return

    if args.limit:
        films = films[: args.limit]

    if not films:
        print("No films to process.")
        return

    print(f"Processing {len(films)} films...")

    urls = [f["letterboxd_url"] for f in films]
    counts = fetch_viewers_batch(urls)
    total = len(films)

    updated = 0
    failed = 0

    for i, (film, count) in enumerate(zip(films, counts), 1):
        title = film.get("title", "(unknown)")
        if count is None:
            print(f"[{i}/{total}] {title} ... FAILED")
            failed += 1
        else:
            print(f"[{i}/{total}] {title} ... {count:,}")
            if not args.dry_run:
                try:
                    supabase.table("films").update(
                        {"letterboxd_viewers": count}
                    ).eq("id", film["id"]).execute()
                    updated += 1
                except Exception as e:
                    print(f"    DB update error: {e}")
                    failed += 1
            else:
                updated += 1

    print(f"\nDone! Updated: {updated}, Failed: {failed}")


if __name__ == "__main__":
    main()
