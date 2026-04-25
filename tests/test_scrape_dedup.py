"""Tests for scrape-time deduplication against Supabase."""

import sys
from datetime import datetime
from types import ModuleType
from unittest.mock import MagicMock, patch

from commands.scrape import _fetch_known_urls, _filter_known_sessions


# Film with session-specific url_tickets (e.g. Sala Equis)
FILM_A = {
    "theater": "Sala Equis",
    "title": "Film A",
    "theater_film_link": "https://example.com/film-a",
    "dates": [
        {"timestamp": "2026-05-01 18:00", "location": "Sala Equis", "url_tickets": "https://tickets.example.com/1", "url_info": ""},
        {"timestamp": "2026-05-02 20:00", "location": "Sala Equis", "url_tickets": "https://tickets.example.com/2", "url_info": ""},
    ],
}

# Film with url_info per session and no url_tickets (Dore-style)
FILM_B = {
    "theater": "Cine Doré",
    "title": "Film B",
    "theater_film_link": "https://example.com/film-b",
    "dates": [
        {"timestamp": "2026-05-01 19:00", "location": "Cine Doré", "url_tickets": "", "url_info": "https://example.com/dore/session-1"},
        {"timestamp": "2026-05-03 21:00", "location": "Cine Doré", "url_tickets": "", "url_info": "https://example.com/dore/session-2"},
    ],
}

# Film with film-level url_tickets shared across all sessions (Cineteca-style)
FILM_CINETECA = {
    "theater": "Cineteca Madrid",
    "title": "Film C",
    "theater_film_link": "https://cineteca.example.com/film-c",
    "dates": [
        {"timestamp": "2026-05-01 18:00", "location": "Cineteca Madrid", "url_tickets": "https://tickets.cineteca.com/film-c", "url_info": "https://cineteca.example.com/film-c"},
        {"timestamp": "2026-05-03 20:00", "location": "Cineteca Madrid", "url_tickets": "https://tickets.cineteca.com/film-c", "url_info": "https://cineteca.example.com/film-c"},
    ],
}


def _make_supabase_mock(ticket_rows, info_rows):
    """Build a supabase client mock.

    First paginate call returns ticket_rows; second returns info_rows.
    Each only returns one page (len < 1000 stops pagination).
    """
    call_count = 0

    def execute_side_effect():
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        result.data = ticket_rows if call_count == 1 else info_rows
        return result

    query_mock = MagicMock()
    query_mock.select.return_value = query_mock
    query_mock.neq.return_value = query_mock
    query_mock.eq.return_value = query_mock
    query_mock.gte.return_value = query_mock
    query_mock.lte.return_value = query_mock
    query_mock.range.return_value = query_mock
    query_mock.execute.side_effect = execute_side_effect

    client_mock = MagicMock()
    client_mock.table.return_value = query_mock
    return client_mock


def _patch_supabase(client_mock):
    """Context manager that injects a fake supabase module with the given client mock."""
    fake_supabase = ModuleType("supabase")
    fake_supabase.create_client = MagicMock(return_value=client_mock)
    return patch.dict(sys.modules, {"supabase": fake_supabase})


# ── _filter_known_sessions ─────────────────────────────────────────────────

