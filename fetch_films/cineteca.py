"""Cineteca Madrid scraper implementation."""

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Spanish month names -> month number
SPANISH_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


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

        film_details = soup.find("div", class_="tit-ficha")

        film_title = film_details.find("h2", class_="title").text.strip()

        film_year_elem = film_details.find("div", class_=re.compile(r"ano-filmacion"))
        film_year = film_year_elem.text.strip() if film_year_elem else None

        film_director_elem = film_details.find("div", class_=re.compile(r"director"))
        film_director = film_director_elem.text.strip() if film_director_elem else None

        url_tickets = self._get_ticket_url(soup)
        film_dates = self._get_film_dates(soup, date, film_url, url_tickets)

        return FilmInfo(
            theater=self.cinema_info.name,
            title=film_title,
            director=film_director,
            year=film_year,
            theater_film_link=film_url,
            dates=film_dates,
        )

    @staticmethod
    def _get_ticket_url(soup: BeautifulSoup) -> str:
        """Extract the tienda.madrid-destino ticket URL from the page."""
        ticketing_div = soup.find(
            "div",
            class_=re.compile(r"field--name-field-ticketing-links"),
        )
        if ticketing_div:
            link = ticketing_div.find("a", href=True)
            if link:
                return link["href"]
        return ""

    @staticmethod
    def _get_film_dates(
        soup: BeautifulSoup,
        date: datetime,
        film_url: str,
        url_tickets: str,
    ) -> list[dict]:
        """Extract screening dates from film detail page.

        Returns a list of dicts with keys:
            timestamp, location, url_tickets, url_info
        """
        dates_section = soup.find(class_="sb-sessions__items")
        if not dates_section:
            return []

        # Resolve the current month context from the first <h2>
        current_month: int | None = None
        current_year = date.year

        results: list[dict] = []

        for elem in dates_section.children:
            if not hasattr(elem, "name") or elem.name is None:
                continue

            # Month header: <h2 class="sb-sessions__date-month">Enero</h2>
            if elem.name == "h2" and "sb-sessions__date-month" in elem.get("class", []):
                month_name = elem.get_text(strip=True).lower()
                current_month = SPANISH_MONTHS.get(month_name)
                continue

            # Day header: <h4 class="sb-sessions__date-day">Jueves 29</h4>
            if elem.name == "h4" and "sb-sessions__date-day" in elem.get("class", []):
                day_text = elem.get_text(strip=True)
                # e.g. "Jueves 29" -> 29
                parts = day_text.split()
                current_day = int(parts[-1]) if parts else None
                continue

            # Session list: <ul class="sb-sessions__date-hours">
            if elem.name == "ul" and "sb-sessions__date-hours" in elem.get("class", []):
                hour_li = elem.find("li", class_="sb-sessions__date-hours-hour")

                time_text = hour_li.get_text(strip=True) if hour_li else None

                if time_text and current_month and current_day is not None:
                    # Strip trailing 'h' and whitespace: "20:00 h" -> "20:00"
                    clean_time = re.sub(r"\s*h$", "", time_text).strip()
                    month = current_month
                    timestamp = (
                        f"{current_year:04d}-{month:02d}-{current_day:02d}"
                        f" {clean_time}"
                    )
                    results.append({
                        "timestamp": timestamp,
                        "location": "Cineteca Madrid",
                        "url_tickets": url_tickets,
                        "url_info": film_url,
                    })

        return results


# Backward compatibility wrapper removed.
