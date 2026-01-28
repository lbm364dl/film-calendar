"""Main entry point for film-calendar."""

from cli import parse_args, generate_cinema_boilerplate
from rate import match_films, rate_films
import pandas as pd
import theaters


def run_scrape(args):
    """Execute the scrape command - fetch films from theaters (no Letterboxd)."""
    start_date = args.start_date
    end_date = args.end_date
    theaters_list = args.fetch_from or theaters.all_theaters()
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


def run_match(args):
    """Execute the match command - find Letterboxd URLs."""
    input_csv = args.input
    output_csv = args.output
    skip_existing = args.skip_existing

    df = pd.read_csv(input_csv)
    df = match_films(df, skip_existing=skip_existing)
    
    df.to_csv(output_csv, index=False)
    matched = df["letterboxd_url"].notna().sum()
    print(f"\n✓ Matched {matched}/{len(df)} films → {output_csv}")
    print(f"  Next: python main.py rate --input {output_csv}")


def run_rate(args):
    """Execute the rate command - fetch ratings from Letterboxd."""
    input_csv = args.input
    output_csv = args.output

    df = pd.read_csv(input_csv)
    df = rate_films(df)
    
    # Sort by rating (best first)
    df = df.sort_values(by="letterboxd_rating", ascending=False)
    
    df.to_csv(output_csv, index=False)
    rated = df["letterboxd_rating"].notna().sum()
    print(f"\n✓ Rated {rated}/{len(df)} films → {output_csv}")


def run_new_cinema(args):
    """Execute the new-cinema command."""
    generate_cinema_boilerplate(args.key, args.name, args.url)


if __name__ == "__main__":
    args = parse_args()

    if args.command == "scrape":
        run_scrape(args)
    elif args.command == "match":
        run_match(args)
    elif args.command == "rate":
        run_rate(args)
    elif args.command == "new-cinema":
        run_new_cinema(args)
