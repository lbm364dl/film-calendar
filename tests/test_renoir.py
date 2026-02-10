"""Tests for Renoir scraper."""

import pytest
from datetime import datetime
from fetch_films.renoir import RenoirScraper

class TestRenoirScraper:
    """Tests for RenoirScraper parsing logic."""

    @pytest.fixture
    def scraper(self):
        return RenoirScraper()

    def test_cinema_info(self, scraper):
        """Test cinema info is correctly configured."""
        info = scraper.cinema_info
        assert info.key == "renoir"
        assert info.name == "Cines Renoir"
        assert info.update_period == "weekly"

    def test_parse_films_list_for_location(self, scraper, load_fixture):
        """Test parsing film URLs from day listing page.
        
        Requires: tests/fixtures/renoir/day_listing.html
        """
        html = load_fixture("renoir", "day_listing.html")
        date = datetime(2026, 2, 1)  # The date in the fixture
        
        films = scraper.parse_films_list_for_location(html, date, "Princesa")
        
        assert isinstance(films, list)
        assert len(films) > 0
        
        # Verify a specific film from the fixture
        # "28 AÑOS DESPUÉS EL TEMPLO DE LOS HUESOS" -> "28 Años Después El Templo De Los Huesos"
        film = next((f for f in films if "28 Años" in f["title"]), None)
        assert film is not None
        assert film["title"] == "28 Años Después El Templo De Los Huesos"
        assert film["theater"] == "Cines Renoir"
        assert film["director"] == "Nia Dacosta"
        assert film["year"] is None  # Year is only populated from detail pages
        assert len(film["dates"]) >= 2
        # Dates are now dicts with url_tickets, url_info, timestamp, location
        timestamps = [d["timestamp"] for d in film["dates"]]
        assert "2026-02-01 20:00" in timestamps
        assert "2026-02-01 22:30" in timestamps
        # Verify url_tickets points to pillalas and url_info points to renoir movie page
        for d in film["dates"]:
            assert "url_tickets" in d
            assert "url_info" in d
            assert "pillalas.com" in d["url_tickets"]
            assert "cinesrenoir.com/pelicula/" in d["url_info"]

        # Verify another film
        # "BUGONIA" -> "Bugonia"
        film_bugonia = next((f for f in films if "Bugonia" in f["title"]), None)
        assert film_bugonia is not None
        assert film_bugonia["director"] == "Yorgos Lanthimos"
        bugonia_timestamps = [d["timestamp"] for d in film_bugonia["dates"]]
        assert "2026-02-01 20:10" in bugonia_timestamps
