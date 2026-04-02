"""Cinesa scraper implementation.

Catalog-based approach: fetches each Cinesa Madrid theater's cartelera from
publicine.net (which aggregates Cinesa data and is accessible without
Cloudflare), parses film listings with showtimes, and merges across locations.

Handles VOSE vs dubbed sessions via the version tag on each showtime.
"""

import base64
import re
import time
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# All Cinesa theaters in the Comunidad de Madrid.
# Key = short display name, value = (city_slug, cinema_slug) on publicine.net.
LOCATIONS = {
    "Cinesa Proyecciones": ("madrid", "cinesa-proyecciones"),
    "Cinesa Principe Pio": ("madrid", "cinesa-principe-pio"),
    "Cinesa Las Rosas": ("madrid", "cinesa-las-rosas"),
    "Cinesa La Gavia": ("madrid", "cinesa-la-gavia"),
    "Cinesa Manoteras": ("madrid", "cinesa-manoteras"),
    "Cinesa Mendez Alvaro": ("madrid", "cinesa-mendez-alvaro"),
    "Cinesa Nassica": ("getafe", "cinesa-nassica"),
    "Cinesa Parquesur": ("leganes", "cinesa-parquesur"),
    "Cinesa Las Rozas": ("las-rozas", "cinesa-las-rozas"),
    "Cinesa Equinoccio": ("majadahonda", "cinesa-equinoccio"),
    "Cinesa La Moraleja": ("alcobendas", "cinesa-la-moraleja"),
    "Cinesa Plaza Loranca 2": ("madrid", "cinesa-plaza-loranca-2"),
    "Cinesa Oasiz": ("torrejon-de-ardoz", "cinesa-luxe-oasiz"),
    "Cinesa Xanadu": ("arroyomolinos", "cinesa-xanadu"),
}

PUBLICINE_BASE = "https://www.publicine.net"

# Version mapping: publicine.net labels -> our version tags.
# "DIGITAL" = standard dubbed/Spanish, no version tag needed.
# "VOSE" = original version with Spanish subtitles.
# "3D DIGITAL" / "3D VOSE" etc. also possible.
VERSION_MAP = {
    "DIGITAL": "dubbed",
    "3D DIGITAL": "dubbed",
}


def _resolve_year(day: int, month: int, reference_date: datetime) -> int:
    """Resolve the year for a DD/MM date relative to a reference date.

    publicine.net shows dates for the current week (up to ~7 days ahead).
    If the month is earlier than the reference month, it's next year.
    """
    ref_month = reference_date.month
    ref_year = reference_date.year
    if month < ref_month:
        return ref_year + 1
    return ref_year


def _decode_ticket_url(data_href: str) -> str:
    """Decode a publicine.net data-href into the real Cinesa ticket URL.

    Format: /venda/{film_id}/{cinema_id}/{base64_encoded_url}
    The base64 part decodes to e.g. https://web.cinesa.es/compra/butacas/?showtimeId=018-37454
    """
    parts = data_href.rstrip("/").split("/")
    if len(parts) < 4:
        return ""
    encoded = parts[-1]
    # Add padding if needed
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding
    try:
        return base64.b64decode(encoded).decode("utf-8")
    except Exception:
        return ""


def _parse_date(date_text: str) -> tuple[int, int] | None:
    """Parse a date string like 'Hoy25/03' or 'Viernes27/03' into (day, month)."""
    match = re.search(r"(\d{1,2})/(\d{2})", date_text)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


