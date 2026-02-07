"""Golem scraper implementation."""

import time
from datetime import datetime
from bs4 import BeautifulSoup
from dateutil.rrule import rrule, DAILY

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class GolemScraper(BaseCinemaScraper):
    """Scraper for Golem Madrid."""

    def __init__(self):
        super().__init__()
        # Cache for film details map: url -> director
        self._film_details_cache = {}

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="golem",
            name="Golem Madrid",
            base_url="https://www.golem.es",
            update_period="weekly",
        )

    def build_day_url(self, date: datetime) -> str:
        """Construct the URL for fetching films on a specific date."""
        return f"https://www.golem.es/golem/golem-madrid/{date.strftime('%Y%m%d')}"

    def clean_info_url(self, url: str) -> str:
        """Ensure URL is absolute."""
        if url and not url.startswith("http"):
            return f"https://www.golem.es{url}"
        return url

    def parse_film_director(self, html: str) -> str:
        """Extract director from film detail page."""
        soup = BeautifulSoup(html, 'html.parser')
        # Logic to find "Dirigida por:"
        director_label = soup.find('td', string=lambda text: text and 'Dirigida por:' in text)
        if director_label:
            director_val = director_label.find_next_sibling('td')
            if director_val:
                text = director_val.get_text(strip=True)
                return text.title()
        return None

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Not used directly as we override fetch_films_for_day logic or fetch_films_from_date_range."""
        pass

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Not used directly."""
        pass

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch all films between start_date and end_date."""
        all_films_map = {} # (title, url) -> {entries}

        for day in rrule(DAILY, dtstart=start_date, until=end_date):
            print(f"Checking day {day.date()}...")
            
            url = self.build_day_url(day)
            html = self.fetch_html(url)
            
            day_films = self._parse_listing_page(html, day)
            
            for f in day_films:
                key = (f["title"], f["url_info"])
                if key not in all_films_map:
                    all_films_map[key] = {
                        "theater": self.cinema_info.name,
                        "title": f["title"],
                        "theater_film_link": f["url_info"],
                        "dates": [],
                        "director": None, # Will fetch later
                        "year": None
                    }
                
                # Add dates
                all_films_map[key]["dates"].extend(f["dates"])

        # Create list of final films
        results = []
        for key, film_data in all_films_map.items():
            film_url = film_data["theater_film_link"]
            
            # Fetch director if not cached
            if film_url not in self._film_details_cache:
                print(f"  Fetching details for {film_data['title']}...")
                try:
                    detail_html = self.fetch_html(film_url)
                    director = self.parse_film_director(detail_html)
                    self._film_details_cache[film_url] = director
                    time.sleep(0.5) # Be nice
                except Exception as e:
                    print(f"  Error fetching details for {film_url}: {e}")
                    self._film_details_cache[film_url] = None
            
            film_data["director"] = self._film_details_cache.get(film_url)
            
            # Sort dates
            film_data["dates"].sort(key=lambda x: x["timestamp"])
            results.append(film_data)
            
        return results

    def _parse_listing_page(self, html: str, date: datetime) -> list[dict]:
        """Parse the daily listing page."""
        soup = BeautifulSoup(html, 'html.parser')
        films = []
        
        titles = soup.find_all('a', class_='txtNegXXL')
        for title_tag in titles:
            title = title_tag.get_text(strip=True)
            # Remove (V.O.S.E.) suffix
            title = title.replace(" (V.O.S.E.)", "").strip()
            
            info_url = title_tag.get('href', "")
            info_url = self.clean_info_url(info_url)
            
            # Navigate to the container to find showtimes
            # We look for the main block table
            curr = title_tag
            main_block = None
            for _ in range(6):
                if curr.name == 'table' and curr.find('td', class_='CajaVentasSup'):
                    main_block = curr
                    break
                # Try finding by white background parent td
                parent_td = title_tag.find_parent('td', bgcolor="#ffffff")
                if parent_td:
                    main_block = parent_td
                    break
                if curr.parent:
                    curr = curr.parent
                else:
                    break
            
            if not main_block:
                continue

            film_dates = []
            time_spans = main_block.find_all('span', class_='horaXXXL')
            for span in time_spans:
                a_tag = span.find('a')
                if a_tag:
                    time_str = a_tag.get_text(strip=True)
                    ticket_url = a_tag.get('href', "")
                    
                    full_date = f"{date.strftime('%Y-%m-%d')} {time_str}"
                    film_dates.append({
                        "timestamp": full_date,
                        "location": "Golem",
                        "url_tickets": self.clean_info_url(ticket_url),
                        "url_info": info_url
                    })
            
            if film_dates:
                films.append({
                    "title": title,
                    "url_info": info_url,
                    "dates": film_dates
                })
        return films
