"""Tests for Sala Berlanga scraper."""

import pytest
from datetime import datetime

from fetch_films.sala_berlanga import SalaBerlangaScraper, parse_spanish_date


class TestParseSpanishDate:
    """Tests for the Spanish date parser helper."""

    def test_normal_date(self):
        result = parse_spanish_date("3 de Febrero - 17:00h", 2025)
        assert result == "2025-02-03 17:00"

    def test_double_digit_day(self):
        result = parse_spanish_date("14 de Febrero - 20:45h", 2025)
        assert result == "2025-02-14 20:45"

    def test_different_month(self):
        result = parse_spanish_date("12 de Marzo - 00:00h", 2026)
        assert result == "2026-03-12 00:00"

    def test_no_h_suffix(self):
        """Some dates might not have the 'h' suffix."""
        result = parse_spanish_date("5 de Enero - 18:30", 2025)
        assert result == "2025-01-05 18:30"

    def test_empty_string(self):
        assert parse_spanish_date("", 2025) is None

    def test_garbage(self):
        assert parse_spanish_date("(sesión agotada)", 2025) is None

    def test_unknown_month(self):
        assert parse_spanish_date("3 de Foobar - 17:00h", 2025) is None


class TestSalaBerlangaScraper:
    """Tests for SalaBerlangaScraper parsing logic."""

    @pytest.fixture
    def scraper(self):
        return SalaBerlangaScraper()

    def test_cinema_info(self, scraper):
        info = scraper.cinema_info
        assert info.key == "sala-berlanga"
        assert info.name == "Sala Berlanga"
        assert "salaberlanga.com" in info.base_url

    def test_parse_listing_filters_cine_only(self, scraper, load_fixture):
        """Only 'Cine' category activities should be returned."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        titles = [f["title"] for f in films]
        # "Premio Ruido" is categorised as "Música" – must not appear
        assert "Premio Ruido" not in titles
        # Known cinema titles should appear
        assert any("Olivia" in t for t in titles)

    def test_parse_listing_returns_films(self, scraper, load_fixture):
        """Should return multiple films from the fixture."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        assert isinstance(films, list)
        assert len(films) > 5

    def test_film_has_expected_fields(self, scraper, load_fixture):
        """Each film dict should have all required fields."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)
        assert len(films) > 0

        film = films[0]
        assert "theater" in film
        assert "title" in film
        assert "theater_film_link" in film
        assert "dates" in film
        assert "director" in film
        assert "year" in film
        assert film["theater"] == "Sala Berlanga"

    def test_dates_have_expected_structure(self, scraper, load_fixture):
        """Each date entry should have timestamp, location, urls."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)
        assert len(films) > 0

        for film in films:
            for d in film["dates"]:
                assert "timestamp" in d
                assert "location" in d
                assert d["location"] == "Sala Berlanga"

    def test_date_range_filtering(self, scraper, load_fixture):
        """Dates outside the requested range should be excluded."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        # Narrow range: only Feb 10-11
        start = datetime(2025, 2, 10)
        end = datetime(2025, 2, 11)

        films = scraper.parse_listing(html, start, end)

        for film in films:
            for d in film["dates"]:
                dt = datetime.strptime(d["timestamp"], "%Y-%m-%d %H:%M")
                assert dt.date() >= start.date()
                assert dt.date() <= end.date()

    def test_director_and_year_parsed(self, scraper, load_fixture):
        """Director and year should be extracted from the info line."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        # Find "Olivia y el terremoto invisible"
        olivia = [f for f in films if "Olivia" in f["title"]]
        assert len(olivia) == 1
        assert olivia[0]["director"] == "Irene Iborra"
        assert olivia[0]["year"] == "2025"

    def test_sold_out_sessions_included(self, scraper, load_fixture):
        """Sessions with 'sesión agotada' should still be scraped."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)
        titles = [f["title"] for f in films]

        # "Los domingos" has sold-out sessions
        assert "Los domingos" in titles

    def test_ticket_url_present(self, scraper, load_fixture):
        """Films with available tickets should have a ticket URL."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        # At least one film should have a ticket URL
        films_with_tickets = [
            f for f in films
            if any(d.get("url_tickets") for d in f["dates"])
        ]
        assert len(films_with_tickets) > 0

    def test_activity_link_is_absolute(self, scraper, load_fixture):
        """Activity page URLs should be absolute."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        for film in films:
            assert film["theater_film_link"].startswith("http")

    def test_multiple_dates_per_film(self, scraper, load_fixture):
        """Films with multiple screening dates should have them all."""
        html = load_fixture("sala-berlanga", "day-listing.html")
        start = datetime(2025, 2, 7)
        end = datetime(2025, 2, 28)

        films = scraper.parse_listing(html, start, end)

        # "Romería" has multiple dates in the fixture
        romeria = [f for f in films if "Romería" in f["title"]]
        assert len(romeria) == 1
        assert len(romeria[0]["dates"]) >= 2


class TestParseSessionsPage:
    """Tests for parsing entradas.com session pages."""

    @pytest.fixture
    def scraper(self):
        return SalaBerlangaScraper()

    @pytest.fixture
    def sessions_html(self, load_fixture):
        return load_fixture("sala-berlanga", "film-page.html")

    def test_returns_dict(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert isinstance(result, dict)

    def test_finds_two_sessions(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert len(result) == 2

    def test_first_session_key(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert "10/02 21:00" in result

    def test_second_session_key(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert "19/02 16:45" in result

    def test_first_session_url_contains_evento(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert "/evento/3423" in result["10/02 21:00"]

    def test_second_session_url_contains_evento(self, scraper, sessions_html):
        result = scraper.parse_sessions_page(sessions_html)
        assert "/evento/3458" in result["19/02 16:45"]

    def test_urls_have_no_tracking_params(self, scraper, sessions_html):
        """Tracking params like _gl should be stripped."""
        result = scraper.parse_sessions_page(sessions_html)
        for url in result.values():
            assert "_gl=" not in url
            assert "?" not in url

    def test_empty_page(self, scraper):
        result = scraper.parse_sessions_page("<html><body></body></html>")
        assert result == {}