class TestFilterKnownSessions:
    def test_no_known_urls_returns_all(self):
        films = [FILM_A, FILM_B, FILM_CINETECA]
        result = _filter_known_sessions(films, set(), set())
        assert result == films

    def test_all_films_covered_returns_empty_list(self):
        all_ticket_keys = {
            ("https://tickets.example.com/1", "2026-05-01 18:00"),
            ("https://tickets.example.com/2", "2026-05-02 20:00"),
            ("https://tickets.cineteca.com/film-c", "2026-05-01 18:00"),
            ("https://tickets.cineteca.com/film-c", "2026-05-03 20:00"),
        }
        all_info = {"https://example.com/dore/session-1", "https://example.com/dore/session-2"}
        result = _filter_known_sessions([FILM_A, FILM_B, FILM_CINETECA], all_ticket_keys, all_info)
        assert result == []

    def test_drops_matched_ticket_session(self):
        known_ticket_keys = {("https://tickets.example.com/1", "2026-05-01 18:00")}
        result = _filter_known_sessions([FILM_A], known_ticket_keys, set())
        assert len(result) == 1
        remaining = [d["timestamp"] for d in result[0]["dates"]]
        assert "2026-05-01 18:00" not in remaining
        assert "2026-05-02 20:00" in remaining

    def test_drops_film_when_all_ticket_sessions_known(self):
        known_ticket_keys = {
            ("https://tickets.example.com/1", "2026-05-01 18:00"),
            ("https://tickets.example.com/2", "2026-05-02 20:00"),
        }
        result = _filter_known_sessions([FILM_A], known_ticket_keys, set())
        assert result == []

    def test_cineteca_film_level_url_only_drops_matched_timestamp(self):
        # Only the 18:00 session is in the DB; 20:00 is new and must be kept
        known_ticket_keys = {("https://tickets.cineteca.com/film-c", "2026-05-01 18:00")}
        result = _filter_known_sessions([FILM_CINETECA], known_ticket_keys, set())
        assert len(result) == 1
        remaining = [d["timestamp"] for d in result[0]["dates"]]
        assert "2026-05-01 18:00" not in remaining
        assert "2026-05-03 20:00" in remaining

    def test_cineteca_film_dropped_when_all_timestamps_known(self):
        known_ticket_keys = {
            ("https://tickets.cineteca.com/film-c", "2026-05-01 18:00"),
            ("https://tickets.cineteca.com/film-c", "2026-05-03 20:00"),
        }
        result = _filter_known_sessions([FILM_CINETECA], known_ticket_keys, set())
        assert result == []

    def test_drops_matched_info_session_dore(self):
        known_info = {"https://example.com/dore/session-1"}
        result = _filter_known_sessions([FILM_B], set(), known_info)
        assert len(result) == 1
        remaining = [d["timestamp"] for d in result[0]["dates"]]
        assert "2026-05-01 19:00" not in remaining
        assert "2026-05-03 21:00" in remaining

    def test_drops_dore_film_when_all_info_sessions_known(self):
        known_info = {"https://example.com/dore/session-1", "https://example.com/dore/session-2"}
        result = _filter_known_sessions([FILM_B], set(), known_info)
        assert result == []

    def test_ticket_url_takes_priority_over_info_url(self):
        film = {
            "theater": "X",
            "title": "Film X",
            "theater_film_link": "https://example.com/x",
            "dates": [
                {"timestamp": "2026-05-01 20:00", "location": "X", "url_tickets": "https://tickets.example.com/x", "url_info": "https://info.example.com/x"},
            ],
        }
        # ticket not known but info known → session kept (info not used for dedup when ticket present)
        result = _filter_known_sessions([film], set(), {"https://info.example.com/x"})
        assert len(result) == 1
        assert len(result[0]["dates"]) == 1

        # ticket key known → session dropped regardless of info
        result = _filter_known_sessions([film], {("https://tickets.example.com/x", "2026-05-01 20:00")}, set())
        assert result == []

    def test_session_with_neither_url_always_kept(self):
        film = {
            "theater": "X",
            "title": "Film X",
            "theater_film_link": "https://example.com/x",
            "dates": [
                {"timestamp": "2026-05-01 20:00", "location": "X", "url_tickets": "", "url_info": ""},
            ],
        }
        result = _filter_known_sessions([film], {("anything", "2026-05-01 20:00")}, {"anything"})
        assert len(result) == 1

    def test_mixed_films_partial_filter(self):
        known_ticket_keys = {("https://tickets.example.com/1", "2026-05-01 18:00")}
        known_info = {"https://example.com/dore/session-1"}
        result = _filter_known_sessions([FILM_A, FILM_B, FILM_CINETECA], known_ticket_keys, known_info)
        assert len(result) == 3
        film_a = next(f for f in result if f["title"] == "Film A")
        film_b = next(f for f in result if f["title"] == "Film B")
        film_c = next(f for f in result if f["title"] == "Film C")
        assert len(film_a["dates"]) == 1
        assert len(film_b["dates"]) == 1
        assert len(film_c["dates"]) == 2

    def test_does_not_mutate_input(self):
        import copy
        films = copy.deepcopy([FILM_A, FILM_B])
        _filter_known_sessions(
            films,
            {("https://tickets.example.com/1", "2026-05-01 18:00")},
            {"https://example.com/dore/session-1"},
        )
        assert len(films[0]["dates"]) == 2
        assert len(films[1]["dates"]) == 2


