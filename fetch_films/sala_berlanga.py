"""Sala Berlanga scraper implementation.

Uses Selenium because:
- A date range picker must be interacted with to set the desired range.
- A "Ver más actividades" button must be clicked repeatedly to load all results.
"""

import re
import unicodedata
import time
from datetime import datetime
from urllib.parse import urljoin, urlparse, urlencode, parse_qs

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


# Spanish month names -> month number
SPANISH_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def parse_spanish_date(date_text: str, reference_year: int) -> str | None:
    """Parse a Spanish date string like '3 de Febrero - 17:00h' into 'YYYY-MM-DD HH:MM'.

    Args:
        date_text: e.g. "3 de Febrero - 17:00h"
        reference_year: year to use (from the scrape date range)

    Returns:
        Formatted string like "2025-02-03 17:00" or None if unparseable.
    """
    date_text = date_text.strip()
    if not date_text:
        return None

    # Pattern: "3 de Febrero - 17:00h"
    match = re.match(
        r"(\d{1,2})\s+de\s+(\w+)\s*-\s*(\d{1,2}:\d{2})h?",
        date_text,
        re.IGNORECASE,
    )
    if not match:
        return None

    day = int(match.group(1))
    month_name = match.group(2).lower()
    time_str = match.group(3)

    month = SPANISH_MONTHS.get(month_name)
    if month is None:
        return None

    return f"{reference_year:04d}-{month:02d}-{day:02d} {time_str}"


