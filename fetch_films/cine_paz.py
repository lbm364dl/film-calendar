"""Cine Paz Madrid scraper implementation.

Catalog-based approach: fetches the cartelera page (all films, all days) and
the VOSE page (subtitled screenings only) in a single pass. Uses the VOSE
page as a reference to distinguish dubbed from original-version sessions.

Version logic:
  - Films appearing in both the cartelera (non-VOSE) and the VOSE page:
    non-VOSE sessions → version="dubbed", VOSE sessions → no version tag.
  - Films appearing only in the VOSE page → original version, no tag.
  - Films appearing only in the cartelera (never in VOSE) → assumed Spanish
    (already in original version), no tag.
"""

import re
from datetime import datetime

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Regex to strip "(VOSE)" / "(vose)" suffix from titles
_VOSE_SUFFIX_RE = re.compile(r"\s*\((?:VOSE|vose)\)\s*$")

# Regex to strip " - VOSE" suffix (seen in e.g. "F1 - VOSE")
_VOSE_DASH_RE = re.compile(r"\s*-\s*VOSE\s*$", re.IGNORECASE)

# Known special-session title prefixes to strip
TITLE_PREFIXES = [
    "AETERNA:",
    "Muestra Aeterna:",
    "Nuevas miradas de cine asiático:",
    "Modo avión:"
]


def extract_film_id(url: str) -> str | None:
    """Extract the numeric film ID from a detail URL.

    E.g. 'https://www.cinepazmadrid.es/es/detalles/84910_1_W_0/hamnet'
      →  '84910'
    """
    m = re.search(r"/detalles/(\d+)_", url)
    return m.group(1) if m else None


def clean_title(title: str) -> str:
    """Strip VOSE suffixes from a title."""
    title = _VOSE_SUFFIX_RE.sub("", title)
    title = _VOSE_DASH_RE.sub("", title)

    for prefix in TITLE_PREFIXES:
        if title.startswith(prefix):
            title = title[len(prefix):]
            break

    return title.strip()


def is_vose_entry(horarios_div) -> bool:
    """Check whether a ``div.horarios`` represents a VOSE screening."""
    peli = horarios_div.find("div", class_="peli")
    if peli and peli.find("div", class_="etiqueta-vose"):
        return True
    return False


def _resolve_date(label: str, reference_year: int) -> datetime | None:
    """Turn a day label like ``'Domingo 01/03'`` into a datetime.

    *reference_year* is the year to assume for ambiguous DD/MM dates.
    For ``'Hoy'`` we return ``None`` (caller must handle separately).
    """
    label = label.strip()
    if label.lower() == "hoy":
        return None  # Sentinel – caller resolves with today's date

    # Expected format: "DayName DD/MM"
    m = re.search(r"(\d{2})/(\d{2})", label)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    try:
        return datetime(reference_year, month, day)
    except ValueError:
        return None


