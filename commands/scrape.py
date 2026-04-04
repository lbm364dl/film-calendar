"""Scrape command: fetch films from theaters (no Letterboxd)."""

import pandas as pd
import theaters


def run_scrape(args):
    """Execute the scrape command."""
    start_date = args.start_date
    end_date = args.end_date

    if args.fetch_from:
        theaters_list = args.fetch_from
    elif args.period:
        theaters_list = theaters.get_theaters_by_period(args.period)
    else:
        theaters_list = theaters.all_theaters()
    output_csv = args.output

    fetched_films = []
    for theater in theaters_list:
        fetched_films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(fetched_films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
    )
    df = df[~df["title"].isna()]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

    df.to_csv(output_csv, index=False)
    print(f"\n✓ Scraped {len(df)} films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")