class CinesaScraper(BaseCinemaScraper):
    """Scraper for all Cinesa theaters in Madrid (via publicine.net)."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="cinesa",
            name="Cinesa",
            base_url="https://www.cinesa.es",
            update_period="weekly",
        )

    # -- base class stubs (not used; we override fetch_films_from_date_range) --

    def build_day_url(self, date: datetime) -> str:  # noqa: ARG002
        raise NotImplementedError("Use fetch_films_from_date_range instead")

    def parse_films_list(self, html: str, date: datetime) -> list[str]:  # noqa: ARG002
        return []

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:  # noqa: ARG002
        return FilmInfo(theater=self.cinema_info.name, title="", theater_film_link="")

    # -- main entry point --

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch films from all Cinesa Madrid locations."""
        all_films: dict[tuple, dict] = {}  # key = (title_lower, director) -> film dict

        for location_name, (city_slug, cinema_slug) in LOCATIONS.items():
            url = f"{PUBLICINE_BASE}/cartelera-cine/{city_slug}/{cinema_slug}"
            print(f"Fetching {location_name} from {url}")

            try:
                html = self._fetch_publicine(url)
            except Exception as e:
                print(f"  Error fetching {location_name}: {e}")
                continue

            films = self.parse_cartelera(html, location_name, start_date, end_date)
            print(f"  Found {len(films)} films")

            for film in films:
                key = (film["title"].lower(), film.get("director") or "")
                if key not in all_films:
                    all_films[key] = film
                else:
                    # Merge sessions from this location
                    existing = all_films[key]
                    existing_keys = {
                        (d["timestamp"], d["location"]) for d in existing["dates"]
                    }
                    for d in film["dates"]:
                        session_key = (d["timestamp"], d["location"])
                        if session_key not in existing_keys:
                            existing["dates"].append(d)
                            existing_keys.add(session_key)

            time.sleep(0.5)

        # Sort dates within each film
        for film in all_films.values():
            film["dates"].sort(key=lambda x: x["timestamp"])

        return list(all_films.values())

    def _fetch_publicine(self, url: str) -> str:
        """Fetch HTML from publicine.net with ISO-8859-1 encoding."""
        response = requests.get(url, headers=self.HEADERS)
        response.encoding = "iso-8859-1"
        return response.text

    def parse_cartelera(
        self,
        html: str,
        location_name: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Parse a publicine.net cartelera page for one cinema."""
        soup = BeautifulSoup(html, "html.parser")
        films = []

        for card in soup.find_all("div", class_="cartellera"):
            film = self._parse_film_card(card, location_name, start_date, end_date)
            if film is not None:
                films.append(film)

        return films

    def _parse_film_card(
        self,
        card,
        location_name: str,
        start_date: datetime,
        end_date: datetime,
    ) -> dict | None:
        """Parse a single film card from the cartelera page."""
        sessions_div = card.find("div", class_="sessions")
        if not sessions_div:
            return None

        # Title
        h2 = sessions_div.find("h2")
        if not h2:
            return None
        raw_title = h2.get_text(strip=True)
        title = raw_title.title() if raw_title.isupper() else raw_title

        # Film info URL
        title_link = sessions_div.find("a")
        film_url = ""
        if title_link and title_link.get("href"):
            film_url = urljoin(PUBLICINE_BASE, title_link["href"])

        # Director
        director = None
        for span in sessions_div.find_all("span", class_="up"):
            if span.get_text(strip=True) == "DIRECTOR":
                next_sib = span.next_sibling
                if next_sib and isinstance(next_sib, str):
                    director = next_sib.strip() or None
                break

        # Parse sessions: iterate through box_dia / box_projeccions pairs
        dates = []
        clearfix = card.find("div", class_="clearfix")
        if not clearfix:
            return None

        current_date_str = None  # "YYYY-MM-DD"
        for child in clearfix.children:
            if not hasattr(child, "name") or child.name is None:
                continue

            if "box_dia" in (child.get("class") or []):
                date_span = child.find("span", class_="dia")
                if date_span:
                    parsed = _parse_date(date_span.get_text(strip=True))
                    if parsed:
                        day, month = parsed
                        year = _resolve_year(day, month, start_date)
                        current_date_str = f"{year:04d}-{month:02d}-{day:02d}"

            elif "box_projeccions" in (child.get("class") or []) and current_date_str:
                # Filter by date range
                try:
                    screening_date = datetime.strptime(current_date_str, "%Y-%m-%d")
                except ValueError:
                    continue
                if screening_date.date() < start_date.date():
                    continue
                if screening_date.date() > end_date.date():
                    continue

                for link in child.find_all("a", attrs={"data-href": True}):
                    horari = link.find("div", class_="horari_pelicula")
                    versio = link.find("div", class_="versio_pelicula")
                    if not horari:
                        continue

                    version_text = versio.get_text(strip=True) if versio else ""
                    time_text = horari.get_text(strip=True)
                    # Remove the version text from the time string
                    time_text = time_text.replace(version_text, "").strip()
                    # Convert "16.00" -> "16:00"
                    time_text = time_text.replace(".", ":")

                    ticket_url = _decode_ticket_url(link["data-href"])
                    timestamp = f"{current_date_str} {time_text}"

                    session = {
                        "timestamp": timestamp,
                        "location": location_name,
                        "url_tickets": ticket_url,
                    }

                    version_tag = VERSION_MAP.get(version_text)
                    if version_tag:
                        session["version"] = version_tag

                    dates.append(session)

        if not dates:
            return None

        dates.sort(key=lambda x: x["timestamp"])

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": film_url,
            "dates": dates,
            "director": director,
            "year": None,
        }
