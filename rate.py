"""Letterboxd matching and rating functions.

This module re-exports from the letterboxd/ package for backward compatibility.
"""

from letterboxd.search import (
    find_letterboxd_url,
    slugify_director,
    match_films,
    rate_films,
)
from letterboxd.fetch import (
    fetch_letterboxd_info,
    fetch_letterboxd_info_batch,
    fetch_letterboxd_rating,
    fetch_viewers_batch,
)
from letterboxd.helpers import viewers_to_int
from letterboxd.browser import create_browser

__all__ = [
    "find_letterboxd_url",
    "slugify_director",
    "match_films",
    "rate_films",
    "fetch_letterboxd_info",
    "fetch_letterboxd_info_batch",
    "fetch_letterboxd_rating",
    "fetch_viewers_batch",
    "viewers_to_int",
    "create_browser",
]
