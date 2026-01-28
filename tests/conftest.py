"""Pytest fixtures for film-calendar tests."""

import pytest
from pathlib import Path


@pytest.fixture
def fixtures_dir():
    """Return the path to the fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def load_fixture(fixtures_dir):
    """Factory fixture that returns a function to load HTML fixtures."""
    def _load(cinema_key: str, filename: str) -> str:
        fixture_path = fixtures_dir / cinema_key / filename
        if not fixture_path.exists():
            pytest.skip(f"Fixture not found: {fixture_path}")
        content = fixture_path.read_text()
        # Skip if the fixture is just a placeholder comment
        if content.strip().startswith("<!--") and content.strip().endswith("-->"):
            pytest.skip(f"Fixture is placeholder: {fixture_path}")
        return content
    return _load
