#!/usr/bin/env python3
"""Backfill cinematographer, composer, writer data from TMDB for existing films."""

import os
import sys
import time
import requests
from supabase import create_client

TMDB_KEY = os.environ.get("TMDB_API_KEY") or os.environ.get("TMDB_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")

if not all([TMDB_KEY, SUPABASE_URL, SUPABASE_KEY]):
    print("Need TMDB_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY env vars")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_crew_and_recs(tmdb_id: int) -> dict:
    """Fetch crew and recommendations from TMDB in one call."""
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    resp = requests.get(url, params={
        "api_key": TMDB_KEY,
        "append_to_response": "credits,recommendations",
    }, timeout=10)
    if resp.status_code != 200:
        return {}
    data = resp.json()
    crew = data.get("credits", {}).get("crew", [])

    cinematographers = []
    composers = []
    writers = []
    writer_jobs = {"Writer", "Screenplay", "Story", "Novel"}
    seen_writers = set()

    for m in crew:
        if m.get("job") == "Director of Photography" and m.get("id") and m.get("name"):
            if len(cinematographers) < 2:
                cinematographers.append({"id": m["id"], "name": m["name"]})
        elif m.get("job") == "Original Music Composer" and m.get("id") and m.get("name"):
            if len(composers) < 2:
                composers.append({"id": m["id"], "name": m["name"]})
        elif m.get("job") in writer_jobs and m.get("id") and m.get("name"):
            if m["id"] not in seen_writers and len(writers) < 3:
                writers.append({"id": m["id"], "name": m["name"]})
                seen_writers.add(m["id"])

    # TMDB recommendations (top 10 TMDB IDs)
    tmdb_recommendations = [
        r["id"]
        for r in data.get("recommendations", {}).get("results", [])[:10]
        if r.get("id")
    ]

    return {
        "cinematographers": cinematographers,
        "composers": composers,
        "writers": writers,
        "tmdb_recommendations": tmdb_recommendations,
    }

def main():
    # Get all films with TMDB URLs but no crew data (paginate to avoid 1000-row limit)
    films = []
    offset = 0
    QUERY_BATCH = 500
    while True:
        result = supabase.table("films").select("id, tmdb_url").eq("cinematographers", []).range(offset, offset + QUERY_BATCH - 1).execute()
        batch = result.data or []
        films.extend(batch)
        if len(batch) < QUERY_BATCH:
            break
        offset += QUERY_BATCH
    print(f"Found {len(films)} films to backfill")

    updated = 0
    skipped = 0
    for i, film in enumerate(films):
        tmdb_url = film.get("tmdb_url", "")
        if not tmdb_url:
            skipped += 1
            continue

        # Extract TMDB ID from URL like "https://www.themoviedb.org/movie/1955/"
        parts = tmdb_url.rstrip("/").split("/")
        try:
            tmdb_id = int(parts[-1])
        except (ValueError, IndexError):
            skipped += 1
            continue

        crew = fetch_crew_and_recs(tmdb_id)
        if not any(crew.values()):
            skipped += 1
            continue

        supabase.table("films").update(crew).eq("id", film["id"]).execute()
        updated += 1

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(films)} (updated: {updated}, skipped: {skipped})")

        time.sleep(0.25)  # TMDB rate limit

    print(f"Done. Updated: {updated}, Skipped: {skipped}")

if __name__ == "__main__":
    main()
