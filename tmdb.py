"""TMDB API integration for fetching movie/TV metadata.

Fetches genres, countries, languages, and title translations from the TMDB v3 API.
Reads credentials automatically from a local .env file (if present) or environment.

Supported auth values (TMDB_API_KEY):
- v4 Read Access Token (JWT-like): sent as Bearer token
- v3 API Key (32-char key): sent as api_key query parameter
"""

import os
import re
import time

import requests
from dotenv import load_dotenv

load_dotenv()

TMDB_API_BASE = "https://api.themoviedb.org/3"


def _get_api_token() -> str:
    """Get TMDB credential from environment.

    Supports either:
    - v4 Read Access Token (JWT-like)
    - v3 API Key
    """
    token = os.environ.get("TMDB_API_KEY", "").strip()
    if not token:
        raise RuntimeError(
            "TMDB_API_KEY environment variable is not set. "
            "Set it in .env as TMDB_API_KEY=... using either a TMDB v4 Read Access Token "
            "or a TMDB v3 API Key from https://www.themoviedb.org/settings/api"
        )
    return token


def _looks_like_v4_token(token: str) -> bool:
    """Heuristic check for TMDB v4 read access token (JWT format)."""
    return token.count(".") == 2


def _headers() -> dict:
    token = _get_api_token()
    headers = {
        "accept": "application/json",
    }
    if _looks_like_v4_token(token):
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _auth_params() -> dict:
    """Return auth query params when using a TMDB v3 API key."""
    token = _get_api_token()
    if _looks_like_v4_token(token):
        return {}
    return {"api_key": token}


def parse_tmdb_url(tmdb_url: str) -> tuple[str, str] | None:
    """Parse a TMDB URL into (media_type, tmdb_id).

    Supports URLs like:
        https://www.themoviedb.org/movie/429/
        https://www.themoviedb.org/tv/248664/

    Returns:
        Tuple of (media_type, tmdb_id) or None if URL cannot be parsed.
        media_type is 'movie' or 'tv'.
    """
    if not tmdb_url:
        return None
    match = re.search(r"themoviedb\.org/(movie|tv)/(\d+)", tmdb_url)
    if match:
        return match.group(1), match.group(2)
    return None


