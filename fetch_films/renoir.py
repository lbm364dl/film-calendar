"""Cines Renoir scraper implementation."""

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from dateutil.rrule import rrule, DAILY

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class RenoirScraper(BaseCinemaScraper):
    """Scraper for Cines Renoir (Princesa, Retiro, Plaza de España)."""

    LOCATIONS = {
        "Princesa": "https://www.cinesrenoir.com/cine/cines-princesa/cartelera/",
        "Retiro": "https://www.cinesrenoir.com/cine/renoir-retiro/cartelera/",
        "Plaza de España": "https://www.cinesrenoir.com/cine/renoir-plaza-de-espana/cartelera/",
    }

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="renoir",
            name="Cines Renoir",
            base_url="https://www.cinesrenoir.com",
            update_period="weekly",
        )

    def build_day_url(self, date: datetime) -> str:
        """Not used directly as we have multiple locations."""
        raise NotImplementedError("Use fetch_films_from_date_range instead")

    def fetch_films_from_date_range(
        self, start_date: datetime, end_date: datetime
    ) -> list[dict]:
        """Fetch films from all Renoir locations for the date range."""
        all_films_map = {}  # Map (title, url) -> FilmInfo dict

        for day in rrule(DAILY, dtstart=start_date, until=end_date):
            print(f"Checking day {day.date()}...")
            
            for location_name, base_url in self.LOCATIONS.items():
                url = f"{base_url}?fecha={day.strftime('%Y-%m-%d')}"
                print(f"  Fetching {location_name}...")
                
                html = self.fetch_html(url)
                films = self.parse_films_list_for_location(html, day, location_name)
                
                for film in films:
                    key = (film["title"], film["theater_film_link"])
                    if key not in all_films_map:
                        all_films_map[key] = film
                    else:
                        # Merge dates (list of dicts)
                        existing_dates = all_films_map[key]["dates"]
                        new_dates = film["dates"]
                        
                        # Use a set of tuples to dedup, then convert back to list of dicts
                        # dict is not hashable, so we convert to tuple of sorted items
                        existing_set = {tuple(sorted(d.items())) for d in existing_dates}
                        new_set = {tuple(sorted(d.items())) for d in new_dates}
                        
                        merged_set = existing_set.union(new_set)
                        
                        # Convert back to list of dicts and sort by timestamp
                        merged_list = [dict(t) for t in merged_set]
                        merged_list.sort(key=lambda x: x["timestamp"])
                        
                        all_films_map[key]["dates"] = merged_list

        return list(all_films_map.values())

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Not used directly."""
        pass

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Not used directly."""
        pass

    def parse_films_list_for_location(
        self, html: str, date: datetime, location_name: str
    ) -> list[dict]:
        """Parse listing page for a specific location."""
        soup = BeautifulSoup(html, features="html.parser")
        films = []

        # Use the Large/XL view to avoid duplicates
        # Each film is in a div with class 'my-account-content' and visible on desktop
        for container in soup.select("div.my-account-content.d-none.d-lg-block"):
            # Title and URL container is the col-4
            info_col = container.select_one("div.col-4")
            if not info_col:
                continue

            title_tag = info_col.find("a")
            if not title_tag:
                continue
            
            title = title_tag.text.strip()
            # If title is all uppercase, convert to title case
            if title.isupper():
                title = title.title()
                
            film_url = title_tag.get("href")
            if film_url and not film_url.startswith("http"):
                film_url = urljoin(self.cinema_info.base_url, film_url)

            # Director is in <small><b> de Name </b></small>
            director = None
            director_tag = info_col.find("small")
            if director_tag:
                bold_tag = director_tag.find("b")
                if bold_tag:
                    director_text = bold_tag.text.strip()
                    if director_text.lower().startswith("de "):
                        director = director_text[3:].strip()
                    else:
                        director = director_text

            # Screenings are in col-7
            screenings_col = container.select_one("div.col-7")
            film_dates = []
            if screenings_col:
                for time_div in screenings_col.select("div.text-center"):
                    time_link = time_div.find("a", class_="btn")
                    if time_link:
                        time_str = time_link.text.strip()
                        # Construct full date string: YYYY-MM-DD HH:MM
                        full_date_str = f"{date.strftime('%Y-%m-%d')} {time_str}"
                        
                        # Add structured info
                        film_dates.append({
                            "timestamp": full_date_str,
                            "location": location_name
                        })

            if not film_dates:
                continue

            films.append({
                "theater": self.cinema_info.name,
                "title": title,
                "theater_film_link": film_url,
                "dates": film_dates,
                "director": director,
                "year": None,  # Rely on director match or exact title logic
            })
        return films
