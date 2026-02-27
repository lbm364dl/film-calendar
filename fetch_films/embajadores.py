"""Cines Embajadores scraper implementation.

Catalog-based approach: fetches the main /madrid/ page once to discover all
film detail URLs, then visits each detail page to extract schedules.  Handles
both VOSE and dubbed sessions, merging them into a single film entry with
a ``version`` tag on each session.
"""

import re
import time
from datetime import datetime
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Location labels on the website → short display names
LOCATIONS = {
    "Cine Embajadores": "Embajadores Glorieta",
    "Cine Embajadores Río": "Embajadores Ercilla",
}

# Known special-session title prefixes to strip
TITLE_PREFIXES = [
    "Domingo de clásicos:",
    "Cine y política:",
    "Espacio Queer:",
    "SESIÓN TETA:",
    "Clásicos al detalle:",
    "Música en cine:",
]

# Regex for prefixes that vary (e.g. "Laca y Palomitas especial 2º aniversario:")
TITLE_PREFIX_RE = re.compile(
    r"^(?:Laca y Palomitas[^:]*):?\s*",
    re.IGNORECASE,
)


def clean_title(title: str) -> str:
    """Strip version suffixes and known special-session prefixes."""
    # Remove version suffixes
    title = re.sub(r"\s*\(VOSE\)\s*$", "", title)
    title = re.sub(r"\s*\(DOBLADA AL ESPAÑOL\)\s*$", "", title, flags=re.IGNORECASE)

    # Remove known fixed prefixes
    for prefix in TITLE_PREFIXES:
        if title.startswith(prefix):
            title = title[len(prefix):]
            break
    else:
        # Try regex prefixes
        title = TITLE_PREFIX_RE.sub("", title)

    return title.strip()


def _base_slug(url: str) -> str:
    """Derive a base slug from a film URL for grouping VOSE + dubbed versions.

    E.g. '/pelicula/el-agente-secreto-vose/?ciudad=madrid'
      →  'el-agente-secreto'
    """
    path = urlparse(url).path.rstrip("/")
    slug = path.rsplit("/", 1)[-1]
    slug = re.sub(r"-vose$", "", slug)
    slug = re.sub(r"-doblada-al-espanol$", "", slug)
    return slug


def _detect_version(url: str) -> str | None:
    """Detect the version tag from a film URL slug.

    Returns 'VOSE', 'dubbed', or None (untagged).
    """
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if slug.endswith("-vose"):
        return "VOSE"
    if slug.endswith("-doblada-al-espanol"):
        return "dubbed"
    return None


