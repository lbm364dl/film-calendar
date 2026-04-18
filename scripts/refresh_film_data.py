#!/usr/bin/env python3
"""
Refresh film data from Letterboxd and TMDB for currently-screened films.

Two modes:
  1. Full refresh: re-fetch Letterboxd info (rating, viewers via Selenium)
     and TMDB data (crew, keywords, recommendations) for all films with
     future screenings. Use this to update premiere films after ratings
     stabilize.

  2. Viewers-only (--viewers-only): fill in missing letterboxd_viewers for
     films that were added via enrichment (which can't use Selenium).
     Only targets films with NULL letterboxd_viewers.

Usage:
    python scripts/refresh_film_data.py [options]

Options:
    --viewers-only    Only fill missing letterboxd_viewers (faster, no TMDB)
    --limit N         Stop after processing N films
    --dry-run         Print what would be updated without writing to DB

Environment variables (required):
    SUPABASE_URL
    SUPABASE_SECRET_KEY
    TMDB_API_KEY          (not needed with --viewers-only)
"""

import argparse
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from supabase import create_client
from letterboxd.fetch import fetch_letterboxd_info
from letterboxd.browser import create_browser

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
TMDB_KEY = os.environ.get("TMDB_API_KEY") or os.environ.get("TMDB_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Need SUPABASE_URL and SUPABASE_SECRET_KEY env vars")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_film_by_url(letterboxd_url):
    """Get a single film by its Letterboxd URL."""
    cols = "id, title, year, letterboxd_url, letterboxd_viewers, tmdb_url"
    result = supabase.table("films").select(cols).eq("letterboxd_url", letterboxd_url).execute()
    return result.data or []


def get_films(viewers_only=False, recent_years=0, future_only=False):
    """Get films to process, optionally filtered."""
    from datetime import datetime
    batch = 500

    if future_only:
        # Only films with future screenings
        now = datetime.now().strftime("%Y-%m-%d %H:%M:00")
        all_film_ids = set()
        offset = 0
        while True:
            result = supabase.table("screenings").select("film_id").gte("showtime", now).range(offset, offset + batch - 1).execute()
            rows = result.data or []
            for r in rows:
                all_film_ids.add(r["film_id"])
            if len(rows) < batch:
                break
            offset += batch

        if not all_film_ids:
            return []

        films = []
        ids = list(all_film_ids)
        for i in range(0, len(ids), batch):
            chunk = ids[i:i + batch]
            cols = "id, title, year, letterboxd_url, letterboxd_viewers, tmdb_url"
            result = supabase.table("films").select(cols).in_("id", chunk).execute()
            films.extend(result.data or [])
    else:
        # All films in the database
        films = []
        offset = 0
        while True:
            cols = "id, title, year, letterboxd_url, letterboxd_viewers, tmdb_url"
            result = supabase.table("films").select(cols).range(offset, offset + batch - 1).execute()
            rows = result.data or []
            films.extend(rows)
            if len(rows) < batch:
                break
            offset += batch

    if viewers_only:
        films = [f for f in films if not f.get("letterboxd_viewers")]

    if recent_years > 0:
        min_year = datetime.now().year - recent_years
        films = [f for f in films if (f.get("year") or 0) >= min_year]

    return films


