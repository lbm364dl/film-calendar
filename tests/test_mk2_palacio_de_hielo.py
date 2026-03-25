"""Tests for the mk2 Palacio de Hielo scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.mk2_palacio_de_hielo import Mk2PalacioDeHieloScraper

FIXTURES = Path("tests/fixtures/mk2-palacio-de-hielo")


class TestParseCartelera(unittest.TestCase):
    """Test parsing of the cartelera page."""

    def setUp(self):
        fixture = FIXTURES / "cartelera.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        self.html = fixture.read_text(encoding="utf-8")
        self.scraper = Mk2PalacioDeHieloScraper()

    def test_finds_films(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertIn("director", f)
            self.assertEqual(f["theater"], "mk2 Palacio de Hielo")

    def test_date_format(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}",
                )

    def test_directors_extracted(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        directors = [f["director"] for f in films if f["director"]]
        self.assertTrue(len(directors) > 0, "Should extract some directors")

    def test_vose_sessions_tagged(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        vose_sessions = []
        for f in films:
            for d in f["dates"]:
                if d.get("version") == "VOSE":
                    vose_sessions.append(d)
        self.assertTrue(len(vose_sessions) > 0, "Should have some VOSE sessions")

    def test_ticket_urls_present(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(d["url_tickets"], f"Missing ticket URL for {f['title']}")

    def test_dates_sorted(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            timestamps = [d["timestamp"] for d in f["dates"]]
            self.assertEqual(timestamps, sorted(timestamps))

    def test_film_links_are_absolute(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            if f["theater_film_link"]:
                self.assertTrue(
                    f["theater_film_link"].startswith("http"),
                    f"Film link not absolute: {f['theater_film_link']}",
                )

    def test_date_range_filtering(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 3, 25),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-03-25"),
                    f"Date outside range: {d['timestamp']}",
                )

    def test_location_set(self):
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 25), datetime(2026, 4, 30),
        )
        for f in films:
            for d in f["dates"]:
                self.assertEqual(d["location"], "mk2 Palacio de Hielo")


if __name__ == "__main__":
    unittest.main()
