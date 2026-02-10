"""Circulo de Bellas Artes scraper implementation."""

import re
import time
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from dateutil.rrule import rrule, DAILY

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Spanish abbreviated day-of-week names (as they appear on the site)
SPANISH_DAYS = {
    "lun": 0, "mar": 1, "mié": 2, "jue": 3,
    "vie": 4, "sáb": 5, "dom": 6,
}

# Spanish abbreviated month names
SPANISH_MONTHS = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4,
    "may": 5, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def _resolve_year_from_tab_label(tab_label: str) -> int:
    """Extract year from tab button text like 'Cartelera  9 Feb / 15 Feb'.

    Since the site doesn't include the year in the tab label, we infer it
    from the current date context. The tab label contains month info which
    helps disambiguate around year boundaries.
    """
    # This is a best-effort: we use the current year.
    # In practice, sessions are always near-future so current year is correct.
    return datetime.now().year


def _parse_day_string(day_str: str, year: int) -> datetime:
    """Parse a day string like 'Mié, 11 Feb' into a datetime.

    Args:
        day_str: Spanish day string, e.g. 'Mié, 11 Feb'
        year: The year to assign

    Returns:
        datetime for that date
    """
    # Format: "Mié, 11 Feb" or "Dom, 15 Feb"
    parts = day_str.strip().split(",")
    if len(parts) != 2:
        raise ValueError(f"Unexpected day format: {day_str!r}")

    date_part = parts[1].strip()  # "11 Feb"
    tokens = date_part.split()
    if len(tokens) != 2:
        raise ValueError(f"Unexpected date part: {date_part!r}")

    day_num = int(tokens[0])
    month_abbr = tokens[1].lower().rstrip(".")
    month_num = SPANISH_MONTHS.get(month_abbr)
    if month_num is None:
        raise ValueError(f"Unknown Spanish month: {tokens[1]!r}")

    return datetime(year, month_num, day_num)