def refresh_full(films, dry_run=False):
    """Full refresh: Letterboxd (with Selenium) + TMDB."""
    from tmdb import fetch_tmdb_info

    print(f"Full refresh for {len(films)} films")
    print("Starting browser for Letterboxd viewer counts...")
    browser = create_browser()

    updated = 0
    try:
        for i, film in enumerate(films):
            title = film.get("title", "?")
            lb_url = film.get("letterboxd_url")
            tmdb_url = film.get("tmdb_url")

            print(f"\n[{i+1}/{len(films)}] {title}")

            updates = {}

            # Letterboxd: rating + viewers
            if lb_url:
                print(f"  Fetching Letterboxd: {lb_url}")
                lb_info = fetch_letterboxd_info(lb_url, browser=browser)
                if lb_info.get("letterboxd_rating"):
                    updates["letterboxd_rating"] = lb_info["letterboxd_rating"]
                if lb_info.get("letterboxd_viewers"):
                    updates["letterboxd_viewers"] = lb_info["letterboxd_viewers"]
                if lb_info.get("letterboxd_short_url"):
                    updates["letterboxd_short_url"] = lb_info["letterboxd_short_url"]

            # TMDB: all metadata
            if tmdb_url and TMDB_KEY:
                print(f"  Fetching TMDB: {tmdb_url}")
                tmdb_info = fetch_tmdb_info(tmdb_url)
                if tmdb_info:
                    for key in ["directors", "cinematographers", "composers", "writers",
                                "top_cast", "keywords", "production_companies",
                                "tmdb_rating", "tmdb_votes", "collection_id",
                                "tmdb_recommendations", "poster_path"]:
                        val = tmdb_info.get(key)
                        if val is not None:
                            updates[key] = val
                time.sleep(0.25)  # TMDB rate limit

            if updates:
                if dry_run:
                    print(f"  [dry-run] Would update: {list(updates.keys())}")
                else:
                    supabase.table("films").update(updates).eq("id", film["id"]).execute()
                    print(f"  Updated: {list(updates.keys())}")
                updated += 1
            else:
                print(f"  No updates")

    finally:
        browser.quit()

    print(f"\nDone. Updated {updated}/{len(films)} films.")


def refresh_viewers_only(films, dry_run=False):
    """Fill missing letterboxd_viewers using Selenium."""
    print(f"Viewers-only refresh for {len(films)} films with missing viewer counts")
    print("Starting browser...")
    browser = create_browser()

    updated = 0
    try:
        for i, film in enumerate(films):
            title = film.get("title", "?")
            lb_url = film.get("letterboxd_url")

            if not lb_url:
                print(f"[{i+1}/{len(films)}] {title} — no Letterboxd URL, skipping")
                continue

            print(f"[{i+1}/{len(films)}] {title}...", end=" ", flush=True)
            lb_info = fetch_letterboxd_info(lb_url, browser=browser)

            updates = {}
            if lb_info.get("letterboxd_viewers"):
                updates["letterboxd_viewers"] = lb_info["letterboxd_viewers"]
            if lb_info.get("letterboxd_rating"):
                updates["letterboxd_rating"] = lb_info["letterboxd_rating"]

            if updates:
                if dry_run:
                    print(f"[dry-run] {updates}")
                else:
                    supabase.table("films").update(updates).eq("id", film["id"]).execute()
                    print(f"viewers={updates.get('letterboxd_viewers', '?')}")
                updated += 1
            else:
                print("no data")

    finally:
        browser.quit()

    print(f"\nDone. Updated {updated}/{len(films)} films.")


def main():
    parser = argparse.ArgumentParser(
        description="Refresh film data from Letterboxd and TMDB for screened films"
    )
    parser.add_argument("--viewers-only", action="store_true",
                        help="Only fill missing letterboxd_viewers (no TMDB refresh)")
    parser.add_argument("--future-only", action="store_true",
                        help="Only process films with future screenings (default: all films)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after processing N films (0 = all)")
    parser.add_argument("--recent", type=int, default=0, metavar="YEARS",
                        help="Only process films from the last N years (0 = all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be updated without writing to DB")
    parser.add_argument("--film", type=str,
                        help="Letterboxd URL of a single film to refresh")
    args = parser.parse_args()

    if args.film:
        films = get_film_by_url(args.film)
    else:
        films = get_films(viewers_only=args.viewers_only, recent_years=args.recent, future_only=args.future_only)

    if not films:
        print("No films to process.")
        return

    if args.limit > 0:
        films = films[:args.limit]

    print(f"Found {len(films)} films to process")

    if args.viewers_only:
        refresh_viewers_only(films, dry_run=args.dry_run)
    else:
        if not TMDB_KEY:
            print("Warning: TMDB_API_KEY not set — skipping TMDB refresh")
        refresh_full(films, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
