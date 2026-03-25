"""Tests for the Artistic Metropol scraper."""

import json
import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.artistic_metropol import ArtisticMetropolScraper, parse_event_title

FIXTURES = Path("tests/fixtures/artistic-metropol")


class TestParseEventTitle(unittest.TestCase):
    """Test the title-parsing utility."""

    def test_vose_with_year(self):
        result = parse_event_title("SALA 1: FREAKS (1932) V.O.S.E.")
        self.assertEqual(result["title"], "FREAKS")
        self.assertEqual(result["year"], "1932")
        self.assertIsNone(result["version"])

    def test_dubbed_with_year(self):
        result = parse_event_title(
            "SALA 1: EL AGENTE SECRETO (2025) Doblada al español"
        )
        self.assertEqual(result["title"], "EL AGENTE SECRETO")
        self.assertEqual(result["year"], "2025")
        self.assertEqual(result["version"], "dubbed")

    def test_no_version(self):
        result = parse_event_title("SALA 2: VALOR SENTIMENTAL (2025)")
        self.assertEqual(result["title"], "VALOR SENTIMENTAL")
        self.assertEqual(result["year"], "2025")
        self.assertIsNone(result["version"])

    def test_no_year(self):
        result = parse_event_title("SALA 1: SOME FILM V.O.S.E.")
        self.assertEqual(result["title"], "SOME FILM")
        self.assertIsNone(result["year"])
        self.assertIsNone(result["version"])

    def test_visiones_prefix(self):
        result = parse_event_title(
            "SALA 1: VISIONES: BAD DREAMS (1988) V.O.S.E."
        )
        self.assertEqual(result["title"], "VISIONES: BAD DREAMS")
        self.assertEqual(result["year"], "1988")

    def test_no_sala_prefix(self):
        result = parse_event_title("SOME FILM (2024) V.O.S.E.")
        self.assertEqual(result["title"], "SOME FILM")
        self.assertEqual(result["year"], "2024")


class TestArtisticMetropolParser(unittest.TestCase):
    """Test parsing of the API response."""

    def setUp(self):
        fixture = FIXTURES / "api_events.json"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture) as f:
            self.api_data = json.load(f)
        self.scraper = ArtisticMetropolScraper()

    def test_groups_events_into_films(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertEqual(f["theater"], "Artistic Metropol")

    def test_date_format(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}",
                )

    def test_private_screenings_filtered(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        for f in films:
            self.assertNotIn("Pase PRIVADO", f["title"])

    def test_dates_sorted(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        for f in films:
            timestamps = [d["timestamp"] for d in f["dates"]]
            self.assertEqual(timestamps, sorted(timestamps))

    def test_location_set(self):
        events = self.api_data.get("events", [])
        films = self.scraper._group_events_into_films(events)
        for f in films:
            for d in f["dates"]:
                self.assertEqual(d["location"], "Artistic Metropol")


if __name__ == "__main__":
    unittest.main()
