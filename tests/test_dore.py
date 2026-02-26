"""Tests for Cine Doré scraper."""

from datetime import datetime

import pytest

from fetch_films.dore import DoreScraper


@pytest.fixture
def scraper():
    return DoreScraper()


def test_cinema_info(scraper):
    """Test that cinema info is correctly set."""
    info = scraper.cinema_info
    assert info.key == "dore"
    assert info.name == "Cine Doré"
    assert "filmoteca" in info.base_url.lower() or "sacatuentrada" in info.base_url.lower()


def test_get_total_pages(scraper, load_fixture):
    """Test pagination detection from listing page."""
    html = load_fixture("dore", "day_listing.html")
    
    total_pages = scraper._get_total_pages(html)
    
    # Based on the fixture, there should be 3 pages
    assert total_pages == 3


def test_parse_films_list(scraper, load_fixture):
    """Test parsing of the listing page."""
    html = load_fixture("dore", "day_listing.html")
    
    screenings = scraper.parse_films_list(html, datetime(2026, 1, 31))
    
    # Should find multiple screenings
    assert len(screenings) >= 10
    
    # Check first screening (El Estado de la Unión)
    first = screenings[0]
    
    # Title should be clean (no year or original title in parentheses)
    assert first["title"] == "El Estado de la Unión"
    assert "(1948)" not in first["title"]
    assert "State of the Union" not in first["title"]
    
    # Year should be extracted separately
    assert first["year"] == "1948"
    assert first["director"] == "Frank Capra"
    assert first["screening_date"].isoformat() == "2026-01-31"
    
    # Check that we have info links
    assert first["theater_film_link"] is not None
    assert "productos/descripcion" in first["theater_film_link"]
    
    # Check column order matches cineteca: theater, title, theater_film_link, dates, director, year
    # Note: screening_date is internal only (used for filtering), removed before final output
    expected_order = ["theater", "title", "theater_film_link", "dates", "director", "year", "screening_date"]
    assert list(first.keys()) == expected_order


def test_parse_films_list_extracts_time(scraper, load_fixture):
    """Test that screening times are extracted from descriptions."""
    html = load_fixture("dore", "day_listing.html")
    
    screenings = scraper.parse_films_list(html, datetime(2026, 1, 31))
    
    # Check that dates include times in structured format
    first = screenings[0]
    assert len(first["dates"]) > 0
    date_entry = first["dates"][0]
    assert isinstance(date_entry, dict)
    assert "19:00" in date_entry["timestamp"]  # Screenings are typically at 19:00
    assert date_entry["location"] == "Cine Doré"
    assert "url_tickets" in date_entry
    assert "url_info" in date_entry
    assert date_entry["url_info"] != ""


def test_date_filtering(scraper, load_fixture):
    """Test that screenings can be filtered by date."""
    html = load_fixture("dore", "day_listing.html")
    
    all_screenings = scraper.parse_films_list(html, datetime(2026, 1, 31))
    
    # Filter to just Feb 1
    start = datetime(2026, 2, 1)
    end = datetime(2026, 2, 1)
    
    filtered = [
        s for s in all_screenings
        if s.get("screening_date") and start.date() <= s["screening_date"] <= end.date()
    ]
    
    # Should find "Hay un camino a la derecha" on Feb 1
    assert len(filtered) >= 1
    assert any("camino" in s["title"].lower() for s in filtered)


def test_merge_duplicate_films_preserves_session_urls(scraper):
    """Same film with multiple Doré product URLs should merge into one row."""
    screenings = [
        {
            "theater": "Cine Doré",
            "title": "La jauría humana",
            "theater_film_link": "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana-ii",
            "dates": [{
                "timestamp": "2026-03-20 17:30",
                "location": "Cine Doré",
                "url_tickets": "",
                "url_info": "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana-ii",
            }],
            "director": "Arthur Penn",
            "year": "1966",
        },
        {
            "theater": "Cine Doré",
            "title": "La jauría humana",
            "theater_film_link": "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana",
            "dates": [{
                "timestamp": "2026-03-05 20:15",
                "location": "Cine Doré",
                "url_tickets": "",
                "url_info": "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana",
            }],
            "director": "Arthur Penn",
            "year": "1966",
        },
    ]

    merged = scraper._merge_duplicate_films(screenings)

    assert len(merged) == 1
    film = merged[0]
    assert film["title"] == "La jauría humana"
    assert len(film["dates"]) == 2
    assert [d["timestamp"] for d in film["dates"]] == [
        "2026-03-05 20:15",
        "2026-03-20 17:30",
    ]
    assert {d["url_info"] for d in film["dates"]} == {
        "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana",
        "https://entradasfilmoteca.sacatuentrada.es/es/productos/descripcion/la-jauria-humana-ii",
    }