def fetch_tmdb_info(tmdb_url: str) -> dict | None:
    """Fetch metadata from the TMDB API for a given TMDB URL.

    Makes a single API call using append_to_response=translations to get
    details + translations in one request.

    Returns dict with:
        genres: list[str]
        country: list[str]
        primary_language: list[str]     (single-item list for consistency)
        spoken_languages: list[str]
        runtime_minutes: int | None
        title_original: str | None
        title_en: str | None
        title_es: str | None

    Returns None if the URL cannot be parsed or the request fails.
    """
    parsed = parse_tmdb_url(tmdb_url)
    if not parsed:
        return None

    media_type, tmdb_id = parsed

    url = f"{TMDB_API_BASE}/{media_type}/{tmdb_id}"
    params = {
        "append_to_response": "translations,credits,keywords,recommendations",
        **_auth_params(),
    }

    try:
        resp = requests.get(url, headers=_headers(), params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 401:
            print(
                "  TMDB API unauthorized (401). Check TMDB_API_KEY in .env. "
                "It can be either a v4 Read Access Token (JWT-like) or a v3 API Key."
            )
        print(f"  TMDB API error for {tmdb_url}: {e}")
        return None
    except requests.RequestException as e:
        print(f"  TMDB API error for {tmdb_url}: {e}")
        return None

    return _parse_tmdb_response(data, media_type)


def _parse_tmdb_response(data: dict, media_type: str) -> dict:
    """Parse a TMDB details+translations+credits+keywords response into our schema."""
    tmdb_id = data.get("id")

    # Genres
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]

    # Countries
    if media_type == "movie":
        countries = [
            c["name"] for c in data.get("production_countries", []) if c.get("name")
        ]
    else:
        # TV: origin_country has ISO codes; production_companies has countries
        countries = [
            c["name"] for c in data.get("production_countries", []) if c.get("name")
        ]
        if not countries:
            # Fallback: origin_country is a list of ISO codes
            countries = data.get("origin_country", [])

    # Runtime in minutes
    runtime_minutes = None
    if media_type == "movie":
        runtime_val = data.get("runtime")
        if isinstance(runtime_val, int) and runtime_val > 0:
            runtime_minutes = runtime_val
    else:
        # TV fast estimate: total watch time ≈ number_of_episodes * typical episode runtime
        number_of_episodes = data.get("number_of_episodes")
        episode_runtimes = data.get("episode_run_time", [])
        typical_episode_runtime = None
        if isinstance(episode_runtimes, list):
            valid_runtimes = [value for value in episode_runtimes if isinstance(value, int) and value > 0]
            if valid_runtimes:
                typical_episode_runtime = int(sum(valid_runtimes) / len(valid_runtimes))

        if (
            isinstance(number_of_episodes, int)
            and number_of_episodes > 0
            and isinstance(typical_episode_runtime, int)
            and typical_episode_runtime > 0
        ):
            runtime_minutes = number_of_episodes * typical_episode_runtime

        # Fallback: when episode count is missing, keep per-episode runtime
        if runtime_minutes is None:
            for value in episode_runtimes:
                if isinstance(value, int) and value > 0:
                    runtime_minutes = value
                    break

    # Primary language (TMDB gives ISO 639-1 code)
    orig_lang_code = data.get("original_language", "")
    # Map to full language name from spoken_languages list
    spoken_langs_raw = data.get("spoken_languages", [])
    primary_language = []
    spoken_languages = []
    for lang in spoken_langs_raw:
        lang_name = lang.get("english_name") or lang.get("name", "")
        if lang_name:
            spoken_languages.append(lang_name)
        if lang.get("iso_639_1") == orig_lang_code and lang_name:
            primary_language = [lang_name]

    # If primary language wasn't found in spoken_languages, map from ISO code
    ISO_LANG_NAMES = {
        'en': 'English', 'fr': 'French', 'es': 'Spanish', 'de': 'German',
        'it': 'Italian', 'pt': 'Portuguese', 'ja': 'Japanese', 'ko': 'Korean',
        'zh': 'Chinese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi',
        'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'pl': 'Polish',
        'cs': 'Czech', 'ro': 'Romanian', 'uk': 'Ukrainian', 'ca': 'Catalan',
        'sk': 'Slovak', 'ml': 'Malayalam', 'tl': 'Tagalog', 'ur': 'Urdu',
        'az': 'Azerbaijani', 'nl': 'Dutch', 'fi': 'Finnish', 'el': 'Greek',
        'he': 'Hebrew', 'hu': 'Hungarian', 'id': 'Indonesian', 'ms': 'Malay',
        'th': 'Thai', 'tr': 'Turkish', 'vi': 'Vietnamese', 'bn': 'Bengali',
        'fa': 'Persian', 'ta': 'Tamil', 'te': 'Telugu', 'la': 'Latin',
        'xx': 'No spoken language',
    }
    if not primary_language and orig_lang_code:
        primary_language = [ISO_LANG_NAMES.get(orig_lang_code, orig_lang_code)]

    # Directors (top 2, with TMDB person ID)
    # Movies: from credits.crew where job == "Director"
    # TV: from created_by (show creators), fallback to crew directors
    directors = []
    if media_type == "movie":
        crew = data.get("credits", {}).get("crew", [])
        for member in crew:
            if member.get("job") == "Director" and member.get("name") and member.get("id"):
                directors.append({"id": member["id"], "name": member["name"]})
                if len(directors) >= 2:
                    break
    else:
        # TV shows: use created_by first
        for creator in data.get("created_by", []):
            if creator.get("name") and creator.get("id"):
                directors.append({"id": creator["id"], "name": creator["name"]})
                if len(directors) >= 2:
                    break
        # Fallback: crew directors (if created_by is empty)
        if not directors:
            crew = data.get("credits", {}).get("crew", [])
            # TV shows use job titles like "Series Director", "Director", etc.
            # Prioritize by job title order: Series Director > Director
            director_priority = {"Series Director": 0, "Director": 1}

            # Collect all directors matching priority list
            all_directors = []
            for member in crew:
                job = member.get("job", "")
                if job in director_priority and member.get("name") and member.get("id"):
                    priority = director_priority[job]
                    all_directors.append((priority, member))

            # Sort by priority and add top 2
            all_directors.sort(key=lambda x: x[0])
            for _, member in all_directors[:2]:
                directors.append({"id": member["id"], "name": member["name"]})

    # Cinematographers (top 2, from crew)
    cinematographers = []
    for member in data.get("credits", {}).get("crew", []):
        if member.get("job") == "Director of Photography" and member.get("name") and member.get("id"):
            cinematographers.append({"id": member["id"], "name": member["name"]})
            if len(cinematographers) >= 2:
                break

    # Composers (top 2, from crew)
    composers = []
    for member in data.get("credits", {}).get("crew", []):
        if member.get("job") == "Original Music Composer" and member.get("name") and member.get("id"):
            composers.append({"id": member["id"], "name": member["name"]})
            if len(composers) >= 2:
                break

    # Writers (top 3, from crew)
    writers = []
    writer_jobs = {"Writer", "Screenplay", "Story", "Novel"}
    seen_writers = set()
    for member in data.get("credits", {}).get("crew", []):
        if member.get("job") in writer_jobs and member.get("name") and member.get("id"):
            if member["id"] not in seen_writers:
                writers.append({"id": member["id"], "name": member["name"]})
                seen_writers.add(member["id"])
                if len(writers) >= 3:
                    break

    # Cast (top 5 billed, with TMDB person ID)
    top_cast = []
    cast_list = data.get("credits", {}).get("cast", [])
    for member in cast_list:
        if member.get("name") and member.get("id"):
            top_cast.append({"id": member["id"], "name": member["name"]})
            if len(top_cast) >= 5:
                break

    # Keywords (with TMDB keyword ID)
    keywords_raw = data.get("keywords", {})
    # Movie: {"keywords": [...]}, TV: {"results": [...]}
    kw_list = keywords_raw.get("keywords", []) or keywords_raw.get("results", [])
    keywords = [
        {"id": kw["id"], "name": kw["name"]}
        for kw in kw_list
        if kw.get("id") and kw.get("name")
    ]

    # TMDB rating and vote count
    tmdb_rating = None
    vote_avg = data.get("vote_average")
    if isinstance(vote_avg, (int, float)) and vote_avg > 0:
        tmdb_rating = round(vote_avg, 2)

    tmdb_votes = None
    vote_count = data.get("vote_count")
    if isinstance(vote_count, int) and vote_count > 0:
        tmdb_votes = vote_count

    # Production companies (with TMDB company ID)
    production_companies = [
        {"id": c["id"], "name": c["name"]}
        for c in data.get("production_companies", [])
        if c.get("id") and c.get("name")
    ]

    # TMDB recommendations (collaborative filtering — top 10 TMDB IDs)
    tmdb_recommendations = [
        r["id"]
        for r in data.get("recommendations", {}).get("results", [])[:10]
        if r.get("id")
    ]

    # Collection / franchise
    collection_name = None
    collection_id = None
    collection = data.get("belongs_to_collection")
    if collection and isinstance(collection, dict):
        collection_name = collection.get("name")
        collection_id = collection.get("id")

    # Overview and tagline
    overview = data.get("overview") or None
    tagline = data.get("tagline") or None

    # Original title
    if media_type == "movie":
        title_original = data.get("original_title") or None
    else:
        title_original = data.get("original_name") or None

    # Translations → find English and Spanish titles
    title_en = None
    title_es = None
    translations = data.get("translations", {}).get("translations", [])
    for t in translations:
        iso_lang = t.get("iso_639_1", "")
        iso_country = t.get("iso_3166_1", "")
        t_data = t.get("data", {})

        title_val = t_data.get("title") or t_data.get("name") or ""

        if iso_lang == "en" and title_val and title_en is None:
            title_en = title_val
        elif iso_lang == "es" and title_val and title_es is None:
            # Prefer ES-ES over ES-MX
            if iso_country == "ES":
                title_es = title_val
            elif title_es is None:
                title_es = title_val

    # For English title: if translations didn't have it, and original language is English,
    # use the original title. Also fall back to the main "title"/"name" field.
    if not title_en:
        if orig_lang_code == "en":
            title_en = title_original
        else:
            # The main title/name field is typically English
            main_title = data.get("title") or data.get("name") or ""
            if main_title and main_title != title_original:
                title_en = main_title

    return {
        "tmdb_id": tmdb_id,
        "genres": genres,
        "country": countries,
        "primary_language": primary_language,
        "spoken_languages": spoken_languages,
        "runtime_minutes": runtime_minutes,
        "directors": directors,
        "cinematographers": cinematographers,
        "composers": composers,
        "writers": writers,
        "top_cast": top_cast,
        "keywords": keywords,
        "tmdb_rating": tmdb_rating,
        "tmdb_votes": tmdb_votes,
        "production_companies": production_companies,
        "collection_name": collection_name,
        "collection_id": collection_id,
        "tmdb_recommendations": tmdb_recommendations,
        "overview": overview,
        "tagline": tagline,
        "title_original": title_original,
        "title_en": title_en,
        "title_es": title_es,
    }


def fetch_tmdb_info_batch(
    tmdb_urls: list[str],
    delay: float = 0.25,
) -> list[dict | None]:
    """Fetch TMDB info for multiple URLs with rate-limiting.

    TMDB allows ~40 requests per 10 seconds for free tier.
    We add a small delay between requests to stay within limits.

    Args:
        tmdb_urls: List of TMDB URLs.
        delay: Seconds to sleep between requests (default 0.25s = ~4 req/s).

    Returns:
        List of result dicts (or None for failed/unparseable URLs).
    """
    results = []
    total = len(tmdb_urls)
    for i, url in enumerate(tmdb_urls):
        print(f"  [{i+1}/{total}] TMDB: {url}")
        info = fetch_tmdb_info(url)
        results.append(info)
        if i < total - 1:
            time.sleep(delay)
    return results
