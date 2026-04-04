"""Match command: find Letterboxd URLs for scraped films."""

from pathlib import Path

import pandas as pd

from json_io import read_master_json, parse_dates_column
from rate import match_films


def run_match(args):
    """Execute the match command."""
    input_csv = args.input
    output_csv = args.output
    skip_existing = args.skip_existing

    url_cache = {}
    master_path = Path(args.cache) if args.cache else None

    if master_path and master_path.exists():
        print(f"Loading cache from {master_path} ...")
        try:
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
