"""Letterboxd integration: search, match, and metadata fetching."""

from .search import find_letterboxd_url, slugify_director, match_films, rate_films
from .fetch import (
    fetch_letterboxd_info,
    fetch_letterboxd_info_batch,
    fetch_letterboxd_rating,
    fetch_viewers_batch,
)
from .browser import create_browser

__all__ = [
    "find_letterboxd_url",
    "slugify_director",
    "match_films",
    "rate_films",
    "fetch_letterboxd_info",
    "fetch_letterboxd_info_batch",
    "fetch_letterboxd_rating",
    "fetch_viewers_batch",
    "create_browser",
]
