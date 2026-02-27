"""Tests for the Embajadores scraper."""

import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.embajadores import (
    EmbajadoresScraper,
    clean_title,
    _base_slug,
    _detect_version,
)


FIXTURES = Path("tests/fixtures/embajadores")


class TestCleanTitle(unittest.TestCase):
    """Test the title-cleaning utility."""

    def test_strip_vose_suffix(self):
        self.assertEqual(clean_title("El agente secreto (VOSE)"), "El agente secreto")

    def test_strip_dubbed_suffix(self):
        self.assertEqual(
            clean_title("El agente secreto (DOBLADA AL ESPAÑOL)"), "El agente secreto"
        )

    def test_strip_clasicos_prefix(self):
        self.assertEqual(
            clean_title(
                "Domingo de clásicos: 2001, una odisea del espacio (VOSE)"
            ),
            "2001, una odisea del espacio",
        )

    def test_strip_politica_prefix(self):
        self.assertEqual(
            clean_title(
                "Cine y política: ¿Teléfono rojo? Volamos hacia Moscú (VOSE)"
            ),
            "¿Teléfono rojo? Volamos hacia Moscú",
        )

    def test_strip_espacio_queer_prefix(self):
        self.assertEqual(
            clean_title("Espacio Queer: Pillion (VOSE)"),
            "Pillion",
        )

    def test_strip_sesion_teta_prefix(self):
        self.assertEqual(
            clean_title("SESIÓN TETA: Cumbres borrascosas (VOSE)"),
            "Cumbres borrascosas",
        )

    def test_strip_laca_y_palomitas_prefix(self):
        self.assertEqual(
            clean_title(
                "Laca y Palomitas especial 2º aniversario: SHOWGIRLS (VOSE)"
            ),
            "SHOWGIRLS",
        )

    def test_strip_musica_en_cine_prefix(self):
        self.assertEqual(
            clean_title("Música en cine: Belleza y Blablablá"),
            "Belleza y Blablablá",
        )

    def test_no_change_plain_title(self):
        self.assertEqual(clean_title("Islas"), "Islas")

    def test_no_change_title_without_known_prefix(self):
        self.assertEqual(clean_title("Relámpago (Piano en directo)"), "Relámpago (Piano en directo)")


class TestVersionDetection(unittest.TestCase):
    """Test URL-based version detection."""

    def test_vose_url(self):
        self.assertEqual(
            _detect_version("https://cinesembajadores.es/pelicula/el-agente-secreto-vose/?ciudad=madrid"),
            "VOSE",
        )

    def test_dubbed_url(self):
        self.assertEqual(
            _detect_version(
                "https://cinesembajadores.es/pelicula/el-agente-secreto-doblada-al-espanol/?ciudad=madrid"
            ),
            "dubbed",
        )

    def test_untagged_url(self):
        self.assertIsNone(
            _detect_version("https://cinesembajadores.es/pelicula/islas/?ciudad=madrid")
        )


class TestBaseSlug(unittest.TestCase):
    """Test slug grouping logic."""

    def test_vose_slug(self):
        self.assertEqual(
            _base_slug("https://cinesembajadores.es/pelicula/el-agente-secreto-vose/?ciudad=madrid"),
            "el-agente-secreto",
        )

    def test_dubbed_slug(self):
        self.assertEqual(
            _base_slug(
                "https://cinesembajadores.es/pelicula/el-agente-secreto-doblada-al-espanol/?ciudad=madrid"
            ),
            "el-agente-secreto",
        )

    def test_untagged_slug(self):
        self.assertEqual(
            _base_slug("https://cinesembajadores.es/pelicula/islas/?ciudad=madrid"),
            "islas",
        )


