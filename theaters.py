"""Theater registry and scraper dispatch."""

from fetch_films.cineteca import CinetecaScraper
from fetch_films.dore import DoreScraper
from fetch_films.renoir import RenoirScraper
from fetch_films.golem import GolemScraper

# Class-based registry (new pattern)
SCRAPERS = {
    "dore": DoreScraper(),
    "cineteca": CinetecaScraper(),
    "renoir": RenoirScraper(),
    "golem": GolemScraper(),
}


def all_theaters():
    """Return list of all supported theater keys."""
    return list(SCRAPERS.keys())


def fetch_films(theater, start_date, end_date):
    """Fetch films from a specific theater for a date range."""
    if theater not in SCRAPERS:
        raise ValueError(f"Unknown theater: {theater}")
    return SCRAPERS[theater].fetch_films_from_date_range(start_date, end_date)


def get_scraper(theater_key: str):
    """Get scraper instance by theater key."""
    return SCRAPERS.get(theater_key)


def get_theaters_by_period(period: str) -> list[str]:
    """Get list of theater keys for a specific update period."""
    return [
        key for key, scraper in SCRAPERS.items() 
        if scraper.cinema_info.update_period == period
    ]
