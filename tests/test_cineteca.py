"""Tests for Cineteca Madrid scraper."""

import pytest
from datetime import datetime

from fetch_films.cineteca import CinetecaScraper


class TestCinetecaScraper:
    """Tests for CinetecaScraper parsing logic."""

    @pytest.fixture
    def scraper(self):
        return CinetecaScraper()

    def test_cinema_info(self, scraper):
        """Test cinema info is correctly configured."""
        info = scraper.cinema_info
        assert info.key == "cineteca"
        assert info.name == "Cineteca Madrid"
        assert "cinetecamadrid.com" in info.base_url

    def test_build_day_url(self, scraper):
        """Test URL construction for a specific date."""
        date = datetime(2026, 1, 15)
        url = scraper.build_day_url(date)
        assert "2026-01-15" in url
        assert "cinetecamadrid.com" in url

    def test_parse_films_list(self, scraper, load_fixture):
        """Test parsing film URLs from day listing page.
        
        Requires: tests/fixtures/cineteca/day_listing.html
        """
        html = load_fixture("cineteca", "day_listing.html")
        date = datetime(2026, 1, 15)
        
        film_urls = scraper.parse_films_list(html, date)
        
        # Assertions depend on the actual fixture content
        assert isinstance(film_urls, list)
        # Add specific assertions once fixture is provided:
        # assert len(film_urls) > 0
        # assert all("cinetecamadrid.com" in url for url in film_urls)

    def test_parse_film_page(self, scraper, load_fixture):
        """Test parsing film info from film detail page.
        
        Requires: tests/fixtures/cineteca/film_page.html
        """
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"
        
        film_info = scraper.parse_film_page(html, film_url, date)
        
        # Basic structure assertions
        assert film_info.theater == "Cineteca Madrid"
        assert film_info.theater_film_link == film_url
        assert isinstance(film_info.title, str)
        assert isinstance(film_info.dates, list)
        # Add specific assertions once fixture is provided:
        # assert film_info.title == "Expected Film Title"
        # assert film_info.year == "2025"
