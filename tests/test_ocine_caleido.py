"""Tests for the OCine Urban Caleido scraper."""

import json
import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.ocine_caleido import OcineCaleidoScraper, clean_title

FIXTURES = Path("tests/fixtures/ocine-caleido")


class TestCleanTitle(unittest.TestCase):
    """Test the title-cleaning utility."""

    def test_strip_vose_suffix(self):
        self.assertEqual(clean_title("Cumbres Borrascosas (VOSE)"), "Cumbres Borrascosas")

    def test_no_change_plain_title(self):
        self.assertEqual(clean_title("Amarga Navidad"), "Amarga Navidad")


class TestOcineCaleidoParser(unittest.TestCase):
    """Test parsing of the JSON cartelera."""

    def setUp(self):
        fixture = FIXTURES / "cartellera.json"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture) as f:
            self.data = json.load(f)
        self.scraper = OcineCaleidoScraper()

    def test_finds_films(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertEqual(f["theater"], "OCine Urban Caleido")

    def test_date_format(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}",
                )

    def test_vose_films_tagged(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        vose_films = [f for f in films if any(d.get("version") == "VOSE" for d in f["dates"])]
        self.assertTrue(len(vose_films) > 0, "Should have some VOSE films")

    def test_vose_stripped_from_title(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        for f in films:
            self.assertNotIn("(VOSE)", f["title"])

    def test_dates_sorted(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        for f in films:
            timestamps = [d["timestamp"] for d in f["dates"]]
            self.assertEqual(timestamps, sorted(timestamps))

    def test_date_range_filtering(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 3, 25),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-03-25"),
                    f"Date outside range: {d['timestamp']}",
                )

    def test_location_set(self):
        films = self.scraper._parse_cartelera(
            self.data, datetime(2026, 3, 25), datetime(2026, 5, 30),
        )
        for f in films:
            for d in f["dates"]:
                self.assertEqual(d["location"], "OCine Urban Caleido")


if __name__ == "__main__":
    unittest.main()