# ── _fetch_known_urls ──────────────────────────────────────────────────────

class TestFetchKnownUrls:
    def test_returns_empty_sets_without_env(self, monkeypatch):
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
        ticket_keys, info_urls = _fetch_known_urls(datetime(2026, 5, 1), datetime(2026, 5, 31))
        assert ticket_keys == set()
        assert info_urls == set()

    def test_returns_ticket_keys_and_info_urls_from_db(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "fake-key")

        ticket_rows = [{"url_tickets": "https://tickets.example.com/1", "showtime": "2026-05-01T18:00:00"}]
        info_rows = [{"url_info": "https://example.com/dore/session-1"}]
        client_mock = _make_supabase_mock(ticket_rows, info_rows)

        with _patch_supabase(client_mock):
            ticket_keys, info_urls = _fetch_known_urls(datetime(2026, 5, 1), datetime(2026, 5, 31))

        assert ticket_keys == {("https://tickets.example.com/1", "2026-05-01 18:00")}
        assert info_urls == {"https://example.com/dore/session-1"}

    def test_normalizes_showtime_to_hhmm(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "fake-key")

        ticket_rows = [{"url_tickets": "https://t.example.com/x", "showtime": "2026-05-15T20:30:00"}]
        client_mock = _make_supabase_mock(ticket_rows, [])

        with _patch_supabase(client_mock):
            ticket_keys, _ = _fetch_known_urls(datetime(2026, 5, 1), datetime(2026, 5, 31))

        assert ("https://t.example.com/x", "2026-05-15 20:30") in ticket_keys

    def test_passes_date_range_filters(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "fake-key")

        client_mock = _make_supabase_mock([], [])
        query_mock = client_mock.table.return_value

        with _patch_supabase(client_mock):
            _fetch_known_urls(datetime(2026, 5, 1), datetime(2026, 5, 31))

        query_mock.gte.assert_called_with("showtime", "2026-05-01")
        query_mock.lte.assert_called_with("showtime", "2026-05-31 23:59:59")

    def test_paginates_ticket_keys_until_partial_page(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://fake.supabase.co")
        monkeypatch.setenv("SUPABASE_SECRET_KEY", "fake-key")

        page1 = [{"url_tickets": f"https://t.example.com/{i}", "showtime": f"2026-05-{i % 28 + 1:02d}T18:00:00"} for i in range(1000)]
        page2 = [{"url_tickets": "https://t.example.com/last", "showtime": "2026-05-30T20:00:00"}]

        call_count = 0
        def execute_side_effect():
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                result.data = page1
            elif call_count == 2:
                result.data = page2
            else:
                result.data = []
            return result

        query_mock = MagicMock()
        for attr in ("select", "neq", "eq", "gte", "lte", "range"):
            getattr(query_mock, attr).return_value = query_mock
        query_mock.execute.side_effect = execute_side_effect

        client_mock = MagicMock()
        client_mock.table.return_value = query_mock

        with _patch_supabase(client_mock):
            ticket_keys, info_urls = _fetch_known_urls(datetime(2026, 5, 1), datetime(2026, 5, 31))

        assert len(ticket_keys) == 1001
        assert ("https://t.example.com/last", "2026-05-30 20:00") in ticket_keys
        assert info_urls == set()
