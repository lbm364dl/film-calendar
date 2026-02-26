"""Tests for tmdb.py – TMDB API integration."""

import json
import pytest
from unittest.mock import patch, MagicMock

from tmdb import parse_tmdb_url, _parse_tmdb_response, fetch_tmdb_info, _looks_like_v4_token


# =============================================================================
# parse_tmdb_url tests
# =============================================================================

class TestParseTmdbUrl:
    def test_movie_url(self):
        assert parse_tmdb_url("https://www.themoviedb.org/movie/429/") == ("movie", "429")

    def test_tv_url(self):
        assert parse_tmdb_url("https://www.themoviedb.org/tv/248664/") == ("tv", "248664")

    def test_movie_url_no_trailing_slash(self):
        assert parse_tmdb_url("https://www.themoviedb.org/movie/429") == ("movie", "429")

    def test_empty_string(self):
        assert parse_tmdb_url("") is None

    def test_none(self):
        assert parse_tmdb_url(None) is None

    def test_invalid_url(self):
        assert parse_tmdb_url("https://letterboxd.com/film/ikiru/") is None

    def test_url_with_extra_path(self):
        assert parse_tmdb_url("https://www.themoviedb.org/movie/28/something") == ("movie", "28")


# =============================================================================
# _parse_tmdb_response tests — movie
# =============================================================================

SAMPLE_MOVIE_RESPONSE = {
    "id": 429,
    "title": "The Good, the Bad and the Ugly",
    "original_title": "Il buono, il brutto, il cattivo",
    "original_language": "it",
    "genres": [
        {"id": 37, "name": "Western"},
    ],
    "production_countries": [
        {"iso_3166_1": "IT", "name": "Italy"},
        {"iso_3166_1": "ES", "name": "Spain"},
        {"iso_3166_1": "DE", "name": "Germany"},
        {"iso_3166_1": "US", "name": "United States of America"},
    ],
    "spoken_languages": [
        {"english_name": "Italian", "iso_639_1": "it", "name": "Italiano"},
    ],
    "translations": {
        "translations": [
            {
                "iso_639_1": "en",
                "iso_3166_1": "US",
                "name": "English",
                "english_name": "English",
                "data": {
                    "title": "The Good, the Bad and the Ugly",
                    "overview": "While the Civil War rages...",
                    "runtime": 161,
                },
            },
            {
                "iso_639_1": "es",
                "iso_3166_1": "ES",
                "name": "Español",
                "english_name": "Spanish",
                "data": {
                    "title": "El bueno, el feo y el malo",
                    "overview": "Un joven sin ilusiones...",
                    "runtime": 161,
                },
            },
            {
                "iso_639_1": "es",
                "iso_3166_1": "MX",
                "name": "Español",
                "english_name": "Spanish",
                "data": {
                    "title": "El bueno, el malo y el feo",
                    "overview": "...",
                    "runtime": 161,
                },
            },
        ]
    },
    "runtime": 161,
}


