from fetch_films.dore import fetch_films_from_date_range as fetch_dore_films
from fetch_films.cineteca import fetch_films_from_date_range as fetch_cineteca_films

FETCH_THEATER_FILMS = {
    "dore": fetch_dore_films,
    "cineteca": fetch_cineteca_films,
}


def all_theaters():
    return list(FETCH_THEATER_FILMS.keys())


def fetch_films(theater, start_date, end_date):
    return FETCH_THEATER_FILMS[theater](start_date, end_date)
