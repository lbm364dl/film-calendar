"""Cine Doré / Filmoteca Española scraper implementation.

This scraper fetches all screenings by paginating through the listing pages,
since the website's date filters are currently broken. It then filters
results client-side based on the requested date range.
"""

import re
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class DoreScraper(BaseCinemaScraper):
    """Scraper for Cine Doré (Filmoteca Española).
    
    Due to broken date filters on the website, this scraper:
    1. Fetches all listing pages (using pagination)
    2. Extracts screening info and dates from each listing
    3. Filters screenings to the requested date range
    """

    BASE_URL = "https://entradasfilmoteca.sacatuentrada.es"
    
    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="dore",
            name="Cine Doré",
            base_url=self.BASE_URL,
        )

    def build_day_url(self, date: datetime) -> str:
        """Build URL for the main listing page.
        
        Since date filters are broken, we use the base search URL.
        """
        return f"{self.BASE_URL}/es/busqueda"

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch films showing in the given date range.
        
        Override base implementation to fetch all pages and filter by date.
        """
        # Fetch all pages of listings
        all_screenings = self._fetch_all_screenings()
        
        # Filter by date range
        filtered = []
        for screening in all_screenings:
            screening_date = screening.get("screening_date")
            if screening_date:
                if start_date.date() <= screening_date <= end_date.date():
                    # Remove internal screening_date key before returning
                    result = {k: v for k, v in screening.items() if k != "screening_date"}
                    filtered.append(result)

        return self._merge_duplicate_films(filtered)

    def _merge_duplicate_films(self, screenings: list[dict]) -> list[dict]:
        """Merge duplicate films into one row with multiple date entries.

        Doré sometimes publishes separate product URLs for the same film
        (e.g. slug and slug-ii). We merge by stable film identity fields,
        while preserving each session's specific `url_info` in `dates`.
        """
        merged_map: dict[tuple[str, str | None, str | None], dict] = {}

        for screening in screenings:
            key = (
                screening.get("title", ""),
                screening.get("director"),
                screening.get("year"),
            )

            if key not in merged_map:
                merged_map[key] = {
                    **screening,
                    "dates": list(screening.get("dates", [])),
                }
                continue

            existing = merged_map[key]
            existing_dates = existing.get("dates", [])
            new_dates = screening.get("dates", [])

            existing_set = {tuple(sorted(d.items())) for d in existing_dates}
            new_set = {tuple(sorted(d.items())) for d in new_dates}
            merged_set = existing_set.union(new_set)

            merged_dates = [dict(items) for items in merged_set]
            merged_dates.sort(key=lambda d: d.get("timestamp", ""))
            existing["dates"] = merged_dates

        merged_list = list(merged_map.values())
        merged_list.sort(key=lambda film: (film.get("title", ""), film.get("year") or ""))
        return merged_list

    def _fetch_all_screenings(self) -> list[dict]:
        """Fetch all screenings from all listing pages."""
        all_screenings = []
        page = 1
        max_pages = None
        
        while max_pages is None or page <= max_pages:
            url = f"{self.BASE_URL}/es/busqueda?pagina={page}"
            print(f"Fetching Doré page {page}...")
            
            response = requests.get(url)
            if response.status_code != 200:
                print(f"  Error fetching page {page}: {response.status_code}")
                break
            
            html = response.text
            
            # Get max pages from first fetch
            if max_pages is None:
                max_pages = self._get_total_pages(html)
                print(f"  Found {max_pages} pages total")
            
            # Parse screenings from this page
            screenings = self.parse_films_list(html, datetime.now())
            all_screenings.extend(screenings)
            print(f"  Found {len(screenings)} screenings on page {page}")
            
            page += 1
        
        return all_screenings

    def _get_total_pages(self, html: str) -> int:
        """Extract the total number of pages from pagination.
        
        Looks for the "last_page" link in the pagination controls.
        """
        soup = BeautifulSoup(html, features="html.parser")
        pagination = soup.find("ul", class_="pagination")
        
        if not pagination:
            return 1
        
        # Find the "last page" link (icon: last_page)
        last_page_link = pagination.find("i", string="last_page")
        if last_page_link and last_page_link.parent:
            href = last_page_link.parent.get("href", "")
            match = re.search(r"pagina=(\d+)", href)
            if match:
                return int(match.group(1))
        
        # Fallback: count page number links
        page_links = pagination.find_all("a", href=re.compile(r"pagina=\d+"))
        max_page = 1
        for link in page_links:
            match = re.search(r"pagina=(\d+)", link.get("href", ""))
            if match:
                max_page = max(max_page, int(match.group(1)))
        
        return max_page

    def parse_films_list(self, html: str, date: datetime) -> list[dict]:
        """Parse listing page and extract screening info.
        
        Each screening div has a `data-fecha` attribute with the screening date.
        Returns a list of dicts with film info and screening_date for filtering.
        """
        soup = BeautifulSoup(html, features="html.parser")
        screenings = []
        
        # Find all screening divs (they have data-fecha attribute)
        for item in soup.find_all("div", attrs={"data-fecha": True}):
            screening_date_str = item.get("data-fecha")
            
            try:
                screening_date = datetime.strptime(screening_date_str, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            
            # Find the info section
            info = item.find("div", class_="info")
            if not info:
                continue
            
            # Extract title from h2.titulo
            title_elem = info.find("h2", class_="titulo")
            raw_title = title_elem.text.strip() if title_elem else None
            
            if not raw_title:
                continue
            
            # Extract year from raw title if present (format: "Title (Original Title, YYYY)")
            year = None
            year_match = re.search(r"\(.*?(\d{4})\)", raw_title)
            if year_match:
                year = year_match.group(1)
            
            # Clean title: remove everything in parentheses (original title, year)
            # "Un asunto de familia (Manbiki kazoku, 2018)" -> "Un asunto de familia"
            title = re.sub(r"\s*\([^)]*\)\s*$", "", raw_title).strip()
            
            # Extract director from h3.subtitulo
            director_elem = info.find("h3", class_="subtitulo")
            director = director_elem.text.strip() if director_elem else None
            
            # Extract screening time from description
            screening_time = None
            desc = info.find("div", class_="descripcion")
            if desc:
                time_match = re.search(r"(\d{1,2}:\d{2})h", desc.text)
                if time_match:
                    screening_time = time_match.group(1)
            
            # Find the info link ("+INFO" button)
            info_link = item.find("a", class_="mas-info")
            film_url = None
            if info_link and info_link.get("href"):
                film_url = urljoin(self.BASE_URL, info_link["href"])

            # Format dates as list of structured dicts
            if screening_time:
                timestamp = f"{screening_date} {screening_time}"
            else:
                timestamp = str(screening_date)

            dates = [{
                "timestamp": timestamp,
                "location": self.cinema_info.name,
                "url_tickets": "",
                "url_info": film_url or "",
            }]

            screenings.append({
                "theater": self.cinema_info.name,
                "title": title,
                "theater_film_link": film_url,
                "dates": dates,
                "director": director,
                "year": year,
                "screening_date": screening_date,  # For filtering (removed before output)
            })
        
        return screenings

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Parse a film detail page and extract film information.
        
        Note: With the new approach, we extract most info from the listing page,
        so this is only used if we need additional details.
        """
        soup = BeautifulSoup(html, features="html.parser")
        
        # Extract title from page
        title_elem = soup.find("h1") or soup.find("h2", class_="titulo")
        title = title_elem.text.strip() if title_elem else "Unknown"
        
        # Extract year from title
        year = None
        year_match = re.search(r"\(.*?(\d{4})\)", title)
        if year_match:
            year = year_match.group(1)
        
        return FilmInfo(
            theater=self.cinema_info.name,
            title=title,
            director=None,
            year=year,
            theater_film_link=film_url,
            dates=[],
        )


# Backward compatibility wrapper removed.