class TestParseTmdbResponseMovie:
    def test_genres(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["genres"] == ["Western"]

    def test_countries(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert "Italy" in result["country"]
        assert "Spain" in result["country"]

    def test_primary_language(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["primary_language"] == ["Italian"]

    def test_spoken_languages(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["spoken_languages"] == ["Italian"]

    def test_original_title(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["title_original"] == "Il buono, il brutto, il cattivo"

    def test_english_title(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["title_en"] == "The Good, the Bad and the Ugly"

    def test_spanish_title_prefers_es_es(self):
        """Should prefer ES-ES over ES-MX."""
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["title_es"] == "El bueno, el feo y el malo"

    def test_runtime_minutes(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["runtime_minutes"] == 161


# =============================================================================
# _parse_tmdb_response tests — TV
# =============================================================================

SAMPLE_TV_RESPONSE = {
    "id": 248664,
    "name": "Samuel",
    "original_name": "Samuel",
    "original_language": "fr",
    "genres": [
        {"id": 16, "name": "Animation"},
        {"id": 35, "name": "Comedy"},
        {"id": 18, "name": "Drama"},
    ],
    "production_countries": [
        {"iso_3166_1": "FR", "name": "France"},
        {"iso_3166_1": "ES", "name": "Spain"},
    ],
    "origin_country": ["FR", "ES"],
    "number_of_episodes": 42,
    "spoken_languages": [
        {"english_name": "French", "iso_639_1": "fr", "name": "Français"},
    ],
    "translations": {
        "translations": [
            {
                "iso_639_1": "en",
                "iso_3166_1": "US",
                "name": "English",
                "english_name": "English",
                "data": {"name": "Samuel", "overview": "..."},
            },
        ]
    },
    "episode_run_time": [7],
}


class TestParseTmdbResponseTV:
    def test_genres(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["genres"] == ["Animation", "Comedy", "Drama"]

    def test_countries(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["country"] == ["France", "Spain"]

    def test_original_title(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["title_original"] == "Samuel"

    def test_english_title_from_translation(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["title_en"] == "Samuel"

    def test_runtime_minutes_from_episode_run_time(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["runtime_minutes"] == 294


# =============================================================================
# _parse_tmdb_response edge cases
# =============================================================================

class TestParseTmdbResponseEdgeCases:
    def test_empty_translations(self):
        data = {
            "title": "Some Movie",
            "original_title": "原題",
            "original_language": "ja",
            "genres": [],
            "production_countries": [],
            "spoken_languages": [
                {"english_name": "Japanese", "iso_639_1": "ja", "name": "日本語"},
            ],
            "translations": {"translations": []},
        }
        result = _parse_tmdb_response(data, "movie")
        assert result["title_original"] == "原題"
        assert result["title_en"] == "Some Movie"  # falls back to main title field
        assert result["title_es"] is None

    def test_english_original_language(self):
        """When original language is English, title_en should be the original title."""
        data = {
            "title": "Fight Club",
            "original_title": "Fight Club",
            "original_language": "en",
            "genres": [{"id": 18, "name": "Drama"}],
            "production_countries": [{"iso_3166_1": "US", "name": "United States of America"}],
            "spoken_languages": [
                {"english_name": "English", "iso_639_1": "en", "name": "English"},
            ],
            "translations": {
                "translations": [
                    {
                        "iso_639_1": "es",
                        "iso_3166_1": "ES",
                        "data": {"title": "El Club de la Lucha"},
                    },
                ]
            },
        }
        result = _parse_tmdb_response(data, "movie")
        assert result["title_en"] == "Fight Club"
        assert result["title_es"] == "El Club de la Lucha"

    def test_primary_language_fallback_to_code(self):
        """If original_language code not in spoken_languages, use the code."""
        data = {
            "title": "Test",
            "original_title": "Test",
            "original_language": "xx",
            "genres": [],
            "production_countries": [],
            "spoken_languages": [],
            "translations": {"translations": []},
        }
        result = _parse_tmdb_response(data, "movie")
        assert result["primary_language"] == ["xx"]

    def test_tv_fallback_to_origin_country(self):
        """TV with no production_countries should fall back to origin_country."""
        data = {
            "name": "Test Show",
            "original_name": "Test Show",
            "original_language": "en",
            "genres": [],
            "production_countries": [],
            "origin_country": ["US", "GB"],
            "spoken_languages": [
                {"english_name": "English", "iso_639_1": "en", "name": "English"},
            ],
            "translations": {"translations": []},
        }
        result = _parse_tmdb_response(data, "tv")
        assert result["country"] == ["US", "GB"]


# =============================================================================
# fetch_tmdb_info with mocked network
# =============================================================================

class TestFetchTmdbInfo:
    @patch("tmdb.requests.get")
    @patch("tmdb._get_api_token", return_value="test_token")
    def test_fetch_movie(self, mock_token, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = SAMPLE_MOVIE_RESPONSE
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = fetch_tmdb_info("https://www.themoviedb.org/movie/429/")

        assert result is not None
        assert result["genres"] == ["Western"]
        assert result["title_original"] == "Il buono, il brutto, il cattivo"
        assert result["title_en"] == "The Good, the Bad and the Ugly"
        assert result["title_es"] == "El bueno, el feo y el malo"

        # Verify the API call was made with correct params
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert "movie/429" in call_args[0][0]
        assert call_args[1]["params"]["append_to_response"] == "translations"
        assert call_args[1]["params"]["api_key"] == "test_token"

    @patch("tmdb._get_api_token", return_value="test_token")
    def test_fetch_invalid_url(self, mock_token):
        result = fetch_tmdb_info("https://letterboxd.com/film/test/")
        assert result is None

    @patch("tmdb.requests.get")
    @patch("tmdb._get_api_token", return_value="test_token")
    def test_fetch_network_error(self, mock_token, mock_get):
        import requests
        mock_get.side_effect = requests.RequestException("Connection error")

        result = fetch_tmdb_info("https://www.themoviedb.org/movie/999999/")
        assert result is None


class TestAuthDetection:
    def test_detects_v4_token(self):
        assert _looks_like_v4_token("aaa.bbb.ccc") is True

    def test_detects_v3_key(self):
        assert _looks_like_v4_token("abcd1234abcd1234abcd1234abcd1234") is False
