from cli import parse_args
import pandas as pd
import theaters

if __name__ == "__main__":
    args = parse_args()

    start_date = args.start_date
    end_date = args.end_date
    theaters_list = args.fetch_from or theaters.all_theaters()

    films = []
    for theater in theaters_list:
        films += theaters.fetch_films(theater, start_date, end_date)

    df = (
        pd.DataFrame(films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
        .to_csv("films.csv", index=False)
    )
