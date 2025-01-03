from cli import parse_args
from rate import rate_films
import pandas as pd
import theaters

if __name__ == "__main__":
    args = parse_args()

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

    if False:
        df.to_csv("films.csv", index=False)

    df = rate_films(df)

    if update_csv:
        df_existing_rated_films = pd.read_csv(update_csv)
        df = pd.concat([df, df_existing_rated_films], ignore_index=True)

    output_csv = update_csv or "films_with_letterboxd_url.csv"
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df.sort_values(by="letterboxd_rating", ascending=False).drop_duplicates(
        "theater_film_link"
    ).to_csv(output_csv, index=False)
