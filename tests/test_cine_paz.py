"""Tests for the Cine Paz Madrid scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.cine_paz import (
    CinePazScraper,
    clean_title,
    extract_film_id,
    is_vose_entry,
)

FIXTURES = Path("tests/fixtures/cine-paz")


class TestCleanTitle(unittest.TestCase):
    """Test the title-cleaning utility."""

    def test_strip_vose_suffix(self):
        self.assertEqual(clean_title("Hamnet (VOSE)"), "Hamnet")

    def test_strip_vose_suffix_lowercase(self):
        self.assertEqual(
            clean_title("Una batalla tras otra (vose)"), "Una batalla tras otra"
        )

    def test_strip_vose_dash_suffix(self):
        self.assertEqual(clean_title("F1 - VOSE"), "F1")

    def test_strip_aeterna_prefix(self):
        self.assertEqual(
            clean_title("AETERNA: The descent (VOSE)"),
            "The descent",
        )

    def test_no_change_plain_title(self):
        self.assertEqual(clean_title("Inmaculada"), "Inmaculada")

    def test_no_change_parenthetical(self):
        self.assertEqual(clean_title("Orwell: 2+2=5"), "Orwell: 2+2=5")


class TestExtractFilmId(unittest.TestCase):
    """Test URL-based film ID extraction."""

    def test_regular_url(self):
        self.assertEqual(
            extract_film_id(
                "https://www.cinepazmadrid.es/es/detalles/84910_1_W_0/hamnet"
            ),
            "84910",
        )

    def test_vose_url(self):
        self.assertEqual(
            extract_film_id(
                "https://www.cinepazmadrid.es/es/detalles/84910_1_Z_1/hamnet-vose"
            ),
            "84910",
        )

    def test_no_match(self):
        self.assertIsNone(extract_film_id("https://www.cinepazmadrid.es/es/cartelera"))


class TestParseVoseFilmIds(unittest.TestCase):
    """Test extraction of VOSE film IDs from the VOSE page."""

    def setUp(self):
        fixture = FIXTURES / "vose.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        self.html = fixture.read_text(encoding="utf-8")
        self.scraper = CinePazScraper()

    def test_extracts_ids(self):
        ids = self.scraper.parse_vose_film_ids(self.html)
        self.assertTrue(len(ids) > 0, "Should find VOSE film IDs")

    def test_known_vose_films(self):
        ids = self.scraper.parse_vose_film_ids(self.html)
        # Hamnet has VOSE screenings (ID 84910)
        self.assertIn("84910", ids)
        # Cumbres borrascosas has VOSE (ID 88284)
        self.assertIn("88284", ids)
        # El agente secreto (ID 89277)
        self.assertIn("89277", ids)

    def test_spanish_film_absent(self):
        ids = self.scraper.parse_vose_film_ids(self.html)
        # Los miserables. El origen (ID 90484) should NOT be in VOSE
        self.assertNotIn("90484", ids)
        # Orwell: 2+2=5 (ID 90646) should NOT be in VOSE
        self.assertNotIn("90646", ids)


class TestParseCartelera(unittest.TestCase):
    """Test parsing of the cartelera page with version logic."""

    def setUp(self):
        cartelera_fixture = FIXTURES / "cartelera.html"
        vose_fixture = FIXTURES / "vose.html"
        if not cartelera_fixture.exists() or not vose_fixture.exists():
            self.skipTest("Missing fixtures")
        self.cartelera_html = cartelera_fixture.read_text(encoding="utf-8")
        self.vose_html = vose_fixture.read_text(encoding="utf-8")
        self.scraper = CinePazScraper()
        self.vose_ids = self.scraper.parse_vose_film_ids(self.vose_html)

    def test_finds_films(self):
        """Should extract multiple films from the cartelera."""
        # Fixture was captured on 2026-02-28; use a range covering that week
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        """Each film dict should have the required keys."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertIn("director", f)
            self.assertEqual(f["theater"], "Cine Paz Madrid")

    def test_date_format(self):
        """Timestamps should follow 'YYYY-MM-DD HH:MM' format."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}"
                )

    def test_dubbed_version_for_non_vose_with_vose_counterpart(self):
        """Non-VOSE sessions of a film that has VOSE should be 'dubbed'."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        # Hamnet (84910) has both dubbed and VOSE
        hamnet = next((f for f in films if "84910" in f.get("theater_film_link", "")), None)
        if hamnet is None:
            # Try matching by title
            hamnet = next((f for f in films if f["title"] == "Hamnet"), None)
        self.assertIsNotNone(hamnet, "Should find Hamnet")

        dubbed_sessions = [d for d in hamnet["dates"] if d.get("version") == "dubbed"]
        vose_sessions = [d for d in hamnet["dates"] if "version" not in d]
        self.assertTrue(
            len(dubbed_sessions) > 0,
            "Hamnet should have dubbed sessions (from non-VOSE listing)",
        )
        self.assertTrue(
            len(vose_sessions) > 0,
            "Hamnet should have original-version sessions (from VOSE listing)",
        )

    def test_no_version_for_spanish_film(self):
        """Films not in VOSE page should have no version tag (assumed Spanish)."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        # Orwell: 2+2=5 or Los miserables. El origen (not in VOSE)
        orwell = next((f for f in films if "Orwell" in f["title"]), None)
        if orwell:
            for d in orwell["dates"]:
                self.assertNotIn(
                    "version", d,
                    "Spanish film sessions should have no version tag",
                )

    def test_no_version_for_vose_only_film(self):
        """Films with only VOSE sessions should have no version tag."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        # Marty Supreme only appears as VOSE in the cartelera
        marty = next((f for f in films if "Marty Supreme" in f["title"]), None)
        if marty:
            for d in marty["dates"]:
                self.assertNotIn(
                    "version", d,
                    "VOSE-only film should have no version tag",
                )

    def test_date_range_filtering(self):
        """Only sessions within the date range should be included."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 3, 1), datetime(2026, 3, 1),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-03-01"),
                    f"Date outside range: {d['timestamp']}",
                )

    def test_ticket_urls_present(self):
        """Each session should have a ticket URL."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["url_tickets"],
                    f"Missing ticket URL for {f['title']}",
                )

    def test_titles_cleaned(self):
        """Titles should not contain (VOSE) suffix."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        for f in films:
            self.assertNotIn("(VOSE)", f["title"])
            self.assertNotIn("(vose)", f["title"])

    def test_directors_extracted(self):
        """At least some films should have directors."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        directors = [f["director"] for f in films if f["director"]]
        self.assertTrue(len(directors) > 0, "Should extract some directors")
        # Check a known director
        hamnet = next((f for f in films if f["title"] == "Hamnet"), None)
        if hamnet:
            self.assertEqual(hamnet["director"], "Chloé Zhao")

    def test_dates_sorted(self):
        """Dates within each film should be sorted by timestamp."""
        films = self.scraper.parse_cartelera(
            self.cartelera_html, self.vose_ids,
            datetime(2026, 2, 28), datetime(2026, 3, 5),
        )
        for f in films:
            timestamps = [d["timestamp"] for d in f["dates"]]
            self.assertEqual(timestamps, sorted(timestamps),
                             f"Dates not sorted for {f['title']}")


if __name__ == "__main__":
    unittest.main()
