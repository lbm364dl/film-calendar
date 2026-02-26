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

        assert isinstance(film_urls, list)
        assert len(film_urls) == 2
        assert all("cinetecamadrid.com" in url for url in film_urls)

    def test_parse_film_page(self, scraper, load_fixture):
        """Test parsing film info from film detail page.

        Requires: tests/fixtures/cineteca/film_page.html
        """
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)

        assert film_info.theater == "Cineteca Madrid"
        assert film_info.theater_film_link == film_url
        assert isinstance(film_info.title, str)
        assert isinstance(film_info.dates, list)
        assert film_info.title == "Los Chichos: Ni más ni menos"
        assert film_info.year == "2025"

    def test_dates_are_dicts(self, scraper, load_fixture):
        """Each date entry should be a dict with required keys."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)

        assert len(film_info.dates) >= 1
        d = film_info.dates[0]
        assert isinstance(d, dict)
        assert "timestamp" in d
        assert "location" in d
        assert "url_tickets" in d
        assert "url_info" in d

    def test_date_timestamp(self, scraper, load_fixture):
        """Timestamp should be correctly parsed from month header and day."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)
        d = film_info.dates[0]
        assert d["timestamp"] == "2026-01-29 20:00"

    def test_date_location(self, scraper, load_fixture):
        """Location should be the theater name for Cineteca sessions."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)
        d = film_info.dates[0]
        assert d["location"] == "Cineteca Madrid"

    def test_url_tickets(self, scraper, load_fixture):
        """url_tickets should be the tienda.madrid-destino link."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)
        d = film_info.dates[0]
        assert "tienda.madrid-destino.com" in d["url_tickets"]
        assert "los-chichos" in d["url_tickets"]

    def test_url_info(self, scraper, load_fixture):
        """url_info should be the film's cinetecamadrid.com page URL."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)
        d = film_info.dates[0]
        assert d["url_info"] == film_url

    def test_director_parsed(self, scraper, load_fixture):
        """Director should be extracted from the page."""
        html = load_fixture("cineteca", "film_page.html")
        date = datetime(2026, 1, 15)
        film_url = "https://www.cinetecamadrid.com/pelicula/test-film"

        film_info = scraper.parse_film_page(html, film_url, date)
        assert film_info.director == "Paco Millán"
