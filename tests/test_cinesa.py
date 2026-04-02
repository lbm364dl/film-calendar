"""Tests for the Cinesa scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.cinesa import (
    CinesaScraper,
    _decode_ticket_url,
    _parse_date,
    _resolve_year,
    LOCATIONS,
)


FIXTURES = Path("tests/fixtures/cinesa")


class TestDecodeTicketUrl(unittest.TestCase):
    """Test base64 ticket URL decoding."""

    def test_decode_valid_url(self):
        data_href = "/venda/17237/169/aHR0cHM6Ly93ZWIuY2luZXNhLmVzL2NvbXByYS9idXRhY2FzLz9zaG93dGltZUlkPTAxOC0zNzQ1NA"
        result = _decode_ticket_url(data_href)
        self.assertEqual(
            result, "https://web.cinesa.es/compra/butacas/?showtimeId=018-37454"
        )

    def test_decode_empty_string(self):
        self.assertEqual(_decode_ticket_url(""), "")

    def test_decode_short_path(self):
        self.assertEqual(_decode_ticket_url("/foo/bar"), "")


class TestParseDate(unittest.TestCase):
    """Test date string parsing."""

    def test_hoy_format(self):
        self.assertEqual(_parse_date("Hoy25/03"), (25, 3))

    def test_day_name_format(self):
        self.assertEqual(_parse_date("Viernes27/03"), (27, 3))

    def test_manana_format(self):
        self.assertEqual(_parse_date("Mañana26/03"), (26, 3))

    def test_no_date(self):
        self.assertIsNone(_parse_date("No date here"))


class TestResolveYear(unittest.TestCase):
    """Test year resolution from DD/MM."""

    def test_same_month(self):
        ref = datetime(2026, 3, 25)
        self.assertEqual(_resolve_year(25, 3, ref), 2026)

    def test_later_month(self):
        ref = datetime(2026, 3, 25)
        self.assertEqual(_resolve_year(1, 4, ref), 2026)

    def test_earlier_month_means_next_year(self):
        ref = datetime(2026, 12, 28)
        self.assertEqual(_resolve_year(2, 1, ref), 2027)


class TestCinesaScraperInfo(unittest.TestCase):
    """Test scraper metadata."""

    def setUp(self):
        self.scraper = CinesaScraper()

    def test_cinema_info(self):
        info = self.scraper.cinema_info
        self.assertEqual(info.key, "cinesa")
        self.assertEqual(info.name, "Cinesa")
        self.assertEqual(info.update_period, "weekly")

    def test_locations_count(self):
        self.assertEqual(len(LOCATIONS), 14)


class TestParseCartelera(unittest.TestCase):
    """Test parsing of a publicine.net cartelera page."""

    def setUp(self):
        fixture = FIXTURES / "cartelera-proyecciones.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "rb") as f:
            self.html = f.read().decode("iso-8859-1")
        self.scraper = CinesaScraper()
        self.start = datetime(2026, 3, 25)
        self.end = datetime(2026, 3, 31)

    def test_finds_films(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        film = films[0]
        self.assertIn("theater", film)
        self.assertIn("title", film)
        self.assertIn("theater_film_link", film)
        self.assertIn("dates", film)
        self.assertIn("director", film)
        self.assertEqual(film["theater"], "Cinesa")

    def test_title_is_title_case(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        for film in films:
            self.assertFalse(
                film["title"].isupper(),
                f"Title should not be all uppercase: {film['title']}",
            )

    def test_director_extracted(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        directors = [f["director"] for f in films if f["director"]]
        self.assertTrue(len(directors) > 0, "Should find at least one director")

    def test_dates_have_correct_format(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        for film in films:
            for d in film["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}"
                )
                self.assertEqual(d["location"], "Cinesa Proyecciones")
                self.assertIn("url_tickets", d)
                self.assertNotIn("url_info", d)

    def test_ticket_urls_decoded(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        for film in films:
            for d in film["dates"]:
                if d["url_tickets"]:
                    self.assertIn(
                        "cinesa.es",
                        d["url_tickets"],
                        f"Ticket URL should contain cinesa.es: {d['url_tickets']}",
                    )

    def test_vose_sessions_not_tagged(self):
        """VOSE sessions should have no version tag (original is the default)."""
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        for film in films:
            for d in film["dates"]:
                if d.get("version"):
                    self.assertNotEqual(
                        d["version"], "VOSE",
                        "VOSE sessions should not have a version tag",
                    )

    def test_digital_sessions_tagged_as_dubbed(self):
        """DIGITAL sessions should be tagged as dubbed."""
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        dubbed_sessions = []
        for film in films:
            for d in film["dates"]:
                if d.get("version") == "dubbed":
                    dubbed_sessions.append(d)
        self.assertTrue(
            len(dubbed_sessions) > 0, "Should find dubbed (DIGITAL) sessions"
        )

    def test_date_range_filtering(self):
        # Only include March 25
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones",
            datetime(2026, 3, 25), datetime(2026, 3, 25),
        )
        for film in films:
            for d in film["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-03-25"),
                    f"Date outside range: {d['timestamp']}",
                )

    def test_time_format_uses_colon(self):
        films = self.scraper.parse_cartelera(
            self.html, "Cinesa Proyecciones", self.start, self.end
        )
        for film in films:
            for d in film["dates"]:
                time_part = d["timestamp"].split(" ")[1]
                self.assertIn(":", time_part, "Time should use colon separator")
                self.assertNotIn(".", time_part, "Time should not use dot separator")


if __name__ == "__main__":
    unittest.main()
