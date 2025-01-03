from dore import fetch_films_from_date_range as fetch_dore_films

FETCH_THEATER_FILMS = {
    "Doré": fetch_dore_films,
}


def all_theaters():
    return FETCH_THEATER_FILMS.keys()


def fetch_films(theater, start_date, end_date):
    return FETCH_THEATER_FILMS[theater](start_date, end_date)
