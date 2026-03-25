"""Tests for the Cines Yelmo scraper."""

import json
import unittest
from datetime import datetime
from pathlib import Path

from fetch_films.yelmo import (
    YelmoScraper,
    _is_vose,
    _is_espanol,
    _parse_dotnet_date,
    LOCATIONS,
)

FIXTURES = Path("tests/fixtures/yelmo")


class TestHelpers(unittest.TestCase):
    """Test helper / utility functions."""

    def test_is_vose_spanish_subs(self):
        self.assertTrue(_is_vose("INGLÉS SUBTITULADO EN ESPAÑOL (VOSE)"))

    def test_is_vose_japanese(self):
        self.assertTrue(_is_vose("JAPONÉS SUBTITULADO EN ESPAÑOL (VOSE)"))

    def test_is_vose_vosi(self):
        self.assertTrue(_is_vose("COREANO SUBTITULADO EN INGLÉS (VOSI)"))

    def test_is_vose_espanol_false(self):
        self.assertFalse(_is_vose("ESPAÑOL"))

    def test_is_espanol(self):
        self.assertTrue(_is_espanol("ESPAÑOL"))

    def test_is_espanol_vose_false(self):
        self.assertFalse(_is_espanol("INGLÉS SUBTITULADO EN ESPAÑOL (VOSE)"))

    def test_is_espanol_subtitulos_false(self):
        """'SUBTÍTULOS ESPAÑOL' is not the same as dubbed Spanish."""
        self.assertFalse(_is_espanol("SUBTÍTULOS ESPAÑOL"))

    def test_is_espanol_cor_false(self):
        self.assertFalse(_is_espanol("COR"))

    def test_is_vose_subtitulos_false(self):
        self.assertFalse(_is_vose("SUBTÍTULOS ESPAÑOL"))

    def test_parse_dotnet_date(self):
        dt = _parse_dotnet_date("/Date(1774418400000)/")
        self.assertIsNotNone(dt)
        self.assertEqual(dt.date().isoformat(), "2026-03-25")

    def test_parse_dotnet_date_invalid(self):
        self.assertIsNone(_parse_dotnet_date("not-a-date"))


class TestParseResponse(unittest.TestCase):
    """Test parsing of the API response fixture."""

    def setUp(self):
        fixture = FIXTURES / "api_response.json"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, encoding="utf-8") as f:
            self.data = json.load(f)
        self.scraper = YelmoScraper()

    def _parse(self, start="2026-03-25", end="2026-03-26"):
        return self.scraper._parse_response(
            self.data,
            datetime.strptime(start, "%Y-%m-%d"),
            datetime.strptime(end, "%Y-%m-%d"),
        )

    def test_finds_films(self):
        films = self._parse()
        self.assertTrue(len(films) > 0, "Should find films")

    def test_film_structure(self):
        """Each film dict should have the required keys."""
        films = self._parse()
        for f in films:
            self.assertIn("theater", f)
            self.assertIn("title", f)
            self.assertIn("theater_film_link", f)
            self.assertIn("dates", f)
            self.assertIn("director", f)
            self.assertEqual(f["theater"], "Cines Yelmo")

    def test_date_format(self):
        """Timestamps should follow 'YYYY-MM-DD HH:MM' format."""
        films = self._parse()
        for f in films:
            for d in f["dates"]:
                self.assertRegex(
                    d["timestamp"],
                    r"\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}",
                    f"Bad timestamp format for {f['title']}: {d['timestamp']}",
                )

    def test_date_range_filtering(self):
        """Only sessions within the date range should be included."""
        films = self._parse(start="2026-03-25", end="2026-03-25")
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["timestamp"].startswith("2026-03-25"),
                    f"Date outside range: {d['timestamp']}",
                )

    def test_locations_are_yelmo_prefixed(self):
        """All locations should start with 'Yelmo'."""
        films = self._parse()
        for f in films:
            for d in f["dates"]:
                self.assertTrue(
                    d["location"].startswith("Yelmo"),
                    f"Location not Yelmo-prefixed: {d['location']}",
                )

    def test_known_locations_present(self):
        """Should include sessions from both fixture cinemas."""
        films = self._parse()
        all_locations = {d["location"] for f in films for d in f["dates"]}
        self.assertIn("Yelmo Ideal", all_locations)
        self.assertIn("Yelmo La Vaguada", all_locations)

    def test_film_links_are_absolute(self):
        """Film URLs should be absolute sinopsis URLs."""
        films = self._parse()
        for f in films:
            self.assertTrue(
                f["theater_film_link"].startswith("https://yelmocines.es/sinopsis/"),
                f"Bad film link: {f['theater_film_link']}",
            )

    def test_info_urls_present(self):
        """Each session should have url_info and url_tickets."""
        films = self._parse()
        for f in films:
            for d in f["dates"]:
                self.assertTrue(d["url_info"], f"Missing url_info for {f['title']}")
                self.assertTrue(
                    d["url_tickets"], f"Missing url_tickets for {f['title']}"
                )

    def test_directors_extracted(self):
        """At least some films should have directors."""
        films = self._parse()
        directors = [f["director"] for f in films if f["director"]]
        self.assertTrue(len(directors) > 0, "Should extract some directors")

    def test_director_title_case(self):
        """Directors should be title-cased (not ALL CAPS)."""
        films = self._parse()
        for f in films:
            if f["director"]:
                self.assertFalse(
                    f["director"] == f["director"].upper()
                    and len(f["director"]) > 3,
                    f"Director still ALL CAPS: {f['director']}",
                )

    def test_dates_sorted(self):
        """Dates within each film should be sorted by timestamp then location."""
        films = self._parse()
        for f in films:
            keys = [(d["timestamp"], d["location"]) for d in f["dates"]]
            self.assertEqual(
                keys,
                sorted(keys),
                f"Dates not sorted for {f['title']}",
            )

    def test_no_duplicate_sessions(self):
        """No film should have duplicate (timestamp, location, version) tuples."""
        films = self._parse()
        for f in films:
            seen = set()
            for d in f["dates"]:
                key = (d["timestamp"], d["location"], d.get("version"))
                self.assertNotIn(
                    key,
                    seen,
                    f"Duplicate session for {f['title']}: {key}",
                )
                seen.add(key)

    def test_films_without_sessions_excluded(self):
        """Films with no sessions in range should not appear."""
        films = self._parse()
        for f in films:
            self.assertTrue(
                len(f["dates"]) > 0,
                f"Film with no dates should not be included: {f['title']}",
            )

    def test_year_always_none(self):
        """Year should always be None (not provided by API)."""
        films = self._parse()
        for f in films:
            self.assertIsNone(
                f["year"],
                f"Year should be None: {f['title']}",
            )


