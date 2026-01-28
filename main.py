"""Main entry point for film-calendar."""

from cli import parse_args, generate_cinema_boilerplate
from rate import rate_films
import pandas as pd
import theaters


def run_scrape(args):
    """Execute the scrape command."""
    start_date = args.start_date
    end_date = args.end_date
    theaters_list = args.fetch_from or theaters.all_theaters()
    update_csv = args.update_csv

    fetched_films = []
    for theater in theaters_list:
        fetched_films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(fetched_films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
    )
    df = df[~df["title"].isna()]
    df = rate_films(df)

    if update_csv:
        df_existing_rated_films = pd.read_csv(update_csv)
        df = pd.concat([df_existing_rated_films, df], ignore_index=True)

    output_csv = update_csv or "films_with_letterboxd_url.csv"
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df.drop_duplicates("theater_film_link").sort_values(
        by="letterboxd_rating", ascending=False
    ).to_csv(output_csv, index=False)
    
    print(f"\nOutput saved to: {output_csv}")


def run_new_cinema(args):
    """Execute the new-cinema command."""
    generate_cinema_boilerplate(args.key, args.name, args.url)


if __name__ == "__main__":
    args = parse_args()

    if args.command == "scrape":
        run_scrape(args)
    elif args.command == "new-cinema":
        run_new_cinema(args)
