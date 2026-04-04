"""Cines Yelmo scraper implementation.

API-based approach: hits the ``GetNowPlaying`` JSON endpoint which returns
all Madrid Yelmo cinemas, films, formats, languages and showtimes in a
single response.  No Selenium required.

Version logic:
  - Sessions whose language string contains "(VOSE)" → version="VOSE".
  - Sessions in "ESPAÑOL" on a film that *also* has VOSE sessions →
    version="dubbed".
  - Sessions in "ESPAÑOL" on a film that only plays in Spanish → no tag.
"""

import re
from datetime import datetime, timezone

import requests

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# API endpoint that returns all Madrid cinemas + showtimes in one call
_API_URL = "https://yelmocines.es/now-playing.aspx/GetNowPlaying"

# .NET date literal:  /Date(1774490400000)/
_DATE_RE = re.compile(r"/Date\((\d+)\)/")

# Madrid Yelmo locations (the API returns all 10 in one response).
# We keep static mappings from CinemaId → display name / URL key.
LOCATIONS = {
    35: "Yelmo Ideal",
    82: "Yelmo La Vaguada",
    48: "Yelmo Islazul",
    70: "Yelmo Palafox Luxury",
    72: "Yelmo Parque Corredor",
    55: "Yelmo Plaza Norte 2",
    34: "Yelmo Planetocio",
    36: "Yelmo Plenilunio",
    37: "Yelmo Rivas H2O",
    38: "Yelmo TresAguas",
}



def _parse_dotnet_date(s: str) -> datetime | None:
    """Convert ``/Date(ms)/`` to a UTC datetime."""
    m = _DATE_RE.search(s)
    if not m:
        return None
    return datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc)


def _is_vose(language: str) -> bool:
    """Return True if the language string indicates original version."""
    return "(VOSE)" in language or "(VOSI)" in language


def _is_espanol(language: str) -> bool:
    return language.strip().upper() == "ESPAÑOL"


class YelmoScraper(BaseCinemaScraper):
    """Scraper for all Yelmo cinemas in Madrid."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="yelmo",
            name="Cines Yelmo",
            base_url="https://yelmocines.es",
            update_period="weekly",
        )

    # -- base-class stubs (not used; we override fetch_films_from_date_range) --

    def build_day_url(self, date: datetime) -> str:
        raise NotImplementedError("Use fetch_films_from_date_range instead")

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        pass  # not used

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        pass  # not used

    # -- main entry point -------------------------------------------------------

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films from every Madrid Yelmo cinema for *start_date* … *end_date*."""
        raw = self._fetch_api()
        return self._parse_response(raw, start_date, end_date)

    # -- API helpers ------------------------------------------------------------

    def _fetch_api(self) -> dict:
        """POST to the Yelmo ``GetNowPlaying`` endpoint and return parsed JSON."""
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": self.HEADERS["User-Agent"],
            "X-Requested-With": "XMLHttpRequest",
        }
        payload = '{"cinemaId":"ideal","cityKey":"madrid"}'
        print("Fetching Yelmo API …")
        resp = requests.post(_API_URL, headers=headers, data=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _parse_response(
        self,
        data: dict,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Walk the API response and build film dicts.

        The response contains one entry per cinema.  Each cinema has a
        ``Dates`` array (one per calendar day), and each day has a
        ``Movies`` array.  We merge films across cinemas so the output
        is film-centric.
        """
        # Pass 1: collect raw sessions per film key, track VOSE/español flags
        film_map: dict[str, dict] = {}       # movie Key → film dict (no dates yet)
        sessions_map: dict[str, list] = {}   # movie Key → list of session dicts
        has_vose: dict[str, bool] = {}       # movie Key → True if any VOSE session
        has_espanol: dict[str, bool] = {}    # movie Key → True if any ESPAÑOL session

        for cinema in data["d"]["Cinemas"]:
            cinema_id = cinema["Id"]
            if cinema_id not in LOCATIONS:
                continue
            location = LOCATIONS[cinema_id]

            for date_entry in cinema["Dates"]:
                day_dt = _parse_dotnet_date(date_entry["FilterDate"])
                if day_dt is None:
                    continue
                day_date = day_dt.date()
                if day_date < start_date.date() or day_date > end_date.date():
                    continue

                day_str = day_date.strftime("%Y-%m-%d")

                for movie in date_entry["Movies"]:
                    mkey = movie["Key"]

                    if mkey not in film_map:
                        film_map[mkey] = self._build_film_stub(movie)
                        sessions_map[mkey] = []
                        has_vose[mkey] = False
                        has_espanol[mkey] = False

                    for fmt in movie["Formats"]:
                        lang = fmt.get("Language", "")
                        vose = _is_vose(lang)
                        espanol = _is_espanol(lang)

                        if vose:
                            has_vose[mkey] = True
                        if espanol:
                            has_espanol[mkey] = True

                        for st in fmt["Showtimes"]:
                            if st["CinemaId"] != cinema_id:
                                continue

                            session = {
                                "timestamp": f"{day_str} {st['Time']}",
                                "location": location,
                                "url_tickets": (
                                    f"https://compra.yelmocines.es/"
                                    f"?cinemaVistaId={st['VistaCinemaId']}"
                                    f"&showtimeVistaId={st['ShowtimeId']}"
                                ),
                                "url_info": self._sinopsis_url(mkey),
                                "_vose": vose,
                                "_espanol": espanol,
                            }
                            sessions_map[mkey].append(session)

        # Pass 2: apply version tags and build final list
        results: list[dict] = []
        for mkey, film in film_map.items():
            sessions = sessions_map[mkey]
            if not sessions:
                continue

            for s in sessions:
                vose = s.pop("_vose")
                espanol = s.pop("_espanol")
                if vose:
                    s["version"] = "VOSE"
                elif espanol and has_vose[mkey]:
                    s["version"] = "dubbed"

            # Deduplicate (same timestamp + location + version)
            seen: set[tuple[str, str, str | None]] = set()
            unique: list[dict] = []
            for s in sessions:
                key = (s["timestamp"], s["location"], s.get("version"))
                if key not in seen:
                    seen.add(key)
                    unique.append(s)
            unique.sort(key=lambda d: (d["timestamp"], d["location"]))

            film["dates"] = unique
            results.append(film)

        print(f"  Extracted {len(results)} films across {len(LOCATIONS)} cinemas")
        return results

    # -- helpers ----------------------------------------------------------------

    @staticmethod
    def _build_film_stub(movie: dict) -> dict:
        """Create a film dict (without dates) from an API movie object."""
        title = movie["Title"].strip()
        director = " ".join(movie.get("Director", "").split()) or None
        # Normalise director casing if all-caps
        if director and director == director.upper():
            director = director.title()
        return {
            "theater": "Cines Yelmo",
            "title": title,
            "theater_film_link": f"https://yelmocines.es/sinopsis/{movie['Key']}",
            "dates": [],
            "director": director,
            "year": None,
        }

    @staticmethod
    def _sinopsis_url(movie_key: str) -> str:
        return f"https://yelmocines.es/sinopsis/{movie_key}"

