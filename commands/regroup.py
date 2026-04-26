"""Regroup command: standardize film titles via AI and merge duplicate rows."""

import json
import os

import pandas as pd
import requests
from dotenv import load_dotenv

from json_io import parse_dates_column

load_dotenv()

_DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"


_CHUNK_SIZE = 50  # Max titles per DeepSeek call to avoid hitting max-token limits


def _standardize_entries(entries: list[dict]) -> tuple[list[str], list[str], list[str], list[str], list[str]]:
    """Call DeepSeek to standardize film titles, detect special sessions, and normalize directors.

    entries: list of {title, director, year} dicts (unique titles only).
    Returns (title_raw, title, title_en, directors, special) — all lists in the same order and count as input.
    - title_raw: original title unchanged
    - title: original title stripped of non-title parts (in original language)
    - title_en: English standardized title (best for Letterboxd/IMDb matching)
    - director: standardized director (empty string when input had no director)
    - special: special session keyword or empty string for regular films
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
        "You are standardizing a list of film titles from Madrid cinemas.\n\n"
        "For each entry, return:\n"
        "1. 'title_raw': the original title, unchanged\n"
        "2. 'title': the original title STRIPPED of prefixes/descriptors but in original language\n"
        "3. 'title_en': the English standardized title (best for Letterboxd/IMDb matching)\n"
        "4. 'director': standardized director name (empty if missing)\n"
        "5. 'special': empty '' for regular films, or one of these keywords for special sessions:\n"
        "   conference, shorts, festival, event, compilation, tv_show, opera, ballet, theater, concert, live_music, double_session\n\n"
        "Stripping rules for 'title':\n"
        "- Remove prefixes: 'Ciclo de', 'Conversa:', 'Presenta:', 'Sesión de cortometrajes', etc.\n"
        "- Remove descriptors: ', concierto y proyección', ', versión restaurada', etc.\n"
        "- Remove original-language titles in parentheses: 'El hombre elefante (The Elephant Man)' → 'El hombre elefante'\n"
        "- Keep the main title in its original language.\n\n"
        "Special session detection:\n"
        "- Title has event prefix (Ciclo, Conversa, Sesión) → conference or shorts\n"
        "- Title is numbered: 'Fromzero #6', 'Sesión I' → event\n"
        "- Missing BOTH director AND year → likely special\n"
        "- Director matches title (e.g., 'Fermín Jiménez Landa, ida y vuelta' + director 'Fermín Jiménez Landa') → conference\n"
        "- Director is 'Varios/as autores/as', 'VV.AA.' → compilation\n"
        "- Otherwise regular film → special=''\n\n"
        "English title examples:\n"
        "- 'Vidas cruzadas' → 'Crash'\n"
        "- 'La fuente de las mujeres' → 'The Source'\n"
        "- 'Shelter' → 'Shelter' (already English)\n\n"
        f"Return ONLY a JSON object:\n"
        f"{{\n"
        f"  \"title_raw\": [... {n} strings ...],\n"
        f"  \"title\": [... {n} strings ...],\n"
        f"  \"title_en\": [... {n} strings ...],\n"
        f"  \"directors\": [... {n} strings ...],\n"
        f"  \"special\": [... {n} strings ...]\n"
        f"}}\n\n"
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
            timeout=300,
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
        try:
            result = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"  Error parsing JSON (attempt {attempt}): {e}")
            print(f"  Response length: {len(content)} chars")
            print(f"  First 500 chars: {content[:500]}")
            print(f"  Last 500 chars: {content[-500:]}")
            continue
        title_raw = result.get("title_raw")
        title = result.get("title")
        title_en = result.get("title_en")
        directors = result.get("directors")
        special = result.get("special")
        if (
            isinstance(title_raw, list) and len(title_raw) == n
            and isinstance(title, list) and len(title) == n
            and isinstance(title_en, list) and len(title_en) == n
            and isinstance(directors, list) and len(directors) == n
            and isinstance(special, list) and len(special) == n
        ):
            return (
                [str(t) for t in title_raw],
                [str(t) for t in title],
                [str(t) for t in title_en],
                [str(d) for d in directors],
                [str(s) for s in special],
            )
        print(
            f"  Attempt {attempt}: expected {n} items in 5 arrays, "
            f"got title_raw={len(title_raw) if isinstance(title_raw, list) else '?'} "
            f"title={len(title) if isinstance(title, list) else '?'} "
            f"title_en={len(title_en) if isinstance(title_en, list) else '?'} "
            f"directors={len(directors) if isinstance(directors, list) else '?'} "
            f"special={len(special) if isinstance(special, list) else '?'} — retrying ..."
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

    n_chunks = (len(unique_entries) + _CHUNK_SIZE - 1) // _CHUNK_SIZE
    print(
        f"Standardizing {len(unique_entries)} unique titles via DeepSeek "
        f"({n_chunks} chunk(s) of up to {_CHUNK_SIZE}) ..."
    )
    title_raw_list: list[str] = []
    title_list: list[str] = []
    title_en_list: list[str] = []
    std_directors: list[str] = []
    special_list: list[str] = []
    for chunk_idx in range(n_chunks):
        chunk = unique_entries[chunk_idx * _CHUNK_SIZE : (chunk_idx + 1) * _CHUNK_SIZE]
        print(f"  Chunk {chunk_idx + 1}/{n_chunks} ({len(chunk)} titles) ...", flush=True)
        tr, t, te, d, s = _standardize_entries(chunk)
        title_raw_list.extend(tr)
        title_list.extend(t)
        title_en_list.extend(te)
        std_directors.extend(d)
        special_list.extend(s)

    title_raw_map = {e["title"]: s for e, s in zip(unique_entries, title_raw_list)}
    title_map = {e["title"]: s for e, s in zip(unique_entries, title_list)}
    title_en_map = {e["title"]: s for e, s in zip(unique_entries, title_en_list)}
    # Director map: keyed on (title, original_director) so same-named directors on
    # different films don't accidentally overwrite each other's corrections.
    director_map = {
        (e["title"], e["director"]): d
        for e, d in zip(unique_entries, std_directors)
    }
    special_map = {e["title"]: s for e, s in zip(unique_entries, special_list)}

    title_en_changes = [(o, n) for o, n in title_en_map.items() if o != n]
    if title_en_changes:
        print(f"  → {len(title_en_changes)} title(s) standardized to English:")
        for orig, new in title_en_changes:
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
            print(f"      '{orig}'  →  '{new}'")
    else:
        print("  → No director changes.")

    special_detected = [
        (t, s) for t, s in special_map.items() if s
    ]
    if special_detected:
        print(f"  → {len(special_detected)} special session(s) detected:")
        for title, special in special_detected:
            print(f"      '{title}'  →  {special}")

    # Apply maps to dataframe using original title as key
    orig_title = df["title"].astype(str)  # Keep original title column for mapping
    df["title_raw"] = orig_title.apply(lambda t: title_raw_map.get(t, t))
    df["title"] = orig_title.apply(lambda t: title_map.get(t, t))
    df["title_en"] = orig_title.apply(lambda t: title_en_map.get(t, t))
    df["special"] = orig_title.apply(lambda t: special_map.get(t) or None)
    # Apply director map before updating — keys use original titles
    df["director"] = df.apply(
        lambda row: director_map.get(
            (orig_title[row.name], str(row["director"]) if pd.notna(row["director"]) else ""),
            str(row["director"]) if pd.notna(row["director"]) else None,
        ) or None,
        axis=1,
    )

    # Regroup by title_en (canonical English form), merging dates lists
    result = []
    for en_title, group in df.groupby("title_en", sort=False):
        merged_dates: list[dict] = []
        seen_keys: set[tuple] = set()
        for dates in group["_dates"]:
            for d in dates:
                key = (d.get("timestamp"), d.get("location"))
                if key not in seen_keys:
                    seen_keys.add(key)
                    merged_dates.append(d)

        # Pick first non-empty values from the group
        title_raw = next(
            (str(v) for v in group["title_raw"].values if pd.notna(v) and str(v).strip()),
            en_title,
        )
        title = next(
            (str(v) for v in group["title"].values if pd.notna(v) and str(v).strip()),
            en_title,
        )
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
            "title_raw": title_raw,
            "title": title,
            "title_en": en_title,
            "dates": merged_dates,
            "director": director,
            "year": year_val,
            "special": special,
        })

    out_df = pd.DataFrame(result)[["title_raw", "title", "title_en", "dates", "director", "year", "special"]]
    out_df["year"] = pd.to_numeric(out_df["year"], errors="coerce").astype("Int64")  # type: ignore[assignment]
    out_df = out_df.sort_values(by="title_en").reset_index(drop=True)  # type: ignore[call-overload]
    out_df.to_csv(output_csv, index=False)

    print(f"\n✓ Regrouped {len(df)} rows → {len(out_df)} unique films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")
