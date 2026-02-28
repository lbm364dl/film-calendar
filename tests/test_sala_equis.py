"""Tests for the Sala Equis scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.sala_equis import SalaEquisScraper


FIXTURES = Path("tests/fixtures/sala-equis")


class TestParseTaquillaPage(unittest.TestCase):
    """Test parsing of the /taquilla/ listing page."""

    def setUp(self):
        fixture = FIXTURES / "taquilla.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            self.html = f.read()
        self.scraper = SalaEquisScraper()

    def test_extracts_film_urls(self):
        urls = self.scraper.parse_taquilla_page(self.html)
        self.assertTrue(len(urls) > 0, "Should find film URLs")

    def test_urls_are_ciclos_pages(self):
        urls = self.scraper.parse_taquilla_page(self.html)
        for url in urls:
            self.assertIn("/ciclos/", url)

    def test_no_bare_ciclos_index(self):
        urls = self.scraper.parse_taquilla_page(self.html)
        for url in urls:
            self.assertNotEqual(
                url.rstrip("/"), "https://salaequis.es/ciclos",
                "Should not include the bare /ciclos/ index",
            )

    def test_no_duplicates(self):
        urls = self.scraper.parse_taquilla_page(self.html)
        self.assertEqual(len(urls), len(set(urls)), "Should not have duplicates")


class TestParseFilmDetail(unittest.TestCase):
    """Test parsing of a film detail page."""

    def setUp(self):
        fixture = FIXTURES / "film-page.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            self.html = f.read()
        self.scraper = SalaEquisScraper()

    def test_extracts_title(self):
        result = self.scraper.parse_film_detail(
            self.html, "https://salaequis.es/ciclos/la-cronologia-del-agua/"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["title"], "La Cronología Del Agua")

    def test_extracts_director(self):
        result = self.scraper.parse_film_detail(
            self.html, "https://salaequis.es/ciclos/la-cronologia-del-agua/"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["director"], "Kristen Stewart")

    def test_extracts_year(self):
        result = self.scraper.parse_film_detail(
            self.html, "https://salaequis.es/ciclos/la-cronologia-del-agua/"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["year"], "2025")

    def test_extracts_kinetike_url(self):
        result = self.scraper.parse_film_detail(
            self.html, "https://salaequis.es/ciclos/la-cronologia-del-agua/"
        )
        self.assertIsNotNone(result)
        self.assertIn("kinetike.com", result["_kinetike_url"])
        self.assertIn("idPelicula=2845", result["_kinetike_url"])

    def test_theater_name(self):
        result = self.scraper.parse_film_detail(
            self.html, "https://salaequis.es/ciclos/la-cronologia-del-agua/"
        )
        self.assertEqual(result["theater"], "Sala Equis")


class TestParseShortDescription(unittest.TestCase):
    """Test extraction of director/year from shortDescription paragraphs."""

    def test_standard_format(self):
        paragraphs = [
            "The cronology of water",
            "Kristen Stewart / Reino Unido / 2025",
            "VOSE – 128 min",
            "No recomendada para menores de 18 años",
        ]
        director, year = SalaEquisScraper._parse_short_description(paragraphs)
        self.assertEqual(director, "Kristen Stewart")
        self.assertEqual(year, "2025")

    def test_multiple_directors(self):
        paragraphs = [
            "Elena Molina, Isaki Lacuesta / España / 2025",
            "VO – 98 min",
        ]
        director, year = SalaEquisScraper._parse_short_description(paragraphs)
        self.assertEqual(director, "Elena Molina, Isaki Lacuesta")
        self.assertEqual(year, "2025")

    def test_no_matching_line(self):
        paragraphs = ["Some random text", "Another line"]
        director, year = SalaEquisScraper._parse_short_description(paragraphs)
        self.assertIsNone(director)
        self.assertIsNone(year)

    def test_empty_paragraphs(self):
        director, year = SalaEquisScraper._parse_short_description([])
        self.assertIsNone(director)
        self.assertIsNone(year)


class TestParseKinetikeDates(unittest.TestCase):
    """Test static parsing of kinetike sesionesFuturas HTML for dates."""

    def setUp(self):
        fixture = FIXTURES / "kinetike-sessions.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            self.html = f.read()
        self.scraper = SalaEquisScraper()

    def test_extracts_dates(self):
        dates = self.scraper.parse_kinetike_dates(self.html)
        self.assertTrue(len(dates) > 0, "Should find session dates")

    def test_date_format(self):
        dates = self.scraper.parse_kinetike_dates(self.html)
        import re
        for d in dates:
            self.assertRegex(d, r"\d{2}/\d{2}/\d{4}")

    def test_dates_are_unique(self):
        dates = self.scraper.parse_kinetike_dates(self.html)
        self.assertEqual(len(dates), len(set(dates)), "Dates should be unique")


if __name__ == "__main__":
    unittest.main()
