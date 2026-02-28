"""Cines Verdi Madrid scraper implementation.

Catalog-based approach: fetches the cartelera page (all films, all days) in a
single pass.  The page contains ``<article class="article-cartelera">`` blocks
for each film, with tab panes per day containing session rows.

Version logic:
  - Sessions labelled "V.O. SUB. CASTELLANO" → original version, no tag.
  - Sessions labelled "CASTELLANO" on a film that also has V.O. sessions →
    version="dubbed".
  - Sessions labelled "CASTELLANO" on a film that only has dubbed sessions
    (never any V.O.) → assumed already in original language, no tag.
  - Sessions labelled "OPERA" → no version tag (special event).
"""

import re
from datetime import datetime
from urllib.parse import unquote

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Known special-session title prefixes to strip
TITLE_PREFIXES = [
    "Jueves de Imprescindibles:",
    "Miércoles Cultural:",
    "Anime Day:",
    "Sesión TETA:",
    "Verdi Club:",
    "Mañanas de Ópera y Ballet:",
]

# Regex for the VOSE suffix in title attributes
_VOSE_SUFFIX_RE = re.compile(r"\s*\(VOSE\)\s*$")


def clean_title(title: str) -> str:
    """Strip special-session prefixes and VOSE markers from a title."""
    title = _VOSE_SUFFIX_RE.sub("", title)

    for prefix in TITLE_PREFIXES:
        if title.startswith(prefix):
            title = title[len(prefix):]
            break

    return title.strip()


class VerdiScraper(BaseCinemaScraper):
    """Scraper for Cines Verdi Madrid."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="verdi",
            name="Cines Verdi Madrid",
            base_url="https://madrid.cines-verdi.com",
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
        """Fetch all films from Verdi for the given date range."""
        base = self.cinema_info.base_url

        print(f"Fetching cartelera from {base}/cartelera")
        cartelera_html = self.fetch_html(f"{base}/cartelera")

        films = self.parse_cartelera(cartelera_html, start_date, end_date)
        print(f"  Extracted {len(films)} films")
        return films

    # -- parsing helpers --------------------------------------------------------

    def parse_cartelera(
        self,
        html: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Parse the cartelera page and return a list of film dicts.

        Each film dict follows the project convention::

            {
                "theater": str,
                "title": str,
                "theater_film_link": str,
                "dates": [{"timestamp", "location", "url_tickets", "url_info",
                           and optionally "version"}],
                "director": str | None,
                "year": str | None,
            }
        """
        soup = BeautifulSoup(html, "html.parser")
        articles = soup.find_all("article", class_="article-cartelera")

        all_films: list[dict] = []

        for article in articles:
            film = self._parse_article(article, start_date, end_date)
            if film and film["dates"]:
                all_films.append(film)

        return all_films

    def _parse_article(
        self,
        article,
        start_date: datetime,
        end_date: datetime,
    ) -> dict | None:
        """Parse a single ``<article class="article-cartelera">`` element."""
        # ── Title + link ────────────────────────────────────────────
        h2 = article.find("h2")
        if not h2:
            return None

        a_tag = h2.find("a")
        if not a_tag:
            return None

        # The data-tiulo attribute contains the clean title (with "(VOSE)" suffix)
        # It may contain percent-encoded characters in Latin-1 (e.g. %E9 for é)
        raw_title = a_tag.get("data-tiulo", "") or a_tag.get("title", "")
        raw_title = unquote(raw_title, encoding="latin-1")
        href = a_tag.get("href", "")

        title = clean_title(raw_title)
        if not title:
            return None

        # Build absolute film URL
        film_url = href
        if film_url.startswith("/"):
            film_url = f"{self.cinema_info.base_url}{film_url}"

        # ── Director from ficha table ───────────────────────────────
        director = None
        table = article.find("table", class_="ficha")
        if table:
            for row in table.find_all("tr"):
                th = row.find("th")
                td = row.find("td")
                if not th or not td:
                    continue
                label = th.get_text(strip=True).upper()
                if "DIRECTOR" in label:
                    director = td.get_text(strip=True) or None

        # ── Sessions from tabs ──────────────────────────────────────
        tabs_div = article.find("div", class_="tabs-performances")
        if not tabs_div:
            return None

        tab_content = tabs_div.find("div", class_="tab-content")
        if not tab_content:
            return None

        sessions: list[dict] = []
        has_vo = False  # Track if this film has any V.O. sessions
        has_dubbed = False  # Track if this film has any CASTELLANO sessions

        for pane in tab_content.find_all("div", class_="tab-pane"):
            pane_id = pane.get("id", "")
            # Extract date from pane ID: "{film_id}-{YYYYMMDD}"
            date_match = re.search(r"-(\d{8})$", pane_id)
            if not date_match:
                continue
            date_str = date_match.group(1)
            try:
                pane_date = datetime.strptime(date_str, "%Y%m%d")
            except ValueError:
                continue

            # Filter by date range
            if (pane_date.date() < start_date.date()
                    or pane_date.date() > end_date.date()):
                continue

            for row in pane.find_all("div", class_="pelicula"):
                version_span = row.find("span")
                version_text = version_span.get_text(strip=True) if version_span else ""

                # Detect version type
                is_vo = "V.O." in version_text
                is_castellano = version_text == "CASTELLANO"

                if is_vo:
                    has_vo = True
                if is_castellano:
                    has_dubbed = True

                # Extract showtimes
                for time_a in row.find_all("a", href=True):
                    time_text = time_a.get_text(strip=True)
                    if not re.match(r"\d{1,2}:\d{2}$", time_text):
                        continue

                    ticket_url = time_a.get("href", "")
                    timestamp = f"{pane_date.strftime('%Y-%m-%d')} {time_text}"

                    session: dict = {
                        "timestamp": timestamp,
                        "location": "Verdi",
                        "url_tickets": ticket_url,
                        "url_info": film_url,
                        "_is_vo": is_vo,
                        "_is_castellano": is_castellano,
                    }
                    sessions.append(session)

        if not sessions:
            return None

        # ── Apply version tags ──────────────────────────────────────
        # If a film has both V.O. and CASTELLANO sessions, tag CASTELLANO as "dubbed"
        # Otherwise (only V.O., only CASTELLANO, or only OPERA), no version tag
        for s in sessions:
            is_vo = s.pop("_is_vo")
            is_castellano = s.pop("_is_castellano")

            if has_vo and has_dubbed and is_castellano:
                s["version"] = "dubbed"

        # Sort sessions by timestamp
        sessions.sort(key=lambda d: d["timestamp"])

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": film_url,
            "dates": sessions,
            "director": director,
            "year": None,
        }
