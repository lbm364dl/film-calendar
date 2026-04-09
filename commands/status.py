"""Status command - show session coverage per theater."""

import os
import sys
from collections import defaultdict
from datetime import datetime as _dt

from dotenv import load_dotenv

load_dotenv()


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


def _fetch_screenings(supabase):
    """Fetch all screenings from Supabase (paginated)."""
    BATCH = 1000
    all_screenings = []
    offset = 0
    while True:
        result = (
            supabase.table("screenings")
            .select("location, showtime, special")
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        if not result.data:
            break
        all_screenings.extend(result.data)
        if len(result.data) < BATCH:
            break
        offset += BATCH
    return all_screenings


def run_status(_args):
    """Show session coverage per theater, sorted by last session date (ascending)."""
    supabase = _init_supabase()
    screenings = _fetch_screenings(supabase)

    locations = defaultdict(lambda: {"dates": [], "special": 0})

    for s in screenings:
        loc = s.get("location", "Unknown")
        showtime = s.get("showtime", "")
        if showtime:
            locations[loc]["dates"].append(showtime)
        if s.get("special"):
            locations[loc]["special"] += 1

    rows = []
    for loc, info in locations.items():
        parsed = []
        for ts in info["dates"]:
            try:
                parsed.append(_dt.fromisoformat(ts))
            except ValueError:
                pass
        last = max(parsed).strftime("%Y-%m-%d") if parsed else "N/A"
        rows.append((loc, len(info["dates"]), last, info["special"]))

    rows.sort(key=lambda r: r[2])

    # Print markdown table
    print(f"Session coverage from Supabase (sorted by urgency)\n")
    print(f"| {'Theater':<25} | {'Sessions':>8} | {'Last Session':<12} | {'Special':>7} |")
    print(f"|{'-' * 27}|{'-' * 10}|{'-' * 14}|{'-' * 9}|")
    for loc, count, last, special in rows:
        sp = str(special) if special else ""
        print(f"| {loc:<25} | {count:>8} | {last:<12} | {sp:>7} |")

    print(f"\nTotal: {sum(r[1] for r in rows)} sessions across {len(rows)} theaters")
