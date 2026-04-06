"""Match command: find Letterboxd URLs for scraped films."""

import os
import sys

import pandas as pd
from dotenv import load_dotenv

from rate import match_films

load_dotenv()

PAGE_SIZE = 1000


def _load_cache_from_supabase():
    """Load caches from Supabase for matching.

    Returns:
        url_cache: theater_film_link (url_info) → letterboxd_url
        title_cache: film title → letterboxd_url
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("  Warning: SUPABASE_URL / SUPABASE_SECRET_KEY not set, skipping cache")
        return {}, {}

    try:
        from supabase import create_client
        supabase = create_client(url, key)
    except ImportError:
        print("  Warning: supabase-py not installed, skipping cache")
        return {}, {}

    # 1. Build title → letterboxd_url from films table (paginated)
    title_cache = {}
    offset = 0
    while True:
        result = (
            supabase.table("films")
            .select("title, letterboxd_url")
            .not_.is_("letterboxd_url", "null")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            title = row.get("title")
            lb_url = row.get("letterboxd_url")
            if title and lb_url:
                title_cache[title] = lb_url
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    # 2. Build url_info → letterboxd_url from screenings+films (paginated)
    url_cache = {}
    offset = 0
    while True:
        result = (
            supabase.table("screenings")
            .select("url_info, films!inner(letterboxd_url)")
            .not_.is_("url_info", "null")
            .neq("url_info", "")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            url_info = row.get("url_info")
            film = row.get("films")
            if not url_info or not film:
                continue
            lb_url = film.get("letterboxd_url") if isinstance(film, dict) else None
            if lb_url and url_info not in url_cache:
                url_cache[url_info] = lb_url
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return url_cache, title_cache


def run_match(args):
    """Execute the match command."""
    input_csv = args.input
    output_csv = args.output
    skip_existing = args.skip_existing

    print("Loading cache from Supabase ...")
    url_cache, title_cache = _load_cache_from_supabase()
    print(f"  → Cached {len(url_cache)} links, {len(title_cache)} titles")

    df = pd.read_csv(input_csv)
    df = match_films(df, skip_existing=skip_existing, url_cache=url_cache, title_cache=title_cache)

    df.to_csv(output_csv, index=False)
    matched = df["letterboxd_url"].notna().sum()
    print(f"\n✓ Matched {matched}/{len(df)} films → {output_csv}")
    print(f"  Next: python main.py merge --input {output_csv}")
