"""OCine Urban Caleido scraper implementation.

Fetches the static JSON cartelera endpoint which contains all films and all
upcoming screenings in a single request.  VOSE is indicated by "(VOSE)" in the
film title.

Director and year data are not available from this API.
"""

import re
from datetime import datetime

import requests

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


_VOSE_SUFFIX_RE = re.compile(r"\s*\(VOSE\)\s*$")


def clean_title(title: str) -> str:
    """Strip VOSE markers from the film title."""
    return _VOSE_SUFFIX_RE.sub("", title).strip()


class OcineCaleidoScraper(BaseCinemaScraper):
    """Scraper for OCine Urban Caleido."""

    API_URL = (
        "https://www.ocineurbancaleido.es"
        "/components/com_cines/json/es_cartellera.json"
    )

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="ocine-caleido",
            name="OCine Urban Caleido",
            base_url="https://www.ocineurbancaleido.es",
            update_period="weekly",
        )

    # -- base-class stubs (not used; we override fetch_films_from_date_range) --

    def build_day_url(self, date: datetime) -> str:
        raise NotImplementedError("Use fetch_films_from_date_range instead")

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        pass

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        pass

    # -- main entry point -------------------------------------------------------

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all screenings from OCine Urban Caleido for the given date range."""
        print(f"Fetching OCine Urban Caleido cartelera JSON...")
        resp = requests.get(self.API_URL, headers=self.HEADERS)
        resp.raise_for_status()
        data = resp.json()

        films = self._parse_cartelera(data, start_date, end_date)
        print(f"  Extracted {len(films)} films")
        return films

    def _parse_cartelera(
        self,
        data: dict,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Parse the cartelera JSON and return film dicts."""
        results = []

        for film_data in data.get("data", []):
            film = self._parse_film(film_data, start_date, end_date)
            if film and film["dates"]:
                results.append(film)

        return results

    def _parse_film(
        self,
        film_data: dict,
        start_date: datetime,
        end_date: datetime,
    ) -> dict | None:
        """Parse a single film entry from the API."""
        raw_title = film_data.get("peli_titol", "").strip()
        if not raw_title:
            return None

        is_vose = "(VOSE)" in raw_title
        title = clean_title(raw_title)

        film_id = film_data.get("peli_pelicula", "")
        film_url = f"{self.cinema_info.base_url}/film-{film_id}"

        sessions = []
        for plan in film_data.get("Planificacions", []):
            date_str = plan.get("plan_data", "")  # "YYYY-MM-DD"
            time_str = plan.get("plan_horainici", "")  # "HH:MM:SS"

            if not date_str or not time_str:
                continue

            try:
                session_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                continue

            if (session_date.date() < start_date.date()
                    or session_date.date() > end_date.date()):
                continue

            timestamp = f"{date_str} {time_str[:5]}"  # "YYYY-MM-DD HH:MM"

            session: dict = {
                "timestamp": timestamp,
                "location": "OCine Urban Caleido",
                "url_tickets": film_url,
                "url_info": film_url,
            }
            if is_vose:
                session["version"] = "VOSE"

            sessions.append(session)

        if not sessions:
            return None

        sessions.sort(key=lambda d: d["timestamp"])

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": film_url,
            "dates": sessions,
            "director": None,
            "year": None,
        }
