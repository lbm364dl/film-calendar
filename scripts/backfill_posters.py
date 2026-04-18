#!/usr/bin/env python3
"""
Backfill TMDB poster_path for films that already have a tmdb_url / tmdb_id
but no poster_path yet.

One-time, idempotent: re-running only hits films where poster_path IS NULL.
Safe to interrupt and resume.

Usage:
    python scripts/backfill_posters.py [--limit N] [--dry-run] [--delay SECONDS]

Options:
    --limit N         Stop after processing N films
    --dry-run         Print what would be updated without writing to DB
    --delay SECONDS   Sleep between TMDB calls (default 0.25s — 40 req/10s)

Environment variables (required):
    SUPABASE_URL          or NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SECRET_KEY   or SUPABASE_KEY
    TMDB_API_KEY
"""

import argparse
import os
import sys
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from supabase import create_client
from tmdb import fetch_tmdb_info

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
TMDB_KEY = os.environ.get("TMDB_API_KEY") or os.environ.get("TMDB_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Need SUPABASE_URL and SUPABASE_SECRET_KEY env vars", file=sys.stderr)
    sys.exit(1)

if not TMDB_KEY:
    print("Need TMDB_API_KEY env var", file=sys.stderr)
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_films_without_poster(limit=None):
    """Fetch films that have a TMDB URL but no poster_path yet.

    Paginates server-side to bypass Supabase's default 1000-row cap.
    """
    batch = 1000
    out: list[Any] = []
    offset = 0
    cols = "id, title, year, tmdb_url"

    while True:
        result = (
            supabase.table("films")
            .select(cols)
            .is_("poster_path", "null")
            .not_.is_("tmdb_url", "null")
            .neq("tmdb_url", "")
            .order("id")
            .range(offset, offset + batch - 1)
            .execute()
        )
        rows = result.data or []
        out.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
        if limit is not None and len(out) >= limit:
            break

    if limit is not None:
        out = out[:limit]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None,
                        help="Stop after processing N films")
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't write to the DB")
    parser.add_argument("--delay", type=float, default=0.25,
                        help="Seconds between TMDB calls (default 0.25)")
    args = parser.parse_args()

    films = get_films_without_poster(limit=args.limit)
    total = len(films)
    if total == 0:
        print("Nothing to backfill — all films with a tmdb_url already have poster_path.")
        return 0

    print(f"Backfilling poster_path for {total} film(s). "
          f"Est. runtime: ~{total * args.delay / 60:.1f} min.")
    if args.dry_run:
        print("[dry-run] No DB writes will be performed.")

    updated = 0
    missing = 0  # TMDB returned no poster_path (rare)
    failed = 0   # TMDB call itself failed

    for i, film in enumerate(films, 1):
        title = film.get("title") or "?"
        tmdb_url = film.get("tmdb_url") or ""
        print(f"[{i}/{total}] {title}")

        info = fetch_tmdb_info(tmdb_url)
        if info is None:
            print("  ✗ TMDB fetch failed")
            failed += 1
            time.sleep(args.delay)
            continue

        poster_path = info.get("poster_path")
        if not poster_path:
            print("  · no poster available")
            missing += 1
            time.sleep(args.delay)
            continue

        if args.dry_run:
            print(f"  [dry-run] would set poster_path={poster_path}")
        else:
            supabase.table("films").update({"poster_path": poster_path}).eq("id", film["id"]).execute()
            print(f"  ✓ poster_path={poster_path}")

        updated += 1
        time.sleep(args.delay)

    print()
    print(f"Done. Updated {updated}/{total} "
          f"(no poster: {missing}, fetch failed: {failed}).")
    if not args.dry_run and updated > 0:
        print("Next: POST /api/screenings?secret=$REVALIDATE_SECRET to clear the Next.js cache.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
