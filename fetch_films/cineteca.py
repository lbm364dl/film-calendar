"""Cineteca Madrid scraper implementation."""

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class CinetecaScraper(BaseCinemaScraper):
    """Scraper for Cineteca Madrid."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="cineteca",
            name="Cineteca Madrid",
            base_url="https://www.cinetecamadrid.com",
        )

    def build_day_url(self, date: datetime) -> str:
        return f"{self.cinema_info.base_url}/programacion?to={date.date()}&since={date.date()}"

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Parse day listing page and return film detail URLs."""
        soup = BeautifulSoup(html, features="html.parser")
        return [
            urljoin(self.cinema_info.base_url, film["href"])
            for h2 in soup.findAll("h2", class_="title")
            for film in h2.findAll("a")
        ]

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Parse a film detail page and extract film information."""
        soup = BeautifulSoup(html, features="html.parser")
        
        film_dates = self._get_film_dates(soup, date)
        film_details = soup.find("div", class_="tit-ficha")
        
        film_title = film_details.find("h2", class_="title").text.strip()
        
        film_year_elem = film_details.find("div", class_=re.compile(r"ano-filmacion"))
        film_year = film_year_elem.text.strip() if film_year_elem else None
        
        film_director_elem = film_details.find("div", class_=re.compile(r"director"))
        film_director = film_director_elem.text.strip() if film_director_elem else None

        return FilmInfo(
            theater=self.cinema_info.name,
            title=film_title,
            director=film_director,
            year=film_year,
            theater_film_link=film_url,
            dates=film_dates,
        )

    def _get_film_dates(self, soup: BeautifulSoup, date: datetime) -> list[str]:
        """Extract screening dates from film detail page."""
        dates_section = soup.find(class_="sb-sessions__items")
        if not dates_section:
            return []
            
        days = [
            day.text.split(" ")[1]
            for day in dates_section.findAll("h4", class_="sb-sessions__date-day")
        ]
        hours = [
            hour.text.split(" ")[0]
            for hour in dates_section.findAll("li", class_="sb-sessions__date-hours-hour")
        ]
        return [
            f"{date.year:04}-{date.month:02}-{int(day):02} {hour}"
            for day, hour in zip(days, hours)
        ]


# Backward compatibility: keep the function interface
_scraper = CinetecaScraper()


def fetch_films_from_date_range(start_date: datetime, end_date: datetime) -> list[dict]:
    """Fetch films from Cineteca Madrid for a date range.
    
    This function is kept for backward compatibility with theaters.py.
    """
    return _scraper.fetch_films_from_date_range(start_date, end_date)
