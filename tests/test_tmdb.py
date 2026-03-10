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
    "vote_average": 8.5,
    "vote_count": 8200,
    "overview": "While the Civil War rages on, three men set out to find a fortune in gold.",
    "tagline": "For three men the Civil War wasn't hell. It was practice.",
    "belongs_to_collection": None,
    "credits": {
        "crew": [
            {"id": 3153, "name": "Sergio Leone", "job": "Director"},
            {"id": 9999, "name": "Some Editor", "job": "Editor"},
        ],
        "cast": [
            {"id": 190, "name": "Clint Eastwood", "order": 0},
            {"id": 4776, "name": "Lee Van Cleef", "order": 1},
            {"id": 4774, "name": "Eli Wallach", "order": 2},
            {"id": 11000, "name": "Aldo Giuffrè", "order": 3},
            {"id": 12000, "name": "Luigi Pistilli", "order": 4},
            {"id": 13000, "name": "Rada Rassimov", "order": 5},
        ],
    },
    "keywords": {
        "keywords": [
            {"id": 616, "name": "civil war"},
            {"id": 803, "name": "treasure"},
        ]
    },
    "production_companies": [
        {"id": 60, "name": "United Artists"},
        {"id": 10690, "name": "Produzioni Europee Associate"},
    ],
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

    def test_tmdb_id(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["tmdb_id"] == 429

    def test_directors(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["directors"] == [{"id": 3153, "name": "Sergio Leone"}]

    def test_top_cast(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert len(result["top_cast"]) == 5
        assert result["top_cast"][0] == {"id": 190, "name": "Clint Eastwood"}
        assert result["top_cast"][4] == {"id": 12000, "name": "Luigi Pistilli"}

    def test_keywords(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["keywords"] == [
            {"id": 616, "name": "civil war"},
            {"id": 803, "name": "treasure"},
        ]

    def test_tmdb_rating(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["tmdb_rating"] == 8.5

    def test_tmdb_votes(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["tmdb_votes"] == 8200

    def test_production_companies(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["production_companies"] == [
            {"id": 60, "name": "United Artists"},
            {"id": 10690, "name": "Produzioni Europee Associate"},
        ]

    def test_overview(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert "three men" in result["overview"]

    def test_tagline(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert "practice" in result["tagline"]

    def test_collection_none(self):
        result = _parse_tmdb_response(SAMPLE_MOVIE_RESPONSE, "movie")
        assert result["collection_name"] is None
        assert result["collection_id"] is None


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
    "vote_average": 6.8,
    "vote_count": 50,
    "overview": "An animated series about Samuel.",
    "tagline": "",
    "created_by": [
        {"id": 55555, "name": "Alice Creator"},
        {"id": 55556, "name": "Bob Creator"},
    ],
    "credits": {
        "crew": [
            {"id": 77777, "name": "Some Episode Director", "job": "Director"},
        ],
        "cast": [
            {"id": 88001, "name": "Voice Actor 1", "order": 0},
            {"id": 88002, "name": "Voice Actor 2", "order": 1},
        ],
    },
    "keywords": {
        "results": [
            {"id": 1000, "name": "animation"},
        ]
    },
    "production_companies": [
        {"id": 500, "name": "French Studio"},
    ],
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

    def test_tv_directors_from_created_by(self):
        """TV directors should come from created_by, not crew."""
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["directors"] == [
            {"id": 55555, "name": "Alice Creator"},
            {"id": 55556, "name": "Bob Creator"},
        ]

    def test_tv_directors_fallback_to_crew(self):
        """When created_by is empty, fall back to crew directors."""
        data = {**SAMPLE_TV_RESPONSE, "created_by": []}
        result = _parse_tmdb_response(data, "tv")
        assert result["directors"] == [{"id": 77777, "name": "Some Episode Director"}]

    def test_tv_cast(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert len(result["top_cast"]) == 2
        assert result["top_cast"][0] == {"id": 88001, "name": "Voice Actor 1"}

    def test_tv_keywords(self):
        """TV keywords come from 'results' key (not 'keywords')."""
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["keywords"] == [{"id": 1000, "name": "animation"}]

    def test_tv_tmdb_rating(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["tmdb_rating"] == 6.8

    def test_tv_production_companies(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["production_companies"] == [{"id": 500, "name": "French Studio"}]

    def test_tv_overview(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["overview"] == "An animated series about Samuel."

    def test_tv_tagline_empty(self):
        result = _parse_tmdb_response(SAMPLE_TV_RESPONSE, "tv")
        assert result["tagline"] is None  # empty string → None


# =============================================================================
# _parse_tmdb_response — collection
# =============================================================================

class TestParseTmdbResponseCollection:
    def test_collection_present(self):
        data = {
            **SAMPLE_MOVIE_RESPONSE,
            "belongs_to_collection": {"id": 2344, "name": "The Dollars Trilogy"},
        }
        result = _parse_tmdb_response(data, "movie")
        assert result["collection_name"] == "The Dollars Trilogy"
        assert result["collection_id"] == 2344


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
        assert call_args[1]["params"]["append_to_response"] == "translations,credits,keywords"
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
