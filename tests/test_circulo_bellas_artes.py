"""Tests for Circulo de Bellas Artes scraper."""

import pytest
from datetime import datetime
from unittest.mock import patch

from fetch_films.circulo_bellas_artes import (
    CirculoBellasArtesScraper,
    _parse_day_string,
)


class TestCirculoBellasArtesScraper:
    """Tests for CirculoBellasArtesScraper parsing logic."""

    @pytest.fixture
    def scraper(self):
        return CirculoBellasArtesScraper()

    def test_cinema_info(self, scraper):
        """Test cinema info is correctly configured."""
        info = scraper.cinema_info
        assert info.key == "circulo-bellas-artes"
        assert info.name == "Círculo de Bellas Artes"
        assert "circulobellasartes.com" in info.base_url
        assert info.update_period == "weekly"

    def test_parse_day_string(self):
        """Test Spanish day string parsing."""
        dt = _parse_day_string("Mié, 11 Feb", 2026)
        assert dt == datetime(2026, 2, 11)

        dt = _parse_day_string("Dom, 15 Feb", 2026)
        assert dt == datetime(2026, 2, 15)

        dt = _parse_day_string("Sáb, 21 Feb", 2026)
        assert dt == datetime(2026, 2, 21)

    def test_parse_day_string_invalid(self):
        """Test that invalid day strings raise ValueError."""
        with pytest.raises(ValueError):
            _parse_day_string("Invalid", 2026)

    @pytest.fixture
    def listing_html(self, load_fixture):
        return load_fixture("circulo-bellas-artes", "day-listing.html")

    @pytest.fixture
    def film_page_html(self, load_fixture):
        return load_fixture("circulo-bellas-artes", "film-page.html")

    def test_parse_all_tabs(self, scraper, listing_html):
        """Test parsing all weekly tabs from the listing page."""
        with patch(
            "fetch_films.circulo_bellas_artes._resolve_year_from_tab_label",
            return_value=2026,
        ):
            sessions = scraper._parse_all_tabs(listing_html)

        assert len(sessions) > 0, "Should find sessions"

        # Check that we have sessions from both weeks
        timestamps = [s["timestamp"] for s in sessions]
        # Week 1 starts Feb 11, Week 2 starts Feb 18
        week1_sessions = [t for t in timestamps if "2026-02-11" in t]
        week2_sessions = [t for t in timestamps if "2026-02-18" in t]
        assert len(week1_sessions) > 0, "Should have week 1 sessions"
        assert len(week2_sessions) > 0, "Should have week 2 sessions"

        # Check specific session: "La cronología del agua" on Wed 11 Feb at 17:00
        cronologia = [
            s for s in sessions
            if "cronología del agua" in s["title"]
        ]
        assert len(cronologia) == 1
        assert cronologia[0]["timestamp"] == "2026-02-11 17:00"
        assert cronologia[0]["director"] == "Kristen Stewart"
        assert "la-cronologia-del-agua" in cronologia[0]["film_url"]

        # Check "No hay otra opción" appears multiple times across both weeks
        no_hay = [s for s in sessions if "No hay otra opción" in s["title"]]
        assert len(no_hay) >= 2, "Should appear in multiple sessions"

    def test_parse_all_tabs_session_count(self, scraper, listing_html):
        """Test that each day has the expected number of sessions."""
        with patch(
            "fetch_films.circulo_bellas_artes._resolve_year_from_tab_label",
            return_value=2026,
        ):
            sessions = scraper._parse_all_tabs(listing_html)

        # Week 1, Wed Feb 11: 3 sessions (17:00, 19:30, 22:00)
        feb11 = [s for s in sessions if s["timestamp"].startswith("2026-02-11")]
        assert len(feb11) == 3

        # Week 1, Fri Feb 13: 3 sessions
        feb13 = [s for s in sessions if s["timestamp"].startswith("2026-02-13")]
        assert len(feb13) == 3

    def test_parse_all_tabs_directors(self, scraper, listing_html):
        """Test that directors are extracted from the listing."""
        with patch(
            "fetch_films.circulo_bellas_artes._resolve_year_from_tab_label",
            return_value=2026,
        ):
            sessions = scraper._parse_all_tabs(listing_html)

        # Check specific directors
        marty = [s for s in sessions if "Marty Supreme" in s["title"]]
        assert len(marty) > 0
        assert marty[0]["director"] == "Josh Safdie"

        innisfree = [s for s in sessions if "Innisfree" in s["title"]]
        assert len(innisfree) > 0
        assert innisfree[0]["director"] == "José Luis Guerin"

    def test_parse_film_detail(self, scraper, film_page_html):
        """Test parsing a film detail page."""
        detail = scraper._parse_film_detail(film_page_html)

        assert detail["url_tickets"] == (
            "https://www.reservaentradas.com/sesiones/madrid/"
            "circulobellasartes/no-hay-otra-opcion/2661/"
        )
        assert detail["director"] == "Park Chan-wook"
        assert detail["year"] == "2025"

    def test_parse_film_detail_no_button(self, scraper):
        """Test parsing a film page without a ticket button."""
        html = "<html><body><p>No button here</p></body></html>"
        detail = scraper._parse_film_detail(html)
        assert detail["url_tickets"] == ""
        assert detail["director"] is None
        assert detail["year"] is None

    def test_unique_films_across_tabs(self, scraper, listing_html):
        """Test that the same film appearing on multiple days is collected."""
        with patch(
            "fetch_films.circulo_bellas_artes._resolve_year_from_tab_label",
            return_value=2026,
        ):
            sessions = scraper._parse_all_tabs(listing_html)

        # "La tarta del presidente" should appear many times
        tarta = [s for s in sessions if "tarta del presidente" in s["title"]]
        assert len(tarta) >= 4, f"Expected >=4 sessions, got {len(tarta)}"

        # All should link to the same film URL
        urls = set(s["film_url"] for s in tarta)
        assert len(urls) == 1, "All sessions should have same film URL"


    def test_parse_and_fetch_details_location(self, scraper, listing_html):
        """Test that films contain the correct location name."""
        with patch(
            "fetch_films.circulo_bellas_artes._resolve_year_from_tab_label",
            return_value=2026,
        ):
            # Mock fetch_html to avoid network calls during detail fetching
            with patch.object(scraper, "fetch_html", return_value="<html></html>"):
                start_date = datetime(2026, 2, 1)
                end_date = datetime(2026, 3, 1)
                films = scraper.parse_and_fetch_details(
                    listing_html, start_date, end_date
                )

        assert len(films) > 0
        for film in films:
            assert film["theater"] == "Círculo de Bellas Artes"
            for d in film["dates"]:
                assert d["location"] == "Cine Estudio"
