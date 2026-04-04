"""JSON I/O helpers for the master screenings file."""

import ast
import json
from pathlib import Path

import pandas as pd


def read_master_json(path: str) -> list[dict]:
    """Read the master screenings JSON file."""
    p = Path(path)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_master_json(films: list[dict], path: str):
    """Write films list to the master screenings JSON file."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(films, f, ensure_ascii=False, indent=2)


def parse_dates_column(val):
    """Parse a dates column value (JSON string, Python repr, or list)."""
    if pd.isna(val) if isinstance(val, float) else not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            try:
                return ast.literal_eval(val)
            except (ValueError, SyntaxError):
                return []
    return []