class CinePazScraper(BaseCinemaScraper):
    """Scraper for Cine Paz Madrid (mk2)."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="cine-paz",
            name="Cine Paz Madrid",
            base_url="https://www.cinepazmadrid.es",
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
        """Fetch all films from Cine Paz for the given date range."""
        base = self.cinema_info.base_url

        # 1. Fetch VOSE page → set of film IDs with subtitled screenings
        print(f"Fetching VOSE listing from {base}/es/vose")
        vose_html = self.fetch_html(f"{base}/es/vose")
        vose_ids = self.parse_vose_film_ids(vose_html)
        print(f"  Found {len(vose_ids)} VOSE film IDs")

        # 2. Fetch cartelera page (contains all days)
        print(f"Fetching cartelera from {base}/es/cartelera")
        cartelera_html = self.fetch_html(f"{base}/es/cartelera")

        # 3. Parse all films, applying version logic
        films = self.parse_cartelera(
            cartelera_html, vose_ids, start_date, end_date
        )
        print(f"  Extracted {len(films)} films")
        return films

    # -- parsing helpers --------------------------------------------------------

    def parse_vose_film_ids(self, html: str) -> set[str]:
        """Extract the set of numeric film IDs from the VOSE page."""
        soup = BeautifulSoup(html, "html.parser")
        ids: set[str] = set()
        for a_tag in soup.find_all(
            "a", href=lambda h: h and "/es/detalles/" in h
        ):
            fid = extract_film_id(a_tag["href"])
            if fid:
                ids.add(fid)
        return ids

    def parse_cartelera(
        self,
        html: str,
        vose_ids: set[str],
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
                "year": None,
            }
        """
        soup = BeautifulSoup(html, "html.parser")
        container = soup.find("div", class_="contenedor_horarios")
        if not container:
            return []

        # Determine the reference year for date resolution.
        # Dates on the page are always in the future (or today), so the
        # year is start_date's year.  If a parsed month < start_date.month,
        # we assume the next year (handles Dec → Jan rollover).
        ref_year = start_date.year

        # We'll also need "today" for the "Hoy" label.  When scraping live,
        # today == start_date (or close); for tests the caller controls both.
        today = start_date

        all_films: dict[str, dict] = {}  # film_id → merged film dict
        current_date: datetime | None = None

        for child in container.children:
            if not hasattr(child, "name") or child.name is None:
                continue
            classes = child.get("class", [])

            # ── Day separator ───────────────────────────────────────────
            if "rotulo_dia" in classes:
                label = child.get_text(strip=True)
                resolved = _resolve_date(label, ref_year)
                if resolved is None and label.lower() == "hoy":
                    current_date = datetime(today.year, today.month, today.day)
                elif resolved is not None:
                    # Handle year rollover
                    if resolved.month < start_date.month:
                        resolved = resolved.replace(year=ref_year + 1)
                    current_date = resolved
                else:
                    current_date = None  # unrecognised label
                continue

            # ── Film entries for a day ──────────────────────────────────
            if "contenedor_cines" not in classes or current_date is None:
                continue

            # Filter by requested date range
            if (current_date.date() < start_date.date()
                    or current_date.date() > end_date.date()):
                continue

            for horarios_div in child.find_all("div", class_="horarios"):
                self._process_film_entry(
                    horarios_div, current_date, vose_ids, all_films
                )

        # Sort dates within each film
        for film in all_films.values():
            film["dates"].sort(key=lambda d: d["timestamp"])

        return list(all_films.values())

    # ------------------------------------------------------------------

    def _process_film_entry(
        self,
        horarios_div,
        date: datetime,
        vose_ids: set[str],
        all_films: dict[str, dict],
    ) -> None:
        """Parse a single ``div.horarios`` and merge into *all_films*."""
        peli = horarios_div.find("div", class_="peli")
        if not peli:
            return

        # ── Title + detail link ─────────────────────────────────────
        title_p = peli.find("p", class_="text-header-span")
        if not title_p:
            return
        title_a = title_p.find("a")
        if not title_a:
            return

        raw_title = title_a.get_text(strip=True)
        detail_url = title_a.get("href", "")
        film_id = extract_film_id(detail_url)
        if not film_id:
            return

        title = clean_title(raw_title)
        if not title:
            return

        # ── VOSE flag ───────────────────────────────────────────────
        vose = is_vose_entry(horarios_div)

        # ── Director ────────────────────────────────────────────────
        director = None
        gibson_ps = peli.find_all("p", class_="gibsonL")
        if gibson_ps:
            raw_dir = gibson_ps[0].get_text(strip=True)
            # Strip "de " prefix
            if raw_dir.lower().startswith("de "):
                director = raw_dir[3:].strip() or None
            else:
                director = raw_dir or None

        # ── Version logic ───────────────────────────────────────────
        # VOSE entry → original version (no tag)
        # Non-VOSE entry, film has VOSE counterpart → dubbed
        # Non-VOSE entry, no VOSE counterpart → Spanish, no tag
        version: str | None = None
        if not vose and film_id in vose_ids:
            version = "dubbed"

        # ── Showtimes ───────────────────────────────────────────────
        horas_div = horarios_div.find("div", class_="horas")
        if not horas_div:
            return

        sessions: list[dict] = []
        for a_tag in horas_div.find_all("a", class_="metrica"):
            time_text = a_tag.get_text(strip=True)
            ticket_url = a_tag.get("href", "")

            # Strip leading "VOSE" prefix from time (e.g. "VOSE21:15" → "21:15")
            time_clean = re.sub(r"^VOSE\s*", "", time_text, flags=re.IGNORECASE)
            if not re.match(r"\d{1,2}:\d{2}", time_clean):
                continue  # Skip non-time entries

            timestamp = f"{date.strftime('%Y-%m-%d')} {time_clean}"

            session: dict = {
                "timestamp": timestamp,
                "location": "Cine Paz",
                "url_tickets": ticket_url,
                "url_info": detail_url,
            }
            if version is not None:
                session["version"] = version
            sessions.append(session)

        if not sessions:
            return

        # ── Merge into all_films ────────────────────────────────────
        # Use a composite key: (film_id, version) so that dubbed and
        # original sessions for the same film stay as one entry, but
        # with correct per-session version tags.
        #
        # We use just film_id as key — sessions already carry their
        # own version tag, and the title/director should be identical.
        if film_id not in all_films:
            # For the canonical link, prefer the non-VOSE detail URL
            canonical_url = detail_url
            if vose:
                # Try to construct the non-VOSE URL for the canonical link
                canonical_url = re.sub(
                    r"-vose(/?)$", r"\1", detail_url
                )

            all_films[film_id] = {
                "theater": self.cinema_info.name,
                "title": title,
                "theater_film_link": canonical_url,
                "dates": [],
                "director": director,
                "year": None,
            }

        existing = all_films[film_id]
        existing_keys = {d["timestamp"] for d in existing["dates"]}
        for s in sessions:
            if s["timestamp"] not in existing_keys:
                existing["dates"].append(s)
                existing_keys.add(s["timestamp"])
