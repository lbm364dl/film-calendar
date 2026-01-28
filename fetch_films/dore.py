"""Cine Doré scraper implementation.

NOTE: This scraper needs to be updated for the new website structure.
The parsing logic is currently broken and will be fixed when HTML samples
are provided by the user.
"""

import re
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dateutil.rrule import rrule, DAILY

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class DoreScraper(BaseCinemaScraper):
    """Scraper for Cine Doré (Filmoteca Española).
    
    TODO: Update parsing logic for new website structure.
    """

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="dore",
            name="Cine doré",
            base_url="https://entradasfilmoteca.gob.es",
        )

    def build_day_url(self, date: datetime) -> str:
        return f"{self.cinema_info.base_url}/Busqueda.aspx?fecha={date.date()}"

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Parse day listing page and return film detail URLs.
        
        TODO: Update for new website structure.
        """
        soup = BeautifulSoup(html, features="html.parser")
        return [
            urljoin(self.cinema_info.base_url, film["href"].replace("ListaSesiones", "FichaPelicula"))
            for film in soup.findAll("a", string="Comprar")
        ]

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Parse a film detail page and extract film information.
        
        TODO: Update for new website structure.
        """
        soup = BeautifulSoup(html, features="html.parser")
        
        film_dates = self._get_film_dates(soup)
        film_details = soup.find(id="textoFicha")
        
        if not film_details or not film_details.h2:
            # Fallback for pages without expected structure
            title = soup.h1.text.strip() if soup.h1 else "Unknown"
            return FilmInfo(
                theater=self.cinema_info.name,
                title=title,
                director=None,
                year=None,
                theater_film_link=film_url,
                dates=film_dates,
            )

        h2 = film_details.h2
        if not h2.b:
            return FilmInfo(
                theater=self.cinema_info.name,
                title=soup.h1.text.strip() if soup.h1 else "Unknown",
                director=None,
                year=None,
                theater_film_link=film_url,
                dates=film_dates,
            )

        film_title = h2.b.text
        rest = h2.text.replace(film_title, "").strip("\n,() ")
        film_title = film_title.strip("\n,() ")

        match = re.match(r"(.*), (\d{4})", rest)
        if match:
            director, year = match.groups()
        else:
            director, year = None, None

        return FilmInfo(
            theater=self.cinema_info.name,
            title=film_title,
            director=director,
            year=year,
            theater_film_link=film_url,
            dates=film_dates,
        )

    def _get_film_dates(self, soup: BeautifulSoup) -> list[str]:
        """Extract screening dates from film detail page."""
        lateral = soup.find(id="lateralFicha")
        if not lateral:
            return []
            
        dates_text = lateral.text
        days = re.findall(r"\d{2}/\d{2}/\d{4}", dates_text)
        hours = re.findall(r"\d{2}:\d{2}", dates_text)
        return [
            datetime.strptime(f"{day} {hour}", "%d/%m/%Y %H:%M").strftime("%Y-%m-%d %H:%M")
            for day, hour in zip(days, hours)
        ]


# Backward compatibility: keep the function interface
_scraper = DoreScraper()


def fetch_films_from_date_range(start_date: datetime, end_date: datetime) -> list[dict]:
    """Fetch films from Cine Doré for a date range.
    
    This function is kept for backward compatibility with theaters.py.
    """
    return _scraper.fetch_films_from_date_range(start_date, end_date)
