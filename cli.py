"""Command-line interface for film-calendar."""

import sys
import argparse
from datetime import datetime
from pathlib import Path


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Film calendar scraper - fetch screening films from theaters and rate them on Letterboxd",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Scrape subcommand
    scrape_parser = subparsers.add_parser(
        "scrape",
        help="Scrape films from theaters for a date range",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    scrape_parser.add_argument(
        "--start-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d"),
        required=True,
        help="Date from which to start the search. Format YYYY-mm-dd.",
    )
    scrape_parser.add_argument(
        "--end-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d"),
        required=True,
        help="Date from which to end the search. Format YYYY-mm-dd.",
    )
    scrape_parser.add_argument(
        "--update-csv",
        type=str,
        help="Path of CSV file to update with new films (removes duplicates).",
    )
    scrape_parser.add_argument(
        "--fetch-from",
        type=str,
        action="append",
        choices=["dore", "cineteca"],
        default=[],
        help="Theater(s) to fetch from. Repeat for multiple theaters.\nExample: --fetch-from dore --fetch-from cineteca",
    )

    # New cinema subcommand
    new_cinema_parser = subparsers.add_parser(
        "new-cinema",
        help="Generate boilerplate for a new cinema scraper",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    new_cinema_parser.add_argument(
        "--key",
        type=str,
        required=True,
        help="Short identifier for the cinema (e.g., 'golem'). Used for filenames.",
    )
    new_cinema_parser.add_argument(
        "--name",
        type=str,
        required=True,
        help="Display name for the cinema (e.g., 'Cines Golem').",
    )
    new_cinema_parser.add_argument(
        "--url",
        type=str,
        required=True,
        help="Base URL of the cinema website (e.g., 'https://golem.es').",
    )

    args = parser.parse_args(args=(sys.argv[1:] or ["--help"]))
    
    # Show help if no command provided
    if args.command is None:
        parser.print_help()
        sys.exit(1)
    
    return args


def generate_cinema_boilerplate(key: str, name: str, url: str) -> None:
    """Generate boilerplate files for a new cinema scraper."""
    # Determine paths
    project_root = Path(__file__).parent
    scraper_file = project_root / "fetch_films" / f"{key}.py"
    fixtures_dir = project_root / "tests" / "fixtures" / key
    
    # Check if scraper already exists
    if scraper_file.exists():
        print(f"Error: Scraper file already exists: {scraper_file}")
        sys.exit(1)
    
    # Generate scraper code
    class_name = "".join(word.capitalize() for word in key.split("_")) + "Scraper"
    scraper_code = f'''"""{ name } scraper implementation."""

import re
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .base import BaseCinemaScraper, CinemaInfo, FilmInfo


class {class_name}(BaseCinemaScraper):
    """Scraper for {name}."""

    @property
    def cinema_info(self) -> CinemaInfo:
        return CinemaInfo(
            key="{key}",
            name="{name}",
            base_url="{url}",
        )

    def build_day_url(self, date: datetime) -> str:
        # TODO: Implement URL construction for this cinema
        # Example: return f"{{self.cinema_info.base_url}}/programacion?date={{date.date()}}"
        raise NotImplementedError("Implement build_day_url for {name}")

    def parse_films_list(self, html: str, date: datetime) -> list[str]:
        """Parse day listing page and return film detail URLs.
        
        TODO: Implement parsing logic for {name}.
        Use BeautifulSoup to extract film URLs from the HTML.
        """
        soup = BeautifulSoup(html, features="html.parser")
        # TODO: Find and return list of film detail page URLs
        # Example:
        # return [
        #     urljoin(self.cinema_info.base_url, a["href"])
        #     for a in soup.select("a.film-link")
        # ]
        raise NotImplementedError("Implement parse_films_list for {name}")

    def parse_film_page(self, html: str, film_url: str, date: datetime) -> FilmInfo:
        """Parse a film detail page and extract film information.
        
        TODO: Implement parsing logic for {name}.
        Extract title, director, year, and screening dates.
        """
        soup = BeautifulSoup(html, features="html.parser")
        
        # TODO: Extract film details from the page
        # Example:
        # title = soup.select_one("h1.film-title").text.strip()
        # director = soup.select_one(".director").text.strip()
        # year = soup.select_one(".year").text.strip()
        
        return FilmInfo(
            theater=self.cinema_info.name,
            title="TODO",  # Replace with actual parsing
            director=None,
            year=None,
            theater_film_link=film_url,
            dates=[],
        )


# Backward compatibility: keep the function interface
_scraper = {class_name}()


def fetch_films_from_date_range(start_date: datetime, end_date: datetime) -> list[dict]:
    """Fetch films from {name} for a date range."""
    return _scraper.fetch_films_from_date_range(start_date, end_date)
'''
    
    # Write scraper file
    scraper_file.write_text(scraper_code)
    print(f"✓ Created scraper: {scraper_file}")
    
    # Create fixtures directory
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created fixtures directory: {fixtures_dir}")
    
    # Create placeholder files in fixtures
    (fixtures_dir / "day_listing.html").write_text(
        f"<!-- Sample HTML for {name} day listing page -->\n"
        "<!-- Save actual HTML from the website here -->\n"
    )
    (fixtures_dir / "film_page.html").write_text(
        f"<!-- Sample HTML for {name} film detail page -->\n"
        "<!-- Save actual HTML from the website here -->\n"
    )
    print(f"✓ Created fixture placeholders in {fixtures_dir}")
    
    # Print next steps
    print(f"""
Next steps:
1. Edit {scraper_file} and implement:
   - build_day_url(): construct URL for a given date
   - parse_films_list(): extract film URLs from day listing HTML
   - parse_film_page(): extract film info from film page HTML

2. Save sample HTML files to {fixtures_dir}:
   - day_listing.html: HTML of a page listing films for a day
   - film_page.html: HTML of a single film's detail page

3. Create test file tests/test_{key}.py (see test_cineteca.py for example)

4. Register the scraper in theaters.py:
   - Add import: from fetch_films.{key} import {class_name}, fetch_films_from_date_range as fetch_{key}_films
   - Add to FETCH_THEATER_FILMS: "{key}": fetch_{key}_films
   - Add to SCRAPERS: "{key}": {class_name}()

5. Update cli.py: add "{key}" to --fetch-from choices
""")
