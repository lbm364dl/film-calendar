"""Sala Equis scraper implementation.

Catalog-based approach: fetches the /taquilla/ page to discover all film
detail URLs under /ciclos/, then visits each detail page to extract metadata
and the kinetike ticket link.  Uses Selenium to interact with the kinetike
page (clicking SESIONES) to reveal session times.  Ticket URLs remain the
generic kinetike URL for each film.
"""

import re
import time
from datetime import datetime

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class SalaEquisScraper(BaseCinemaScraper):
    """Scraper for Sala Equis (Madrid)."""

    BASE_URL = "https://salaequis.es"

    def __init__(self):
        super().__init__()
        self._browser = None

    def _get_browser(self):
        """Lazy-load a headless Chrome instance."""
        if self._browser is None:
            options = webdriver.ChromeOptions()
            options.add_argument("--disable-gpu")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            self._browser = webdriver.Chrome(options=options)
        return self._browser

    def _close_browser(self):
        """Close browser if open."""
        if self._browser:
            self._browser.quit()
            self._browser = None

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="sala-equis",
            name="Sala Equis",
            base_url=self.BASE_URL,
            update_period="weekly",
        )

    # -- base-class stubs (not used; we override fetch_films_from_date_range) --

    def build_day_url(self, date: datetime) -> str:
        raise NotImplementedError("Use fetch_films_from_date_range instead")

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        pass  # not used

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        pass  # not used

    # -- main entry point ------------------------------------------------------

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films from Sala Equis for the given date range."""
        # 1. Discover all film detail URLs from the taquilla page
        taquilla_url = f"{self.BASE_URL}/taquilla/"
        print(f"Fetching taquilla from {taquilla_url}")
        taquilla_html = self.fetch_html(taquilla_url)
        film_urls = self.parse_taquilla_page(taquilla_html)
        print(f"  Found {len(film_urls)} films")

        # 2. Fetch each film detail page (plain HTTP – no JS needed)
        all_films: list[dict] = []
        for film_url in film_urls:
            print(f"  Fetching {film_url}")
            try:
                detail_html = self.fetch_html(film_url)
            except Exception as e:
                print(f"    Error fetching {film_url}: {e}")
                continue
            time.sleep(0.3)

            film_data = self.parse_film_detail(detail_html, film_url)
            if film_data is None:
                continue

            kinetike_url = film_data.pop("_kinetike_url", None)
            if not kinetike_url:
                continue

            # 3. Use Selenium to scrape sessions from kinetike
            try:
                dates = self._scrape_kinetike_sessions(
                    kinetike_url, film_url, start_date, end_date
                )
            except Exception as e:
                print(f"    Error scraping kinetike sessions: {e}")
                continue

            if not dates:
                continue

            film_data["dates"] = dates
            all_films.append(film_data)

        self._close_browser()
        return all_films

    # -- parsing helpers -------------------------------------------------------

    def parse_taquilla_page(self, html: str) -> list[str]:
        """Extract unique film URLs from the /taquilla/ page.

        Returns a deduplicated list of ``/ciclos/<slug>/`` URLs.
        """
        soup = BeautifulSoup(html, "html.parser")
        seen: set[str] = set()
        results: list[str] = []

        for a_tag in soup.find_all(
            "a", href=lambda h: h and "/ciclos/" in h
        ):
            url = a_tag["href"].rstrip("/") + "/"
            # Skip the bare /ciclos/ index page
            if url.rstrip("/").endswith("/ciclos"):
                continue
            if url in seen:
                continue
            seen.add(url)
            results.append(url)

        return results

    def parse_film_detail(self, html: str, film_url: str) -> dict | None:
        """Parse a film detail page (``/ciclos/<slug>/``).

        Returns a dict with title, director, year, theater, theater_film_link,
        and an internal ``_kinetike_url`` key (used then removed by the caller).
        Returns ``None`` if the page cannot be parsed.
        """
        soup = BeautifulSoup(html, "html.parser")

        # --- Title (h1.product_title) ---
        h1 = soup.find("h1", class_="product_title")
        if not h1:
            return None
        raw_title = h1.get_text(strip=True)
        if not raw_title:
            return None
        # Titles on the site are ALL CAPS; convert to title case
        title = raw_title.title() if raw_title.isupper() else raw_title

        # --- Kinetike link ---
        kinetike_a = soup.find("a", href=lambda h: h and "kinetike" in h)
        kinetike_url = kinetike_a["href"] if kinetike_a else None

        # --- Short description metadata ---
        director = None
        year = None
        short_desc = soup.find("div", class_="shortDescription")
        if short_desc:
            paragraphs = [p.get_text(strip=True) for p in short_desc.find_all("p")]
            director, year = self._parse_short_description(paragraphs)

        return {
            "theater": self.cinema_info.name,
            "title": title,
            "theater_film_link": film_url,
            "director": director,
            "year": year,
            "_kinetike_url": kinetike_url,
        }

    @staticmethod
    def _parse_short_description(
        paragraphs: list[str],
    ) -> tuple[str | None, str | None]:
        """Extract director and year from the shortDescription paragraphs.

        Typical format::

            <i>Original title</i>
            Director Name / Country / 2025
            VOSE – 128 min
            No recomendada para menores de 18 años

        The director/year line matches ``Name / Country / YYYY``.
        """
        director = None
        year = None

        for p in paragraphs:
            # Look for "Director / Country / Year" pattern
            m = re.match(r"^(.+?)\s*/\s*.+?\s*/\s*(\d{4})\s*$", p)
            if m:
                director = m.group(1).strip()
                year = m.group(2)
                break

        return director, year

    def _scrape_kinetike_sessions(
        self,
        kinetike_url: str,
        film_url: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[dict]:
        """Use Selenium to extract sessions from the kinetike page.

        For each date row the scraper:
        1. Loads the kinetike page
        2. Clicks the SESIONES button to reveal time slots
        3. Extracts each visible session time from the rendered UI

        Returns session dicts filtered to the requested date range, with
        ``url_tickets`` set to the generic ``kinetike_url``.
        """
        browser = self._get_browser()

        # -- First pass: collect dates and decide which are in range ----------
        browser.get(kinetike_url)
        time.sleep(2)

        sesiones_btns = browser.find_elements(
            By.CSS_SELECTOR, 'input[value="SESIONES"]'
        )
        n_dates = len(sesiones_btns)
        if n_dates == 0:
            return []

        # Gather date strings from each row
        date_texts: list[str] = []
        for btn in sesiones_btns:
            row = btn.find_element(
                By.XPATH, './ancestor::div[contains(@class, "row")]'
            )
            spans = row.find_elements(By.TAG_NAME, "span")
            date_texts.append(spans[1].text.strip() if len(spans) > 1 else "")

        # -- Second pass: for each in-range date, click SESIONES and read times -
        all_sessions: list[dict] = []
        seen_timestamps: set[str] = set()
        for i in range(n_dates):
            date_str = date_texts[i]  # e.g. "03/03/2026"
            try:
                session_date = datetime.strptime(date_str, "%d/%m/%Y")
            except ValueError:
                continue

            if session_date.date() < start_date.date():
                continue
            if session_date.date() > end_date.date():
                continue

            # Reload and click SESIONES for this date to reveal times
            browser.get(kinetike_url)
            time.sleep(2)
            sesiones_btns = browser.find_elements(
                By.CSS_SELECTOR, 'input[value="SESIONES"]'
            )
            if i >= len(sesiones_btns):
                continue
            sesiones_btns[i].click()
            time.sleep(2)

            # Collect time values
            time_btns = browser.find_elements(
                By.CSS_SELECTOR, "input.btn.btn-info"
            )
            for tb in time_btns:
                time_val = (tb.get_attribute("value") or "").strip()
                if not time_val:
                    continue

                timestamp = f"{session_date.strftime('%Y-%m-%d')} {time_val}"
                if timestamp in seen_timestamps:
                    continue
                seen_timestamps.add(timestamp)

                all_sessions.append(
                    {
                        "timestamp": timestamp,
                        "location": self.cinema_info.name,
                        "url_tickets": kinetike_url,
                        "url_info": film_url,
                    }
                )
                print(f"    {timestamp}")

        all_sessions.sort(key=lambda d: d["timestamp"])
        return all_sessions

    # -- static HTML parser (used by tests) ------------------------------------

    @staticmethod
    def parse_kinetike_dates(html: str) -> list[str]:
        """Parse session dates from a kinetike sesionesFuturas HTML page.

        Returns a list of date strings in ``dd/mm/yyyy`` format.
        This is a static helper for unit-testing the HTML structure
        without requiring Selenium.
        """
        soup = BeautifulSoup(html, "html.parser")
        panel = soup.find("div", id="PanelSesiones")
        if not panel:
            return []

        dates: list[str] = []
        for row in panel.find_all(
            "div", class_="row no-gutters shadow-lg border rounded"
        ):
            spans = row.find_all("span")
            if len(spans) < 2:
                continue
            date_str = spans[1].get_text(strip=True)
            dates.append(date_str)
        return dates
