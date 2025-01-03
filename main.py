from cli import parse_args
import pandas as pd
import theaters

if __name__ == "__main__":
    args = parse_args()
    print(args)

    start_date = args.start_date
    end_date = args.end_date

    films = []
    for theater in theaters.all_theaters():
        films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
        .to_csv("films.csv", index=False)
    )
