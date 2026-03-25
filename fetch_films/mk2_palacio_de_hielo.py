"""mk2 Palacio de Hielo scraper implementation.

Catalog-based approach: fetches the /es/cartelera page (all films, all days)
in a single pass.  The page is organized as day headers (div.rotulo_dia)
followed by film blocks (div.horarios) with screening times.

VOSE is tagged per-screening via a <span> inside each time link:
  - <span>VOSE</span>15:45 → original version
  - <span></span>15:45 → dubbed/regular
"""

import re
from datetime import datetime

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class Mk2PalacioDeHieloScraper(BaseCinemaScraper):
    """Scraper for mk2 Palacio de Hielo."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="mk2-palacio-de-hielo",
            name="mk2 Palacio de Hielo",
            base_url="https://www.mk2palaciodehielo.es",
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
        """Fetch all films from mk2 Palacio de Hielo for the given date range."""
        url = f"{self.cinema_info.base_url}/es/cartelera"
        print(f"Fetching cartelera from {url}")
        html = self.fetch_html(url)

        films = self.parse_cartelera(html, start_date, end_date)
        print(f"  Extracted {len(films)} films")
        return films

    # -- parsing ----------------------------------------------------------------

    def parse_cartelera(
        self,
        html: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Parse the cartelera page and return a list of film dicts."""
        soup = BeautifulSoup(html, "html.parser")

        # Build a mapping: day_index -> date
        day_dates = self._parse_day_headers(soup, start_date)

        # Parse film blocks grouped by day
        container = soup.find("div", class_="contenedor_horarios")
        if not container:
            return []

        films_map: dict[str, dict] = {}  # film_link -> film dict
        current_day_idx = None

        for child in container.children:
            if not hasattr(child, "get"):
                continue

            # Day header
            if "rotulo_dia" in (child.get("class") or []):
                data_num = child.get("data-num")
                if data_num is not None:
                    current_day_idx = int(data_num)
                continue

            # Film container for a day
            classes = child.get("class") or []
            if "contenedor_cines" in classes and current_day_idx is not None:
                current_date = day_dates.get(current_day_idx)
                if current_date is None:
                    continue
                if (current_date.date() < start_date.date()
                        or current_date.date() > end_date.date()):
                    continue

                for block in child.find_all("div", class_="horarios"):
                    self._parse_film_block(
                        block, current_date, films_map
                    )

        # Sort dates within each film
        for film in films_map.values():
            film["dates"].sort(key=lambda d: d["timestamp"])

        return [f for f in films_map.values() if f["dates"]]

    def _parse_day_headers(
        self, soup: BeautifulSoup, reference_date: datetime
    ) -> dict[int, datetime]:
        """Extract day index -> date mapping from rotulo_dia headers.

        Day labels are: "Hoy", "Mañana", or "DayOfWeek DD/MM".
        Year is inferred from reference_date.
        """
        day_dates: dict[int, datetime] = {}

        for header in soup.find_all("div", class_="rotulo_dia"):
            data_num = header.get("data-num")
            if data_num is None:
                continue
            idx = int(data_num)

            text = header.get_text(strip=True)

            if text.lower() == "hoy":
                day_dates[idx] = reference_date
                continue

            # Try "DD/MM" pattern (e.g. "Viernes 27/03", "Mañana 26/03")
            m = re.search(r"(\d{1,2})/(\d{1,2})", text)
            if m:
                day = int(m.group(1))
                month = int(m.group(2))
                year = reference_date.year
                # Handle year wrap (Dec -> Jan)
                if month < reference_date.month - 6:
                    year += 1
                day_dates[idx] = datetime(year, month, day)

        return day_dates

    def _parse_film_block(
        self,
        block,
        current_date: datetime,
        films_map: dict[str, dict],
    ) -> None:
        """Parse a single div.horarios block and add sessions to films_map."""
        peli_div = block.find("div", class_="peli")
        horas_div = block.find("div", class_="horas")
        if not peli_div or not horas_div:
            return

        # Extract title
        title_tag = peli_div.find("b")
        if not title_tag:
            return
        title = title_tag.get_text(strip=True)
        if not title:
            return

        # Extract film detail link
        link_tag = peli_div.find("a", href=re.compile(r"/es/detalles/"))
        film_url = link_tag["href"] if link_tag else ""
        if film_url and not film_url.startswith("http"):
            film_url = f"{self.cinema_info.base_url}{film_url}"

        # Extract director from first p.gibsonL (contains "de DIRECTOR")
        director = None
        gibson_ps = peli_div.find_all("p", class_="gibsonL")
        if gibson_ps:
            raw = gibson_ps[0].get_text(strip=True)
            if raw.lower().startswith("de "):
                director = raw[3:].strip() or None

        # Extract sessions from time links
        for time_link in horas_div.find_all("a", class_="metrica"):
            span = time_link.find("span")
            is_vose = span and span.get_text(strip=True) == "VOSE" if span else False

            # Time text is outside the span
            time_text = time_link.get_text(strip=True)
            # Remove "VOSE" prefix if present
            time_text = time_text.replace("VOSE", "").strip()
            if not re.match(r"\d{1,2}:\d{2}$", time_text):
                continue

            ticket_url = time_link.get("href", "")
            timestamp = f"{current_date.strftime('%Y-%m-%d')} {time_text}"

            session: dict = {
                "timestamp": timestamp,
                "location": "mk2 Palacio de Hielo",
                "url_tickets": ticket_url,
                "url_info": film_url,
            }
            if is_vose:
                session["version"] = "VOSE"

            # Add to films map
            key = film_url or title
            if key not in films_map:
                films_map[key] = {
                    "theater": self.cinema_info.name,
                    "title": title,
                    "theater_film_link": film_url,
                    "dates": [],
                    "director": director,
                    "year": None,
                }

            films_map[key]["dates"].append(session)
