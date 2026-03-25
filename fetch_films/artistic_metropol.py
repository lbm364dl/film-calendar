"""Artistic Metropol scraper implementation.

Uses the WordPress REST API (The Events Calendar plugin) to fetch screenings.
Each event title follows the pattern "SALA N: FILM TITLE (YEAR) V.O.S.E."
or "SALA N: FILM TITLE (YEAR) Doblada al español".

Private screenings ("Pase PRIVADO") are filtered out.
"""

import re
from datetime import datetime

import requests

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Regex to split "SALA 1: The Film Title (2024) V.O.S.E." into parts
_TITLE_RE = re.compile(
    r"^SALA\s+\d+:\s*"       # "SALA 1: " prefix
    r"(?P<title>.+?)"        # film title (non-greedy)
    r"(?:\s+\((?P<year>\d{4})\))?"  # optional (YEAR)
    r"(?:\s+(?P<version>V\.O\.S\.E\.|Doblada al español))?"  # optional version
    r"\s*$"
)

# Fallback: if no "SALA N:" prefix
_TITLE_NO_SALA_RE = re.compile(
    r"^(?P<title>.+?)"
    r"(?:\s+\((?P<year>\d{4})\))?"
    r"(?:\s+(?P<version>V\.O\.S\.E\.|Doblada al español))?"
    r"\s*$"
)


def parse_event_title(raw_title: str) -> dict:
    """Parse an event title into film title, year, and version.

    Returns dict with keys: title, year (str|None), version (str|None).
    """
    m = _TITLE_RE.match(raw_title)
    if not m:
        m = _TITLE_NO_SALA_RE.match(raw_title)
    if not m:
        return {"title": raw_title.strip(), "year": None, "version": None}

    version_raw = m.group("version")
    version = None
    if version_raw:
        if "Doblada" in version_raw:
            version = "dubbed"

    return {
        "title": m.group("title").strip(),
        "year": m.group("year"),
        "version": version,
    }


class ArtisticMetropolScraper(BaseCinemaScraper):
    """Scraper for Artistic Metropol using the WordPress Events REST API."""

    API_URL = "https://artisticmetropol.es/wp-json/tribe/events/v1/events"

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="artistic-metropol",
            name="Artistic Metropol",
            base_url="https://artisticmetropol.es",
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
        """Fetch all screenings from Artistic Metropol for the given date range."""
        print(f"Fetching Artistic Metropol events via REST API...")

        events = self._fetch_all_events(start_date, end_date)
        print(f"  Got {len(events)} events from API")

        films = self._group_events_into_films(events)
        print(f"  Extracted {len(films)} films")
        return films

    def _fetch_all_events(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all events from the API, paginating as needed."""
        all_events = []
        page = 1

        while True:
            params = {
                "per_page": 50,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "page": page,
            }
            resp = requests.get(self.API_URL, params=params, headers=self.HEADERS)
            if resp.status_code != 200:
                break

            data = resp.json()
            events = data.get("events", [])
            if not events:
                break

            all_events.extend(events)

            total_pages = data.get("total_pages", 1)
            if page >= total_pages:
                break
            page += 1

        return all_events

    def _group_events_into_films(self, events: list[dict]) -> list[dict]:
        """Group API events by film and build film dicts.

        Each API event is a single screening (one time slot).  We group by
        (title, year) so that a film shown multiple times appears once with
        many dates.
        """
        films_map: dict[tuple, dict] = {}

        for ev in events:
            raw_title = ev.get("title", "")

            # Skip private screenings
            if "Pase PRIVADO" in raw_title:
                continue

            parsed = parse_event_title(raw_title)
            title = parsed["title"]
            year = parsed["year"]
            version = parsed["version"]

            if not title:
                continue

            # Build session entry
            start = ev.get("start_date", "")  # "2026-03-25 16:00:00"
            if not start:
                continue
            timestamp = start[:16]  # "2026-03-25 16:00"

            event_url = ev.get("url", "")

            session: dict = {
                "timestamp": timestamp,
                "location": "Artistic Metropol",
                "url_tickets": event_url,
                "url_info": event_url,
            }
            if version:
                session["version"] = version

            # Group key: (title, year) to merge across screenings
            key = (title, year)
            if key not in films_map:
                films_map[key] = {
                    "theater": self.cinema_info.name,
                    "title": title,
                    "theater_film_link": event_url,
                    "dates": [],
                    "director": None,
                    "year": year,
                }

            films_map[key]["dates"].append(session)

        # Sort dates within each film
        for film in films_map.values():
            film["dates"].sort(key=lambda d: d["timestamp"])

        return list(films_map.values())
