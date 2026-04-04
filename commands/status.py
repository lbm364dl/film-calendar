"""Status command - show session coverage per theater."""

from collections import defaultdict
from datetime import datetime as _dt

from json_io import read_master_json


def run_status(args):
    """Show session coverage per theater, sorted by last session date (ascending)."""
    master_films = read_master_json(args.source)

    locations = defaultdict(lambda: {"dates": [], "special": 0})

    for film in master_films:
        for d in film.get("dates", []):
            if not isinstance(d, dict):
                continue
            loc = d.get("location", "Unknown")
            ts = d.get("timestamp", "")
            if ts:
                locations[loc]["dates"].append(ts)
            if d.get("special"):
                locations[loc]["special"] += 1

    rows = []
    for loc, info in locations.items():
        parsed = []
        for ts in info["dates"]:
            try:
                parsed.append(_dt.strptime(ts.strip(), "%Y-%m-%d %H:%M"))
            except ValueError:
                try:
                    parsed.append(_dt.strptime(ts.strip(), "%Y-%m-%d"))
                except ValueError:
                    pass
        last = max(parsed).strftime("%Y-%m-%d") if parsed else "N/A"
        rows.append((loc, len(info["dates"]), last, info["special"]))

    rows.sort(key=lambda r: r[2])

    # Print markdown table
    print(f"Session coverage from {args.source} (sorted by urgency)\n")
    print(f"| {'Theater':<25} | {'Sessions':>8} | {'Last Session':<12} | {'Special':>7} |")
    print(f"|{'-' * 27}|{'-' * 10}|{'-' * 14}|{'-' * 9}|")
    for loc, count, last, special in rows:
        sp = str(special) if special else ""
        print(f"| {loc:<25} | {count:>8} | {last:<12} | {sp:>7} |")

    print(f"\nTotal: {sum(r[1] for r in rows)} sessions across {len(rows)} theaters")