class TestParseCatalogPage(unittest.TestCase):
    """Test parsing of the main catalog page."""

    def setUp(self):
        fixture = FIXTURES / "catalog-page.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            self.html = f.read()
        self.scraper = EmbajadoresScraper()

    def test_extracts_film_urls(self):
        entries = self.scraper.parse_catalog_page(self.html)
        self.assertTrue(len(entries) > 0, "Should find film URLs")
        # Check types
        for url, version in entries:
            self.assertIn("/pelicula/", url)
            self.assertNotIn("#", url, "Should not contain fragment")

    def test_finds_vose_and_dubbed(self):
        entries = self.scraper.parse_catalog_page(self.html)
        versions = {v for _, v in entries}
        self.assertIn("VOSE", versions, "Should find VOSE films")
        self.assertIn("dubbed", versions, "Should find dubbed films")

    def test_finds_untagged(self):
        entries = self.scraper.parse_catalog_page(self.html)
        versions = {v for _, v in entries}
        self.assertIn(None, versions, "Should find untagged films")

    def test_finds_venta_anticipada(self):
        """Venta anticipada films should appear in the results."""
        entries = self.scraper.parse_catalog_page(self.html)
        urls = [url for url, _ in entries]
        # Check for a known venta anticipada film
        matching = [u for u in urls if "domingo-de-clasicos" in u]
        self.assertTrue(len(matching) > 0, "Should find venta anticipada films")


class TestParseFilmDetail(unittest.TestCase):
    """Test parsing of film detail pages."""

    def setUp(self):
        self.scraper = EmbajadoresScraper()
        self.start = datetime(2026, 2, 27)
        self.end = datetime(2026, 3, 5)

    def test_parse_vose_detail(self):
        fixture = FIXTURES / "film-detail-vose.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            html = f.read()

        url = "https://cinesembajadores.es/pelicula/el-agente-secreto-vose/?ciudad=madrid"
        result = self.scraper.parse_film_detail(html, url, "VOSE", self.start, self.end)

        self.assertIsNotNone(result, "Should parse successfully")
        self.assertEqual(result["title"], "El agente secreto")
        self.assertEqual(result["director"], "Kleber Mendonça Filho")
        self.assertEqual(result["theater"], "Cines Embajadores")

        # Check dates exist
        self.assertTrue(len(result["dates"]) > 0, "Should have screening dates")

        # Check version is set
        for d in result["dates"]:
            self.assertEqual(d["version"], "VOSE")

        # Check locations are mapped
        locations = {d["location"] for d in result["dates"]}
        self.assertTrue(
            locations.issubset({"Embajadores Glorieta", "Embajadores Ercilla"}),
            f"Unexpected locations: {locations}",
        )

        # Check ticket URLs
        for d in result["dates"]:
            self.assertIn("reservaentradas.com", d["url_tickets"])

        # Check date format
        for d in result["dates"]:
            self.assertRegex(d["timestamp"], r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}")

    def test_parse_dubbed_detail(self):
        fixture = FIXTURES / "film-detail-dubbed.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            html = f.read()

        url = "https://cinesembajadores.es/pelicula/el-agente-secreto-doblada-al-espanol/?ciudad=madrid"
        result = self.scraper.parse_film_detail(html, url, "dubbed", self.start, self.end)

        self.assertIsNotNone(result, "Should parse successfully")
        # Same clean title as the VOSE version
        self.assertEqual(result["title"], "El agente secreto")

        # Check version is 'dubbed'
        for d in result["dates"]:
            self.assertEqual(d["version"], "dubbed")

    def test_date_range_filtering(self):
        """Sessions outside the date range should be excluded."""
        fixture = FIXTURES / "film-detail-vose.html"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, "r", encoding="utf-8") as f:
            html = f.read()

        url = "https://cinesembajadores.es/pelicula/el-agente-secreto-vose/?ciudad=madrid"
        # Very narrow range: only Feb 28
        result = self.scraper.parse_film_detail(
            html, url, "VOSE", datetime(2026, 2, 28), datetime(2026, 2, 28)
        )

        if result is not None:
            for d in result["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-02-28"),
                    f"Date outside range: {d['timestamp']}",
                )


if __name__ == "__main__":
    unittest.main()