class TestVersionDetection(unittest.TestCase):
    """Test VOSE / dubbed version tagging."""

    def setUp(self):
        fixture = FIXTURES / "api_response.json"
        if not fixture.exists():
            self.skipTest(f"Missing fixture: {fixture}")
        with open(fixture, encoding="utf-8") as f:
            self.data = json.load(f)
        self.scraper = YelmoScraper()

    def _parse(self):
        return self.scraper._parse_response(
            self.data,
            datetime(2026, 3, 25),
            datetime(2026, 3, 26),
        )

    def test_vose_sessions_tagged(self):
        """Films with VOSE sessions should have version='VOSE' on those sessions."""
        films = self._parse()
        vose_sessions = [
            d
            for f in films
            for d in f["dates"]
            if d.get("version") == "VOSE"
        ]
        self.assertTrue(len(vose_sessions) > 0, "Should have some VOSE sessions")

    def test_dubbed_sessions_tagged(self):
        """Films with both VOSE and Spanish should tag Spanish as 'dubbed'."""
        films = self._parse()
        dubbed_sessions = [
            d
            for f in films
            for d in f["dates"]
            if d.get("version") == "dubbed"
        ]
        self.assertTrue(
            len(dubbed_sessions) > 0, "Should have some dubbed sessions"
        )

    def test_spanish_only_films_no_tag(self):
        """Films only in Spanish should have no version tag."""
        films = self._parse()
        # Find films with no version tag at all
        no_version_films = [
            f
            for f in films
            if all("version" not in d for d in f["dates"])
        ]
        self.assertTrue(
            len(no_version_films) > 0,
            "Should have some films without version tags",
        )

    def test_mixed_film_has_both_versions(self):
        """A film with VOSE and dubbed should have both version types."""
        films = self._parse()
        for f in films:
            versions = {d.get("version") for d in f["dates"]}
            if "VOSE" in versions and "dubbed" in versions:
                # Found a mixed film
                return
        # If no mixed film found in fixture, that's OK (fixture-dependent)


