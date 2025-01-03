from cli import parse_args
import pandas as pd
import theaters

if __name__ == "__main__":


    films = []
    for theater in theaters.all_theaters():
        films += theaters.fetch_films(theater, start_date, end_date)

start_date = date(2024, 12, 1)
end_date = date(2024, 12, 31)
    df = (
        pd.DataFrame(films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
        .to_csv("films.csv", index=False)
    )
