"""Tests for the Cines Verdi Madrid scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.verdi import VerdiScraper, clean_title

FIXTURES = Path("tests/fixtures/verdi")


class TestCleanTitle(unittest.TestCase):
    """Test the title-cleaning utility."""

    def test_strip_vose_suffix(self):
        self.assertEqual(clean_title("Hamnet (VOSE)"), "Hamnet")

    def test_strip_jueves_prefix(self):
        self.assertEqual(
            clean_title("Jueves de Imprescindibles: Los paraguas de cherburgo (VOSE)"),
            "Los paraguas de cherburgo",
        )

    def test_strip_miercoles_cultural_prefix(self):
        self.assertEqual(
            clean_title(
                "Miércoles Cultural: Vermeer: la mayor exposición de la historia (VOSE)"
            ),
            "Vermeer: la mayor exposición de la historia",
        )

    def test_strip_anime_day_prefix(self):
        self.assertEqual(
            clean_title("Anime Day: El tiempo contigo (VOSE)"),
            "El tiempo contigo",
        )

    def test_strip_sesion_teta_prefix(self):
        self.assertEqual(
            clean_title("Sesión TETA: Cumbres Borrascosas (VOSE)"),
            "Cumbres Borrascosas",
        )

    def test_strip_verdi_club_prefix(self):
        self.assertEqual(
            clean_title("Verdi Club: Hasta que me quede sin voz"),
            "Hasta que me quede sin voz",
        )

    def test_strip_opera_prefix(self):
        self.assertEqual(
            clean_title(
                "Mañanas de Ópera y Ballet: La Gioconda - Teatro San Carlo de Nápoles"
            ),
            "La Gioconda - Teatro San Carlo de Nápoles",
        )

    def test_no_change_plain_title(self):
        self.assertEqual(clean_title("Los Domingos"), "Los Domingos")

    def test_no_change_parenthetical(self):
        self.assertEqual(clean_title("Serie 7291 [cap. 1 y 2]"), "Serie 7291 [cap. 1 y 2]")


class TestParseCartelera(unittest.TestCase):
    """Test parsing of the cartelera page."""

    def setUp(self):
        fixture = FIXTURES / "cartelera.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        self.html = fixture.read_text(encoding="utf-8")
        self.scraper = VerdiScraper()

    def test_finds_films(self):
        """Should extract multiple films from the cartelera."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_count(self):
        """Should find the expected number of films with sessions."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 4, 30),
        )
        # We know there are 23 articles, but some lack sessions (e.g. Serie 7291 cap 1&2)
        self.assertTrue(len(films) >= 15, f"Expected >=15 films, got {len(films)}")

    def test_film_structure(self):
        """Each film dict should have the required keys."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertIn("director", f)
            self.assertEqual(f["theater"], "Cines Verdi Madrid")

    def test_date_format(self):
        """Timestamps should follow 'YYYY-MM-DD HH:MM' format."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}",
                    f"Bad timestamp format for {f['title']}: {d['timestamp']}",
                )

    def test_dubbed_version_for_mixed_film(self):
        """CASTELLANO sessions of a film that also has V.O. should be 'dubbed'."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        # "Los Domingos" has both CASTELLANO and V.O. SUB. CASTELLANO sessions
        domingos = next((f for f in films if f["title"] == "Los Domingos"), None)
        self.assertIsNotNone(domingos, "Should find 'Los Domingos'")

        dubbed = [d for d in domingos["dates"] if d.get("version") == "dubbed"]
        original = [d for d in domingos["dates"] if "version" not in d]
        self.assertTrue(len(dubbed) > 0, "Should have dubbed sessions")
        self.assertTrue(len(original) > 0, "Should have original sessions")

    def test_little_amelie_dubbed_and_original(self):
        """Little Amélie should have both dubbed and original sessions."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        amelie = next((f for f in films if "Amélie" in f["title"]), None)
        self.assertIsNotNone(amelie, "Should find 'Little Amélie'")

        dubbed = [d for d in amelie["dates"] if d.get("version") == "dubbed"]
        original = [d for d in amelie["dates"] if "version" not in d]
        self.assertTrue(len(dubbed) > 0, "Should have dubbed sessions")
        self.assertTrue(len(original) > 0, "Should have original sessions")

    def test_no_version_for_vose_only_film(self):
        """Films with only V.O. sessions should have no version tag."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        # "El agente secreto" only has V.O. SUB. CASTELLANO sessions
        agente = next((f for f in films if "agente secreto" in f["title"]), None)
        self.assertIsNotNone(agente, "Should find 'El agente secreto'")
        for d in agente["dates"]:
            self.assertNotIn(
                "version", d,
                "V.O.-only film should have no version tag",
            )

    def test_no_version_for_spanish_only_film(self):
        """Films with only CASTELLANO sessions should have no version tag."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 4, 30),
        )
        # "El rostro del perdón" only has CASTELLANO sessions
        rostro = next((f for f in films if "rostro del perdón" in f["title"]), None)
        self.assertIsNotNone(rostro, "Should find 'El rostro del perdón'")
        for d in rostro["dates"]:
            self.assertNotIn(
                "version", d,
                "Spanish-only film should have no version tag",
            )

    def test_date_range_filtering(self):
        """Only sessions within the date range should be included."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 3, 1), datetime(2026, 3, 1),
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
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["url_tickets"],
                    f"Missing ticket URL for {f['title']}",
                )

    def test_ticket_urls_are_admit_one(self):
        """Ticket URLs should point to the admit-one booking system."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            for d in f["dates"]:
                self.assertIn(
                    "verdimadrid.admit-one.eu", d["url_tickets"],
                    f"Unexpected ticket URL for {f['title']}: {d['url_tickets']}",
                )

    def test_titles_cleaned(self):
        """Titles should not contain (VOSE) suffix or known prefixes."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            self.assertNotIn("(VOSE)", f["title"])
            self.assertFalse(
                f["title"].startswith("Jueves de Imprescindibles:"),
                f"Title still has prefix: {f['title']}",
            )

    def test_directors_extracted(self):
        """At least some films should have directors."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        directors = [f["director"] for f in films if f["director"]]
        self.assertTrue(len(directors) > 0, "Should extract some directors")

    def test_known_directors(self):
        """Check specific known directors are parsed correctly."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        marty = next((f for f in films if "Marty Supreme" in f["title"]), None)
        if marty:
            self.assertEqual(marty["director"], "Josh Safdie")

        cumbres = next((f for f in films if f["title"] == "Cumbres borrascosas"), None)
        if cumbres:
            self.assertEqual(cumbres["director"], "Emerald Fennell")

    def test_film_links_are_absolute(self):
        """Film URLs should be absolute."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            self.assertTrue(
                f["theater_film_link"].startswith("http"),
                f"Film link not absolute: {f['theater_film_link']}",
            )

    def test_dates_sorted(self):
        """Dates within each film should be sorted by timestamp."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for f in films:
            timestamps = [d["timestamp"] for d in f["dates"]]
            self.assertEqual(
                timestamps, sorted(timestamps),
                f"Dates not sorted for {f['title']}",
            )

    def test_opera_session_no_version(self):
        """Opera events should have no version tag."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        gioconda = next(
            (f for f in films if "Gioconda" in f["title"]),
            None,
        )
        if gioconda:
            for d in gioconda["dates"]:
                self.assertNotIn(
                    "version", d,
                    "Opera sessions should have no version tag",
                )

    def test_films_without_sessions_excluded(self):
        """Films with no sessions in range should not appear."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 2, 28),
        )
        # On Feb 28 (today/fixture date), only a few films might have sessions
        for f in films:
            self.assertTrue(
                len(f["dates"]) > 0,
                f"Film with no dates should not be included: {f['title']}",
            )

    def test_year_always_none(self):
        """Verdi year should always be None (ignore FECHA ESTRENO metadata)."""
        films = self.scraper.parse_cartelera(
            self.html, datetime(2026, 2, 28), datetime(2026, 3, 31),
        )
        for film in films:
            self.assertIsNone(
                film["year"],
                f"Year should be None for Verdi film: {film['title']}",
            )


if __name__ == "__main__":
    unittest.main()