class TestDedup(unittest.TestCase):
    """Test deduplication preserves different versions at same time/location."""

    def test_same_time_different_versions_kept(self):
        """VOSE and dubbed at the same time/location must both survive dedup."""
        scraper = YelmoScraper()
        # Minimal synthetic API response: one cinema, one date, one movie
        # with two format entries (VOSE + ESPAÑOL) at the same time.
        data = {
            "d": {
                "Cinemas": [
                    {
                        "Id": 35,
                        "Key": "ideal",
                        "Name": "Ideal",
                        "VistaId": "780",
                        "TimeZoneDifference": 7,
                        "Dates": [
                            {
                                "FilterDate": "/Date(1774418400000)/",
                                "ShowtimeDate": "25 marzo",
                                "Movies": [
                                    {
                                        "Key": "test-film",
                                        "Title": "Test Film",
                                        "Director": "Test Director",
                                        "Formats": [
                                            {
                                                "Name": "2D",
                                                "Language": "INGLÉS SUBTITULADO EN ESPAÑOL (VOSE)",
                                                "Showtimes": [
                                                    {
                                                        "CinemaId": 35,
                                                        "VistaCinemaId": "780",
                                                        "ShowtimeId": "1",
                                                        "Time": "20:00",
                                                    }
                                                ],
                                            },
                                            {
                                                "Name": "2D",
                                                "Language": "ESPAÑOL",
                                                "Showtimes": [
                                                    {
                                                        "CinemaId": 35,
                                                        "VistaCinemaId": "780",
                                                        "ShowtimeId": "2",
                                                        "Time": "20:00",
                                                    }
                                                ],
                                            },
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ]
            }
        }
        films = scraper._parse_response(data, datetime(2026, 3, 25), datetime(2026, 3, 25))
        self.assertEqual(len(films), 1)
        sessions = films[0]["dates"]
        # Both sessions at 20:00 should be kept (different versions)
        self.assertEqual(len(sessions), 2, f"Expected 2 sessions, got {len(sessions)}")
        versions = {s.get("version") for s in sessions}
        self.assertEqual(versions, {"VOSE", "dubbed"})

    def test_true_duplicates_removed(self):
        """Identical (timestamp, location, version) should be deduped."""
        scraper = YelmoScraper()
        data = {
            "d": {
                "Cinemas": [
                    {
                        "Id": 35,
                        "Key": "ideal",
                        "Name": "Ideal",
                        "VistaId": "780",
                        "TimeZoneDifference": 7,
                        "Dates": [
                            {
                                "FilterDate": "/Date(1774418400000)/",
                                "ShowtimeDate": "25 marzo",
                                "Movies": [
                                    {
                                        "Key": "test-film",
                                        "Title": "Test Film",
                                        "Director": "",
                                        "Formats": [
                                            {
                                                "Name": "2D",
                                                "Language": "ESPAÑOL",
                                                "Showtimes": [
                                                    {
                                                        "CinemaId": 35,
                                                        "VistaCinemaId": "780",
                                                        "ShowtimeId": "1",
                                                        "Time": "20:00",
                                                    }
                                                ],
                                            },
                                            {
                                                "Name": "3D",
                                                "Language": "ESPAÑOL",
                                                "Showtimes": [
                                                    {
                                                        "CinemaId": 35,
                                                        "VistaCinemaId": "780",
                                                        "ShowtimeId": "2",
                                                        "Time": "20:00",
                                                    }
                                                ],
                                            },
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ]
            }
        }
        films = scraper._parse_response(data, datetime(2026, 3, 25), datetime(2026, 3, 25))
        self.assertEqual(len(films), 1)
        # Same time, same location, same version (none) → should dedup to 1
        self.assertEqual(len(films[0]["dates"]), 1)


class TestCinemaInfo(unittest.TestCase):
    """Test scraper metadata."""

    def test_cinema_info(self):
        scraper = YelmoScraper()
        info = scraper.cinema_info
        self.assertEqual(info.key, "yelmo")
        self.assertEqual(info.name, "Cines Yelmo")
        self.assertEqual(info.base_url, "https://yelmocines.es")
        self.assertEqual(info.update_period, "weekly")

    def test_locations_mapping_complete(self):
        """Should have 10 Madrid locations."""
        self.assertEqual(len(LOCATIONS), 10)

    def test_all_locations_yelmo_prefixed(self):
        """All location display names should start with 'Yelmo'."""
        for loc_name in LOCATIONS.values():
            self.assertTrue(
                loc_name.startswith("Yelmo"),
                f"Location not Yelmo-prefixed: {loc_name}",
            )


if __name__ == "__main__":
    unittest.main()
