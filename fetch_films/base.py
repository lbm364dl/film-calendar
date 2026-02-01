"""Base classes and data models for cinema scrapers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dateutil.rrule import rrule, DAILY


@dataclass
class CinemaInfo:
    """Configuration for a cinema."""
    key: str  # Short identifier, e.g., "cineteca"
    name: str  # Display name, e.g., "Cineteca Madrid"
    base_url: str  # Base URL for the cinema website
    update_period: str = "monthly"  # "monthly" or "weekly"


@dataclass
class FilmInfo:
    """Information about a film screening."""
    theater: str
    title: str
    theater_film_link: str
    dates: list[str] = field(default_factory=list)
    director: Optional[str] = None
    year: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for DataFrame compatibility."""
        return asdict(self)


class BaseCinemaScraper(ABC):
    """Abstract base class for cinema scrapers.
    
    Subclasses must implement:
    - cinema_info: property returning CinemaInfo
    - build_day_url: construct URL for a specific date
    - parse_films_list: extract film URLs from a day listing page
    - parse_film_page: extract film info from a film detail page
    """
    
    HEADERS = {"User-Agent": "Chrome/131.0.0.0"}

    @property
    @abstractmethod
    def cinema_info(self) -> CinemaInfo:
        """Return cinema configuration."""
        pass

    @abstractmethod
    def build_day_url(self, date: datetime) -> str:
        """Construct the URL for fetching films on a specific date."""
        pass

    @abstractmethod
    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Parse a day listing page and return a list of film detail URLs.
        
        Args:
            html: Raw HTML of the day listing page
            date: The date being queried
            
        Returns:
            List of URLs to individual film pages
        """
        pass

    @abstractmethod
    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Parse a film detail page and return film information.
        
        Args:
            html: Raw HTML of the film detail page
            film_url: URL of this film page
            date: The date context for this query
            
        Returns:
            FilmInfo dataclass with parsed film data
        """
        pass

    def fetch_html(self, url: str) -> str:
        """Fetch HTML from a URL. Override for custom behavior."""
        response = requests.get(url, headers=self.HEADERS)
        return response.text

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films between start_date and end_date.
        
        This is the main entry point. It iterates through dates,
        fetches listings, and parses film pages.
        """
        films = []
        for day in rrule(DAILY, dtstart=start_date, until=end_date):
            print(f"Checking day {day.date()}...")
            films.extend(self.fetch_films_for_day(day))
        return films

    def fetch_films_for_day(self, day: datetime) -> list[dict]:
        """Fetch all films for a single day."""
        url = self.build_day_url(day)
        print(f"Fetching films from url {url}")
        
        html = self.fetch_html(url)
        film_urls = self.parse_films_list(html, day)
        
        films_info = []
        for film_url in film_urls:
            film_html = self.fetch_html(film_url)
            film_info = self.parse_film_page(film_html, film_url, day)
            films_info.append(film_info.to_dict())
            print(f"\tFetched film {film_info.title}")
        
        return films_info