class SalaBerlangaScraper(BaseCinemaScraper):
    """Scraper for Sala Berlanga (Madrid).

    This scraper loads https://salaberlanga.com/programacion-de-actividades/,
    sets a date range, clicks "Ver más actividades" until all results load,
    then parses the resulting HTML for cinema sessions.
    """

    LISTING_URL = "https://salaberlanga.com/programacion-de-actividades/"
    ENTRADAS_SESSIONS_URL = (
        "https://cine.entradas.com/cine/madrid/sala-berlanga/sesiones"
    )

    def __init__(self):
        super().__init__()
        self._browser = None

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="sala-berlanga",
            name="Sala Berlanga",
            base_url="https://salaberlanga.com",
            update_period="weekly",
        )

    def build_day_url(self, date: datetime) -> str:
        """Not used – all sessions come from a single listing page."""
        return self.LISTING_URL

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Not used directly – we override fetch_films_from_date_range."""
        pass

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Not used directly – all info is on the listing page."""
        pass

    # -- Selenium helpers ------------------------------------------------

    def _get_browser(self):
        if self._browser is None:
            options = webdriver.ChromeOptions()
            options.add_argument("--disable-gpu")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            self._browser = webdriver.Chrome(options=options)
        return self._browser

    def _close_browser(self):
        if self._browser:
            self._browser.quit()
            self._browser = None

    def _set_date_range(self, browser, start_date: datetime, end_date: datetime):
        """Open the daterangepicker and select the desired range.

        Uses JavaScript entirely to avoid click-interception by the fixed navbar.
        Uses jQuery which may be loaded as 'jQuery' (noConflict mode).
        The picker uses DD/MM/YYYY format (Spanish locale).
        """
        # Format as DD/MM/YYYY for the Spanish-locale daterangepicker
        start_str = start_date.strftime("%d/%m/%Y")
        end_str = end_date.strftime("%d/%m/%Y")

        # Wait until the daterangepicker is initialised
        WebDriverWait(browser, 10).until(
            lambda d: d.execute_script(
                "return typeof jQuery !== 'undefined' && "
                "jQuery('#rango-fechas').data('daterangepicker') !== undefined"
            )
        )

        browser.execute_script(
            f"""
            var picker = jQuery('#rango-fechas').data('daterangepicker');
            picker.setStartDate('{start_str}');
            picker.setEndDate('{end_str}');
            picker.clickApply();
            """
        )
        time.sleep(2)

    def _click_load_more(self, browser, max_clicks: int = 20):
        """Click 'Ver más actividades' until it disappears."""
        for i in range(max_clicks):
            try:
                btn = browser.find_element(By.CSS_SELECTOR, "#mas-actividades")
                if not btn.is_displayed():
                    break
                # Use JS click to avoid navbar interception
                browser.execute_script("arguments[0].click();", btn)
                print(f"  Clicked 'Ver más actividades' ({i + 1})...")
                time.sleep(1.5)
            except Exception:
                break

    # -- Main entry point ------------------------------------------------

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films from Sala Berlanga for the given date range.

        Uses Selenium to:
        1. Navigate to the listing page
        2. Set the date range picker
        3. Click "Ver más actividades" until all results load
        4. Parse the resulting HTML
        """
        try:
            browser = self._get_browser()
            browser.get(self.LISTING_URL)

            # Wait for the page and daterangepicker to be ready
            WebDriverWait(browser, 15).until(
                lambda d: d.execute_script(
                    "return typeof jQuery !== 'undefined' && "
                    "jQuery('#rango-fechas').data('daterangepicker') !== undefined"
                )
            )

            # Set date range
            print("Setting date range...")
            self._set_date_range(browser, start_date, end_date)

            # Wait for AJAX results to load (spinner disappears, items appear)
            try:
                WebDriverWait(browser, 10).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, "#resultado-actividades .item-actividad")
                    )
                )
            except TimeoutException:
                print("Warning: timed out waiting for activities to load")

            time.sleep(1)

            # Load all results
            print("Loading all results...")
            self._click_load_more(browser)

            # Count what we got
            items = browser.find_elements(By.CSS_SELECTOR, "#resultado-actividades .item-actividad")
            print(f"  Found {len(items)} activity cards on page")

            html = browser.page_source

            films = self.parse_listing(html, start_date, end_date)

            # Second pass: visit each film's entradas.com page to get
            # per-session event URLs (more specific than the generic
            # showGroups URL).
            print("Fetching per-session ticket URLs...")
            for film in films:
                generic_ticket_url = None
                for d in film["dates"]:
                    if d.get("url_tickets"):
                        generic_ticket_url = d["url_tickets"]
                        break

                if not generic_ticket_url:
                    slug = self._slugify_title(film["title"])
                    if slug:
                        generic_ticket_url = (
                            f"{self.ENTRADAS_SESSIONS_URL}"
                            f"?ref=770&showAllDates=true&showGroups={slug}"
                        )
                    else:
                        continue

                print(f"  {film['title']}...")
                try:
                    session_map = self._fetch_session_urls(
                        browser, generic_ticket_url
                    )
                    # Match by "MM-DD HH:MM" key
                    for d in film["dates"]:
                        ts = d["timestamp"]  # "YYYY-MM-DD HH:MM"
                        # Build key: "DD/MM HH:MM"
                        try:
                            dt = datetime.strptime(ts, "%Y-%m-%d %H:%M")
                            key = f"{dt.day:02d}/{dt.month:02d} {dt.strftime('%H:%M')}"
                        except ValueError:
                            continue
                        if key in session_map:
                            d["url_tickets"] = session_map[key]
                except Exception as e:
                    print(f"    Warning: could not fetch session URLs: {e}")

        finally:
            self._close_browser()

        return films

    # -- Session URL helpers ---------------------------------------------

    def _fetch_session_urls(
        self, browser, sessions_url: str
    ) -> dict[str, str]:
        """Visit an entradas.com sessions page and return per-session URLs.

        The page is a Vue/Nuxt SPA so it needs Selenium to render.

        Args:
            browser: Active Selenium WebDriver instance.
            sessions_url: URL of the entradas.com sessions page (showGroups URL).

        Returns:
            Dict mapping ``"DD/MM HH:MM"`` -> event URL.
        """
        browser.get(sessions_url)

        # Wait for at least one session link to appear
        try:
            WebDriverWait(browser, 10).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "a[href*='evento']")
                )
            )
        except TimeoutException:
            print("    Warning: timed out waiting for session links")
            return {}

        time.sleep(0.5)  # let remaining links render
        return self.parse_sessions_page(browser.page_source)

    @staticmethod
    def _slugify_title(title: str) -> str:
        normalized = unicodedata.normalize("NFKD", title)
        ascii_title = normalized.encode("ascii", "ignore").decode("ascii")
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_title.lower()).strip("-")
        return slug

    @staticmethod
    def parse_sessions_page(html: str) -> dict[str, str]:
        """Parse an entradas.com sessions page and extract per-session URLs.

        The page has date header divs (e.g. ``"mar, 10/02"``) followed by
        ``<a>`` elements whose ``href`` contains ``/evento/XXXX`` and that
        contain a ``<div data-show-link-time="">HH:MM</div>`` child.

        Args:
            html: Full page HTML of the entradas.com sessions page.

        Returns:
            Dict mapping ``"DD/MM HH:MM"`` -> clean event URL (tracking
            parameters stripped).
        """
        soup = BeautifulSoup(html, "html.parser")
        date_pattern = re.compile(r"[a-záéíóú]+,\s*(\d{2}/\d{2})")
        session_map: dict[str, str] = {}

        base_url = "https://cine.entradas.com"

        for link in soup.find_all("a", href=lambda h: h and "evento" in h):
            time_div = link.find("div", attrs={"data-show-link-time": True})
            if not time_div:
                continue
            time_text = time_div.get_text(strip=True)  # e.g. "21:00"

            # Walk up / back to find the nearest date header
            current_date = None
            node = link
            while node:
                prev = node.find_previous_sibling()
                if prev and prev.name == "div":
                    m = date_pattern.match(prev.get_text(strip=True))
                    if m:
                        current_date = m.group(1)  # e.g. "10/02"
                        break
                node = node.parent
                if node is None or node.name == "body":
                    break

            if not current_date:
                continue

            # Clean URL: strip _gl and other tracking query params
            raw_url = link["href"]
            parsed = urlparse(raw_url)
            clean_url = parsed._replace(query="", fragment="").geturl()
            if not parsed.scheme:
                clean_url = urljoin(base_url, clean_url)

            key = f"{current_date} {time_text}"  # e.g. "10/02 21:00"
            session_map[key] = clean_url

        return session_map

    # -- Parsing ---------------------------------------------------------

    def parse_listing(
        self, html: str, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Parse the full listing HTML and return film data.

        Only includes activities categorised as "Cine".
        Filters individual session dates to the requested range.

        Args:
            html: Full page HTML after all results are loaded.
            start_date: Start of requested date range (inclusive).
            end_date: End of requested date range (inclusive).

        Returns:
            List of film dicts ready for DataFrame conversion.
        """
        soup = BeautifulSoup(html, "html.parser")

        # The filtered-activities section contains the consolidated list
        container = soup.select_one("#resultado-actividades")
        if not container:
            # Fallback: try the portada section
            container = soup.select_one("#portada-actividades")
        if not container:
            print("Warning: could not find activity container in HTML")
            return []

        cards = container.select(".item-actividad")
        if not cards:
            # Fallback: try any card structure  
            cards = container.select(".card")

        all_films: dict[str, dict] = {}  # keyed by activity URL

        for card in cards:
            film = self._parse_card(card, start_date, end_date)
            if film is None:
                continue

            key = film["theater_film_link"]
            if key not in all_films:
                all_films[key] = film
            else:
                # Merge dates
                existing_timestamps = {
                    d["timestamp"] for d in all_films[key]["dates"]
                }
                for d in film["dates"]:
                    if d["timestamp"] not in existing_timestamps:
                        all_films[key]["dates"].append(d)

        # Sort dates within each film
        for film in all_films.values():
            film["dates"].sort(key=lambda d: d["timestamp"])

        return list(all_films.values())

    def _parse_card(
        self, card, start_date: datetime, end_date: datetime
    ) -> dict | None:
        """Parse a single activity card element.

        Returns None if the card is not a cinema event or has no valid dates.
        """
        # Check category – only keep "Cine"
        category_el = card.select_one(".categoria-sala-berlanga p")
        if category_el:
            category = category_el.get_text(strip=True).lower()
            if category != "cine":
                return None

        # Title
        title_el = card.select_one(".card-title a")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        activity_url = title_el.get("href", "")
        if activity_url and not activity_url.startswith("http"):
            activity_url = urljoin(self.cinema_info.base_url, activity_url)

        # Director, year, duration from ".card-text-time"
        # Format: "Director | Year | Duration'"
        director = None
        year = None
        info_el = card.select_one(".card-text-time")
        if info_el:
            info_text = info_el.get_text(strip=True)
            parts = [p.strip() for p in info_text.split("|")]
            if len(parts) >= 1:
                director = parts[0].strip() or None
            if len(parts) >= 2:
                year_str = parts[1].strip()
                if year_str.isdigit():
                    year = year_str

        # Ticket URL (from "Entradas disponibles" link)
        ticket_url = None
        ticket_el = card.select_one(".card-text-comprar a")
        if ticket_el:
            ticket_url = ticket_el.get("href", "")

        # Parse screening dates
        dates_el = card.select_one(".card-text-date")
        if not dates_el:
            return None

        # Reference year: use start_date year, but individual dates may
        # cross year boundaries – we use start_date.year as default.
        reference_year = start_date.year

        film_dates = []
        # Dates are separated by <br> tags.  Iterate over text nodes.
        for text_node in dates_el.stripped_strings:
            # Skip "(sesión agotada)" annotations
            if "agotada" in text_node.lower():
                continue

            parsed = parse_spanish_date(text_node, reference_year)
            if parsed is None:
                continue

            # Filter to requested range
            try:
                dt = datetime.strptime(parsed, "%Y-%m-%d %H:%M")
            except ValueError:
                continue

            if dt.date() < start_date.date() or dt.date() > end_date.date():
                continue

            film_dates.append({
                "timestamp": parsed,
                "location": "Sala Berlanga",
                "url_tickets": ticket_url or "",
                "url_info": activity_url,
            })

        if not film_dates:
            return None

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": activity_url,
            "dates": film_dates,
            "director": director,
            "year": year,
        }