class EmbajadoresScraper(BaseCinemaScraper):
    """Scraper for Cines Embajadores (Madrid)."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="embajadores",
            name="Cines Embajadores",
            base_url="https://cinesembajadores.es",
            update_period="weekly",
        )

    # -- base class stubs (not used; we override fetch_films_from_date_range) --

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
        """Fetch all films from Embajadores for the given date range."""
        # 1. Discover all film detail URLs from the catalog page
        catalog_url = f"{self.cinema_info.base_url}/madrid/"
        print(f"Fetching catalog from {catalog_url}")
        catalog_html = self.fetch_html(catalog_url)
        film_entries = self.parse_catalog_page(catalog_html)

        # 2. Group by base slug to merge VOSE + dubbed
        groups: dict[str, list[tuple[str, str | None]]] = {}
        for url, version in film_entries:
            slug = _base_slug(url)
            groups.setdefault(slug, []).append((url, version))

        # 3. Fetch each group and merge
        all_films: dict[str, dict] = {}  # slug → film dict
        for slug, entries in groups.items():
            for url, version in entries:
                print(f"  Fetching {url}")
                try:
                    detail_html = self.fetch_html(url)
                except Exception as e:
                    print(f"    Error fetching {url}: {e}")
                    continue
                time.sleep(0.3)  # Be polite

                film_data = self.parse_film_detail(
                    detail_html, url, version, start_date, end_date
                )
                if film_data is None:
                    continue

                if slug not in all_films:
                    all_films[slug] = film_data
                else:
                    # Merge dates from this version into the existing entry
                    existing = all_films[slug]
                    existing_keys = {
                        (d["timestamp"], d["location"]) for d in existing["dates"]
                    }
                    for d in film_data["dates"]:
                        key = (d["timestamp"], d["location"])
                        if key not in existing_keys:
                            existing["dates"].append(d)
                            existing_keys.add(key)
                    # Sort after merge
                    existing["dates"].sort(key=lambda x: x["timestamp"])

        return list(all_films.values())

    # -- parsing helpers --------------------------------------------------------

    def parse_catalog_page(self, html: str) -> list[tuple[str, str | None]]:
        """Extract unique (film_url, version) pairs from the catalog page.

        Scans both the regular cartelera and the venta anticipada section.
        Deduplicates and normalises URLs (strips #parrilla fragments).
        """
        soup = BeautifulSoup(html, "html.parser")
        seen: set[str] = set()
        results: list[tuple[str, str | None]] = []

        for a_tag in soup.find_all("a", href=lambda h: h and "/pelicula/" in h):
            url = a_tag["href"].split("#")[0]  # Strip #parrilla
            if url in seen:
                continue
            seen.add(url)
            version = _detect_version(url)
            results.append((url, version))

        return results

    def parse_film_detail(
        self,
        html: str,
        url: str,
        version: str | None,
        start_date: datetime,
        end_date: datetime,
    ) -> dict | None:
        """Parse a film detail page and return a film dict.

        Returns None if no sessions fall within the date range or if
        the page cannot be parsed.
        """
        soup = BeautifulSoup(html, "html.parser")

        # --- Title ---
        h1 = soup.find("h1")
        if not h1:
            return None
        raw_title = h1.get_text(strip=True)
        # Strip the "🎟 ▼" ticket link text that's inside the h1
        raw_title = re.sub(r"[🎟▼\s]+$", "", raw_title).strip()
        title = clean_title(raw_title)
        if not title:
            return None

        # --- Director ---
        director = None
        dir_label = soup.find("label", string=lambda t: t and "Dirección" in t)
        if dir_label:
            dir_span = dir_label.find_next_sibling("span")
            if dir_span:
                director = dir_span.get_text(strip=True) or None

        # --- Schedule (parrilla) ---
        parrilla = soup.find(id="parrilla")
        if not parrilla:
            return None

        dates: list[dict] = []
        current_location: str | None = None

        for child in parrilla.children:
            if not hasattr(child, "name") or child.name is None:
                continue

            # Location header
            if child.name == "h3":
                raw_loc = child.get_text(strip=True)
                current_location = LOCATIONS.get(raw_loc)
                # Skip locations not in our mapping (e.g. Foncalada, Santander)
                continue

            # Day block (div.showtimedetail)
            if child.name == "div" and current_location:
                h4 = child.find("h4")
                if not h4:
                    continue
                date_text = h4.get_text(strip=True)  # "27/02/2026"
                try:
                    day_date = datetime.strptime(date_text, "%d/%m/%Y")
                except ValueError:
                    continue

                # Filter by date range
                if day_date.date() < start_date.date():
                    continue
                if day_date.date() > end_date.date():
                    continue

                # Extract time links
                for a_tag in child.find_all(
                    "a", href=lambda h: h and "reservaentradas" in h
                ):
                    time_text = a_tag.get_text(strip=True)
                    ticket_url = a_tag["href"]
                    timestamp = f"{day_date.strftime('%Y-%m-%d')} {time_text}"

                    session = {
                        "timestamp": timestamp,
                        "location": current_location,
                        "url_tickets": ticket_url,
                        "url_info": url,
                    }
                    if version is not None:
                        session["version"] = version
                    dates.append(session)

        if not dates:
            return None

        dates.sort(key=lambda x: x["timestamp"])

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": url,
            "dates": dates,
            "director": director,
            "year": None,
        }