class CirculoBellasArtesScraper(BaseCinemaScraper):
    """Scraper for Círculo de Bellas Artes – Cine Estudio.

    The site publishes weekly schedules in tab panels. We scrape all tabs
    from a single page load, then visit each film's detail page for
    ticket URLs and additional metadata (director, year).
    """

    LISTING_URL = "https://www.circulobellasartes.com/cine-estudio/"

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="circulo-bellas-artes",
            name="Círculo de Bellas Artes",
            base_url="https://www.circulobellasartes.com",
            update_period="weekly",
        )

    def build_day_url(self, date: datetime) -> str:
        """Not used directly – we fetch once from a single listing URL."""
        return self.LISTING_URL

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Not used directly – overridden by fetch_films_from_date_range."""
        pass

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Not used directly – we parse detail pages inline."""
        pass

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films from the listing page, across all weekly tabs."""
        html = self.fetch_html(self.LISTING_URL)
        return self.parse_and_fetch_details(html, start_date, end_date)

    def parse_and_fetch_details(
        self, listing_html: str, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Parse listing HTML and fetch detail pages for each unique film.

        This is the testable core: it takes raw HTML and returns film dicts.
        Sessions outside the [start_date, end_date] range are filtered out
        before fetching detail pages, avoiding unnecessary HTTP requests.
        """
        raw_sessions = self._parse_all_tabs(listing_html)

        # Filter sessions to the requested date range
        filtered_sessions = []
        for session in raw_sessions:
            try:
                session_date = datetime.strptime(
                    session["timestamp"].split(" ")[0], "%Y-%m-%d"
                )
            except (ValueError, IndexError):
                continue
            if start_date.date() <= session_date.date() <= end_date.date():
                filtered_sessions.append(session)

        if not filtered_sessions:
            print("  No sessions found in the requested date range.")
            return []

        print(
            f"  {len(filtered_sessions)}/{len(raw_sessions)} sessions "
            f"in date range {start_date.date()} – {end_date.date()}"
        )

        # Group by film URL to deduplicate
        films_map: dict[str, dict] = {}
        for session in filtered_sessions:
            url = session["film_url"]
            if url not in films_map:
                films_map[url] = {
                    "theater": self.cinema_info.name,
                    "title": session["title"],
                    "theater_film_link": url,
                    "dates": [],
                    "director": session.get("director"),
                    "year": None,
                }
            films_map[url]["dates"].append({
                "timestamp": session["timestamp"],
                "location": "Cine Estudio",
                "url_tickets": "",
                "url_info": url,
            })

        # Fetch detail pages for ticket URLs and metadata
        for film_url, film_data in films_map.items():
            print(f"  Fetching details for {film_data['title']}...")
            try:
                detail_html = self.fetch_html(film_url)
                detail = self._parse_film_detail(detail_html)
                if detail.get("url_tickets"):
                    for d in film_data["dates"]:
                        d["url_tickets"] = detail["url_tickets"]
                if detail.get("director"):
                    film_data["director"] = detail["director"]
                if detail.get("year"):
                    film_data["year"] = detail["year"]
                time.sleep(0.5)
            except Exception as e:
                print(f"  Error fetching details for {film_url}: {e}")

        # Sort dates within each film
        for film_data in films_map.values():
            film_data["dates"].sort(key=lambda x: x["timestamp"])

        return list(films_map.values())

    # ------------------------------------------------------------------
    # Listing parsing
    # ------------------------------------------------------------------

    def _parse_all_tabs(self, html: str) -> list[dict]:
        """Parse all weekly tabs and return a flat list of session dicts.

        Each dict has: title, film_url, director, timestamp
        """
        soup = BeautifulSoup(html, "html.parser")
        sessions = []

        # Determine year from tab labels
        tab_buttons = soup.find_all("button", class_="tablink")
        year = datetime.now().year
        if tab_buttons:
            year = _resolve_year_from_tab_label(tab_buttons[0].get_text())

        # Iterate all tab content divs
        for tab_div in soup.find_all("div", class_="tabcontent"):
            sessions.extend(self._parse_tab(tab_div, year))

        return sessions

    def _parse_tab(self, tab_div, year: int) -> list[dict]:
        """Parse a single weekly tab div."""
        sessions = []
        for day_container in tab_div.find_all("div", class_="cba_cine_table_container"):
            day_div = day_container.find("div", class_="cba_cine_table_dia")
            if not day_div:
                continue
            day_str = day_div.get_text(strip=True)
            try:
                day_date = _parse_day_string(day_str, year)
            except ValueError as e:
                print(f"  Skipping unparseable day: {e}")
                continue

            sessions_container = day_container.find(
                "div", class_="cba_cine_sesiones_container"
            )
            if not sessions_container:
                continue

            sessions.extend(
                self._parse_sessions(sessions_container, day_date)
            )
        return sessions

    def _parse_sessions(self, container, day_date: datetime) -> list[dict]:
        """Parse sessions from a cba_cine_sesiones_container.

        Sessions are a repeating pattern of:
          div.cba_cine_table_hora  -> time
          div.cba_cine_table_titulo -> title link + director text
          div.cba_cine_table_tipo  -> type (Estreno, Ciclo, ...)
          div.cba_cine_table_info  -> extra info
        """
        sessions = []
        children = list(container.children)

        current_time = None
        for child in children:
            if not hasattr(child, "get"):
                continue  # skip NavigableString

            classes = child.get("class", [])

            if "cba_cine_table_hora" in classes:
                current_time = child.get_text(strip=True)

            elif "cba_cine_table_titulo" in classes and current_time:
                link = child.find("a")
                if not link:
                    continue
                title = link.get_text(strip=True)
                film_url = link.get("href", "")

                # Director is the text after the <a> tag
                director = None
                remaining_text = link.next_sibling
                if remaining_text and isinstance(remaining_text, str):
                    director = remaining_text.strip()
                    if not director:
                        director = None

                timestamp = f"{day_date.strftime('%Y-%m-%d')} {current_time}"
                sessions.append({
                    "title": title,
                    "film_url": film_url,
                    "director": director,
                    "timestamp": timestamp,
                })
                current_time = None  # consumed

        return sessions

    # ------------------------------------------------------------------
    # Film detail page parsing
    # ------------------------------------------------------------------

    def _parse_film_detail(self, html: str) -> dict:
        """Parse a film detail page for ticket URL, director, and year.

        Returns dict with keys: url_tickets, director, year
        """
        soup = BeautifulSoup(html, "html.parser")
        result = {"url_tickets": "", "director": None, "year": None}

        # Ticket URL: <a class="fl-button"> containing "Comprar Entradas"
        for btn in soup.find_all("a", class_="fl-button"):
            btn_text_span = btn.find("span", class_="fl-button-text")
            if btn_text_span and "Comprar Entradas" in btn_text_span.get_text():
                result["url_tickets"] = btn.get("href", "")
                break

        # Technical details table: class="cba_tabla_ficha"
        ficha_table = soup.find("table", class_="cba_tabla_ficha")
        if ficha_table:
            for row in ficha_table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 2:
                    label = cells[0].get_text(strip=True)
                    value = cells[1].get_text(strip=True)
                    if label == "Dirección" and value:
                        result["director"] = value
                    elif label == "Año" and value:
                        result["year"] = value

        return result
