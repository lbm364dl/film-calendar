"""Theater registry and scraper dispatch."""

from fetch_films.dore import fetch_films_from_date_range as fetch_dore_films
from fetch_films.cineteca import fetch_films_from_date_range as fetch_cineteca_films
from fetch_films.cineteca import CinetecaScraper
from fetch_films.dore import DoreScraper

# Function-based registry (backward compatibility)
FETCH_THEATER_FILMS = {
    "dore": fetch_dore_films,
    "cineteca": fetch_cineteca_films,
}

# Class-based registry (new pattern)
SCRAPERS = {
    "dore": DoreScraper(),
    "cineteca": CinetecaScraper(),
}


def all_theaters():
    """Return list of all supported theater keys."""
    return list(FETCH_THEATER_FILMS.keys())


def fetch_films(theater, start_date, end_date):
    """Fetch films from a specific theater for a date range."""
    return FETCH_THEATER_FILMS[theater](start_date, end_date)


def get_scraper(theater_key: str):
    """Get scraper instance by theater key."""
    return SCRAPERS.get(theater_key)
