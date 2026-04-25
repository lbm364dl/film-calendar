"""Regroup command: standardize film titles via AI and merge duplicate rows."""

import json
import os

import pandas as pd
import requests
from dotenv import load_dotenv

from json_io import parse_dates_column

load_dotenv()

_DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


def _standardize_entries(entries: list[dict]) -> tuple[list[str], list[str]]:
    """Call DeepSeek to standardize film titles and director names.

    entries: list of {title, director, year} dicts (unique titles only).
    Returns (titles, directors) — both lists in the same order and count as input.
    Director is empty string when the input had no director.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set in environment")

    lines = []
    for i, e in enumerate(entries, 1):
        parts = [f"Title: {e['title']}"]
        if e.get("director"):
            parts.append(f"Director: {e['director']}")
        if e.get("year"):
            parts.append(f"Year: {e['year']}")
        lines.append(f"{i}. {' | '.join(parts)}")

    n = len(entries)
    prompt = (
        "You are given a list of films scraped from different Madrid cinemas.\n"
        "Some titles may refer to the same film with slight spelling differences, "
        "punctuation variants, or different translations. "
        "Director names may also contain typos or inconsistent transliterations.\n"
        "For each entry, choose a canonical standardized title and a canonical director name.\n"
        "Rules for titles:\n"
        "- The canonical title must be the one most likely to match a film database "
        "(e.g. Letterboxd, IMDb). Use the internationally recognized title, not a local "
        "Spanish subtitle or event descriptor added by the cinema.\n"
        "- Strip anything that is not part of the actual film title: subtitles describing "
        "the event format ('concierto y proyección', 'ciclo', 'versión restaurada', etc.), "
        "the original-language title appended in parentheses, or extra descriptors added "
        "by the venue. Examples: 'Shelter. El protector' → 'Shelter', "
        "'Michael, concierto y proyección' → 'Michael'.\n"
        "- If titles clearly refer to the same film, use a single canonical form for all.\n"
        "- Do NOT merge films that are genuinely different.\n"
        "Rules for directors:\n"
        "- Fix typos and normalize to the standard spelling used in film databases.\n"
        "- Use the most common international transliteration for non-Latin names.\n"
        "- If no director was provided for an entry, return an empty string for that entry.\n"
        f"Return a JSON object with exactly two keys:\n"
        f"  'titles': array of exactly {n} strings\n"
        f"  'directors': array of exactly {n} strings\n"
        "Both arrays must be in the same order as the input.\n\n"
        "Films:\n" + "\n".join(lines)
    )

    for attempt in range(1, 4):
        resp = requests.post(
            _DEEPSEEK_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-v4-pro",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "thinking": {"type": "disabled"},
                "temperature": 0,
                "stream": True,
            },
            stream=True,
            timeout=180,
        )
        resp.raise_for_status()

        chunks: list[str] = []
        in_thinking = False
        in_content = False
        for line in resp.iter_lines():
            if not line or line == b"data: [DONE]":
                continue
            if not line.startswith(b"data: "):
                continue
            try:
                chunk = json.loads(line[6:])
                delta = chunk["choices"][0]["delta"]
            except (KeyError, json.JSONDecodeError):
                continue

            thinking_token = delta.get("reasoning_content", "")
            content_token = delta.get("content", "")

            if thinking_token:
                if not in_thinking:
                    print("\n[thinking]", flush=True)
                    in_thinking = True
                print(thinking_token, end="", flush=True)

            if content_token:
                if not in_content:
                    if in_thinking:
                        print()  # newline after thinking block
                    print("\n[response]", flush=True)
                    in_content = True
                chunks.append(content_token)
                print(content_token, end="", flush=True)

        print()

        content = "".join(chunks)
        result = json.loads(content)
        titles = result.get("titles")
        directors = result.get("directors")
        if (
            isinstance(titles, list) and len(titles) == n
            and isinstance(directors, list) and len(directors) == n
        ):
            return [str(t) for t in titles], [str(d) for d in directors]
        print(
            f"  Attempt {attempt}: expected {n} titles+directors, "
            f"got titles={len(titles) if isinstance(titles, list) else '?'} "
            f"directors={len(directors) if isinstance(directors, list) else '?'} — retrying ..."
        )

    raise ValueError(
        f"DeepSeek failed to return exactly {n} titles and directors after 3 attempts"
    )


def run_regroup(args):
    """Execute the regroup command."""
    input_csv = args.input
    output_csv = args.output

    df = pd.read_csv(input_csv)

    if "special" not in df.columns:
        df["special"] = None

    # Parse dates; backfill empty url_info from theater_film_link so no info is lost
    def _prepare_dates(row):
        dates = parse_dates_column(row["dates"])
        raw_link = row.get("theater_film_link")
        link = str(raw_link) if raw_link is not None and pd.notna(raw_link) else ""
        return [
            {**d, "url_info": link} if not d.get("url_info") and link else d
            for d in dates
        ]

    df["_dates"] = df.apply(_prepare_dates, axis=1)

    # Collect unique titles in first-seen order for the API call
    seen: dict[str, int] = {}
    unique_entries: list[dict] = []
    for _, row in df.iterrows():
        title = str(row["title"])
        if title not in seen:
            seen[title] = len(unique_entries)
            director = row.get("director")
            year = row.get("year")
            unique_entries.append({
                "title": title,
                "director": str(director) if director is not None and pd.notna(director) else "",
                "year": int(year) if year is not None and pd.notna(year) else None,  # type: ignore[arg-type]
            })

    print(f"Standardizing {len(unique_entries)} unique titles and directors via DeepSeek ...")
    std_titles, std_directors = _standardize_entries(unique_entries)
    title_map = {e["title"]: s for e, s in zip(unique_entries, std_titles)}
    # Director map: keyed on (title, original_director) so same-named directors on
    # different films don't accidentally overwrite each other's corrections.
    director_map = {
        (e["title"], e["director"]): d
        for e, d in zip(unique_entries, std_directors)
    }

    title_changes = [(o, n) for o, n in title_map.items() if o != n]
    if title_changes:
        print(f"  → {len(title_changes)} title(s) standardized:")
        for orig, new in title_changes:
            print(f"      '{orig}'  →  '{new}'")
    else:
        print("  → No title changes.")

    director_changes = [
        (o_dir, new_dir, o_title)
        for (o_title, o_dir), new_dir in director_map.items()
        if o_dir and o_dir != new_dir
    ]
    if director_changes:
        print(f"  → {len(director_changes)} director(s) standardized:")
        for orig, new, title in director_changes:
            print(f"      '{orig}'  →  '{new}'  (for '{title}')")
    else:
        print("  → No director changes.")

    # Apply director map before updating titles — keys use original titles
    df["director"] = df.apply(
        lambda row: director_map.get(
            (str(row["title"]), str(row["director"]) if pd.notna(row["director"]) else ""),
            str(row["director"]) if pd.notna(row["director"]) else None,
        ) or None,
        axis=1,
    )
    df["title"] = df["title"].astype(str).apply(lambda t: title_map.get(t, t))

    # Regroup by standardized title, merging dates lists
    result = []
    for std_title, group in df.groupby("title", sort=False):
        merged_dates: list[dict] = []
        seen_keys: set[tuple] = set()
        for dates in group["_dates"]:
            for d in dates:
                key = (d.get("timestamp"), d.get("location"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    merged_dates.append(d)

        director = next(
            (str(v) for v in group["director"].values if pd.notna(v) and str(v).strip()),
            None,
        )
        year_val = next((v for v in group["year"].values if pd.notna(v)), None)
        special = next(
            (str(v) for v in group["special"].values if pd.notna(v) and str(v).strip()),
            None,
        )

        result.append({
            "title": std_title,
            "dates": merged_dates,
            "director": director,
            "year": year_val,
            "special": special,
        })

    out_df = pd.DataFrame(result)[["title", "dates", "director", "year", "special"]]
    out_df["year"] = pd.to_numeric(out_df["year"], errors="coerce").astype("Int64")  # type: ignore[assignment]
    out_df = out_df.sort_values(by="title").reset_index(drop=True)  # type: ignore[call-overload]
    out_df.to_csv(output_csv, index=False)

    print(f"\n✓ Regrouped {len(df)} rows → {len(out_df)} unique films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")
