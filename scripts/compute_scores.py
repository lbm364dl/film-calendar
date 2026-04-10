#!/usr/bin/env python3
"""
Compute and store match scores between users' watched films and currently-screened films.

Mirrors the logic in web/src/lib/recommender.ts — keep in sync if the algorithm changes.

Setup:
    pip install supabase python-dotenv

Add to .env (at project root):
    SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    SUPABASE_SECRET_KEY=sb_secret_...

Usage:
    # Default: only add scores for films each user doesn't have a score for yet
    python scripts/compute_scores.py

    # Full recompute: delete all existing scores and recompute from scratch
    # Use this after updating film metadata (genres, directors, cast, etc.)
    python scripts/compute_scores.py --full

Options:
    --full      Recompute all scores for all users (replaces existing scores).
                Default is incremental: only score films missing from user_film_scores.
    --dry-run   Print what would be written without touching the DB.
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

try:
    from dotenv import load_dotenv
except ImportError:
    print("Install python-dotenv first:  pip install python-dotenv")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Install supabase-py first:  pip install supabase")
    sys.exit(1)

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


# ── Feature weights (must match web/src/lib/recommender.ts) ─────────────────

WEIGHTS = {
    "genre":     0.10,
    "director":  0.14,
    "cast":      0.14,
    "keyword":   0.20,
    "country":   0.08,
    "language":  0.06,
    "decade":    0.08,
    "company":   0.06,
    "collection":0.04,
    "runtime":   0.04,
    "rating":    0.06,
}

MAX_CAST      = 5
MAX_KEYWORDS  = 10
MAX_COMPANIES = 3
MIN_GENRE_DIVISOR = 3


# ── Bucket helpers ───────────────────────────────────────────────────────────

def get_decade_bucket(year):
    if year is None:
        return "decade:unknown"
    if year < 1960:
        return "decade:pre-1960"
    return f"decade:{(year // 10) * 10}s"


def get_runtime_bucket(minutes):
    if minutes is None:
        return "runtime:unknown"
    if minutes < 90:
        return "runtime:short"
    if minutes <= 120:
        return "runtime:medium"
    if minutes <= 150:
        return "runtime:long"
    return "runtime:epic"


# ── Feature extraction ───────────────────────────────────────────────────────

def film_to_vector(film: dict) -> dict:
    """Convert a film row to a weighted sparse feature vector (dict)."""
    vec = {}

    # Genres (multi-hot, with minimum divisor)
    genres = film.get("genres") or []
    if genres:
        per = WEIGHTS["genre"] / max(len(genres), MIN_GENRE_DIVISOR)
        for g in genres:
            vec[f"genre:{g.lower()}"] = per

    # Directors (prefer jsonb directors with IDs, fall back to string)
    directors = film.get("directors") or []
    if directors:
        per = WEIGHTS["director"] / len(directors)
        for d in directors:
            vec[f"director:{d['id']}"] = per
    elif film.get("director"):
        vec[f"director:{film['director'].lower()}"] = WEIGHTS["director"]

    # Cast (top N, billing-order weighted)
    cast = (film.get("top_cast") or [])[:MAX_CAST]
    if cast:
        total_order = len(cast) * (len(cast) + 1) // 2
        for i, member in enumerate(cast):
            order_weight = (len(cast) - i) / total_order
            vec[f"cast:{member['id']}"] = WEIGHTS["cast"] * order_weight

    # Keywords
    keywords = (film.get("keywords") or [])[:MAX_KEYWORDS]
    if keywords:
        per = WEIGHTS["keyword"] / len(keywords)
        for k in keywords:
            vec[f"keyword:{k['id']}"] = per

    # Production companies
    companies = (film.get("production_companies") or [])[:MAX_COMPANIES]
    if companies:
        per = WEIGHTS["company"] / len(companies)
        for c in companies:
            vec[f"company:{c['id']}"] = per

    # Country
    country = film.get("country") or []
    if country:
        per = WEIGHTS["country"] / len(country)
        for c in country:
            vec[f"country:{c.lower()}"] = per

    # Languages (primary + spoken, deduplicated)
    all_langs = set(
        [l.lower() for l in (film.get("primary_language") or [])] +
        [l.lower() for l in (film.get("spoken_languages") or [])]
    )
    if all_langs:
        per = WEIGHTS["language"] / len(all_langs)
        for l in all_langs:
            vec[f"lang:{l}"] = per

    # Decade
    vec[get_decade_bucket(film.get("year"))] = WEIGHTS["decade"]

    # Runtime bucket
    vec[get_runtime_bucket(film.get("runtime_minutes"))] = WEIGHTS["runtime"]

    # Rating (combine Letterboxd + TMDB, normalized 0-1)
    ratings = []
    if film.get("letterboxd_rating") is not None:
        ratings.append(float(film["letterboxd_rating"]) / 5)
    if film.get("tmdb_rating") is not None:
        ratings.append(float(film["tmdb_rating"]) / 10)
    if ratings:
        avg = sum(ratings) / len(ratings)
        vec["rating"] = avg * WEIGHTS["rating"]

    # Collection / franchise
    if film.get("collection_id") is not None:
        vec[f"collection:{film['collection_id']}"] = WEIGHTS["collection"]

    return vec


# ── Vector math ──────────────────────────────────────────────────────────────

def dot_product(a: dict, b: dict) -> float:
    smaller, larger = (a, b) if len(a) <= len(b) else (b, a)
    return sum(smaller[k] * larger[k] for k in smaller if k in larger)


def magnitude(v: dict) -> float:
    return math.sqrt(sum(x * x for x in v.values()))


def cosine_similarity(a: dict, b: dict) -> float:
    mag_a, mag_b = magnitude(a), magnitude(b)
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot_product(a, b) / (mag_a * mag_b)


# ── Popularity boost ─────────────────────────────────────────────────────────

def popularity_boost(viewers) -> float:
    if not viewers or viewers <= 0:
        return 1.0
    log_viewers = math.log10(viewers)
    boost = min(log_viewers / 150, 0.05)
    return 1.0 + boost


# ── User profile ─────────────────────────────────────────────────────────────

def build_user_profile(watched_films: list, user_ratings: dict, url_map: dict) -> dict:
    """Build a weighted average taste profile from watched films."""
    profile = {}
    total_weight = 0.0

    for film in watched_films:
        vec = film_to_vector(film)
        short_url = url_map.get(film["id"])
        user_rating = user_ratings.get(short_url, 3.0) if short_url else 3.0
        weight = user_rating / 5.0

        for key, val in vec.items():
            profile[key] = profile.get(key, 0.0) + val * weight
        total_weight += weight

    if total_weight > 0:
        for key in profile:
            profile[key] /= total_weight

    return profile


# ── Scoring ──────────────────────────────────────────────────────────────────

def feature_coverage(film_vec: dict) -> float:
    """Fraction of total feature weight budget with real (non-unknown) data."""
    real_weight = sum(v for k, v in film_vec.items() if not k.endswith(":unknown"))
    max_expected = 1.0 - WEIGHTS["collection"]
    return min(real_weight / max_expected, 1.0)


def score_film(user_profile: dict, film: dict) -> int:
    if not user_profile:
        return 0
    film_vec = film_to_vector(film)
    similarity = cosine_similarity(user_profile, film_vec)
    coverage = feature_coverage(film_vec)
    coverage_penalty = math.sqrt(coverage)
    boosted = similarity * popularity_boost(film.get("letterboxd_viewers")) * coverage_penalty
    return min(100, round(boosted * 100))


def score_film_with_breakdown(user_profile: dict, film: dict, film_names: dict = None) -> dict:
    """
    Score a film and return a detailed breakdown of which features contributed.

    Args:
        user_profile: User's taste profile vector
        film: Film data
        film_names: Optional dict mapping entity IDs to names for better readability
            (e.g., {"director:123": "John Doe", "cast:456": "Jane Doe"})

    Returns:
        {
            "score": int (0-100),
            "similarity": float (before popularity boost),
            "popularity_boost": float,
            "features_by_category": {
                "genre": [{"feature": "drama", "contribution": 0.05}, ...],
                "director": [...],
                ...
            },
            "top_matching_features": [
                {"feature": "genre:drama", "contribution": 0.05, "category": "genre"},
                ...
            ]
        }
    """
    if not user_profile:
        return {
            "score": 0,
            "similarity": 0.0,
            "popularity_boost": 1.0,
            "features_by_category": {},
            "top_matching_features": [],
        }

    film_vec = film_to_vector(film)

    # Compute similarity and boost
    similarity = cosine_similarity(user_profile, film_vec)
    boost = popularity_boost(film.get("letterboxd_viewers"))
    boosted = similarity * boost
    final_score = min(100, round(boosted * 100))

    # Decompose by feature category
    features_by_category = {}
    matching_features = []

    for feature_key, film_value in film_vec.items():
        profile_value = user_profile.get(feature_key, 0.0)
        if profile_value > 0:
            contribution = profile_value * film_value

            # Extract category (e.g., "genre:drama" → "genre")
            category = feature_key.split(":")[0]
            if category not in features_by_category:
                features_by_category[category] = []

            feature_display = film_names.get(feature_key, feature_key) if film_names else feature_key
            features_by_category[category].append({
                "feature": feature_display,
                "contribution": round(contribution, 5),
            })

            matching_features.append({
                "feature": feature_display,
                "contribution": round(contribution, 5),
                "category": category,
            })

    # Sort features within each category by contribution (descending)
    for category in features_by_category:
        features_by_category[category].sort(key=lambda x: x["contribution"], reverse=True)

    # Sort overall matching features by contribution
    matching_features.sort(key=lambda x: x["contribution"], reverse=True)

    return {
        "score": final_score,
        "similarity": round(similarity, 4),
        "popularity_boost": round(boost, 4),
        "features_by_category": features_by_category,
        "top_matching_features": matching_features[:10],  # Top 10 features
    }


# ══════════════════════════════════════════════════════════════════════════════
# PERSONALIZED PAGERANK (default algorithm — mirrors recommender-pagerank.ts)
# Algorithm ported from film-recommendations research repo (220+ experiments)
# ══════════════════════════════════════════════════════════════════════════════

import re
import bisect

EDGE_WEIGHTS_PPR = {
    "director": 3.0, "cinematographer": 2.5, "writer": 2.5, "keyword": 2.5,
    "cast": 2.0, "composer": 2.0, "genre": 2.0, "collection": 1.5,
    "company": 1.0, "country": 1.0, "decade": 0.5, "language": 0.3,
}

MAX_HUB_FRACTION = 0.40
PAGERANK_ITERATIONS = 50
DEFAULT_WATCHED_WEIGHT = 0.5625

BLOCKED_KEYWORDS_SET = {
    "aftercreditsstinger", "duringcreditsstinger", "post-credits scene",
    "black and white", "woman director", "anime", "based on manga",
    "excited", "amused", "admiring", "dramatic", "inspirational",
    "somber", "playful", "suspenseful", "tense", "angry", "defiant",
    "arrogant", "sequel", "remake", "3d",
    "murder", "love", "superhero", "cartoon", "musical",
}


def _is_blocked_keyword(name):
    if name.lower() in BLOCKED_KEYWORDS_SET:
        return True
    if re.match(r"^\d{4}s$", name):
        return True
    return False


def build_knowledge_graph(films):
    """Build knowledge graph with director×genre interactions and genre pairs.

    Returns (nodes, adjacency, node_index) where:
    - nodes[i] = (node_id, category)
    - adjacency[i] = [(neighbor_idx, weight), ...]
    - node_index[node_id] = i
    """
    node_index = {}
    nodes = []
    adjacency = []

    def get_or_create(node_id, category):
        if node_id in node_index:
            return node_index[node_id]
        idx = len(nodes)
        node_index[node_id] = idx
        nodes.append((node_id, category))
        adjacency.append([])
        return idx

    def add_edge(a, b, weight):
        adjacency[a].append((b, weight))
        adjacency[b].append((a, weight))

    for film in films:
        fi = get_or_create(f"film:{film['id']}", "film")

        # Directors + director×genre interactions
        directors = film.get("directors") or []
        dir_ids = []
        if directors:
            for d in directors[:2]:
                if isinstance(d, dict) and d.get("id"):
                    di = get_or_create(f"director:{d['id']}", "director")
                    add_edge(fi, di, EDGE_WEIGHTS_PPR["director"])
                    dir_ids.append(d["id"])
        elif film.get("director"):
            for name in film["director"].split(",")[:2]:
                di = get_or_create(f"director:{name.strip().lower()}", "director")
                add_edge(fi, di, EDGE_WEIGHTS_PPR["director"])

        genres = [g.lower() for g in (film.get("genres") or [])]

        # Director×genre interaction nodes
        for did in dir_ids:
            for g in genres[:3]:
                dg = get_or_create(f"dirgenre:{did}:{g}", "director")
                add_edge(fi, dg, EDGE_WEIGHTS_PPR["director"] * 0.3)

        # Cinematographers
        for dp in (film.get("cinematographers") or [])[:2]:
            if isinstance(dp, dict) and dp.get("id"):
                dpi = get_or_create(f"cinematographer:{dp['id']}", "cinematographer")
                add_edge(fi, dpi, EDGE_WEIGHTS_PPR["cinematographer"])

        # Composers
        for comp in (film.get("composers") or [])[:2]:
            if isinstance(comp, dict) and comp.get("id"):
                ci = get_or_create(f"composer:{comp['id']}", "composer")
                add_edge(fi, ci, EDGE_WEIGHTS_PPR["composer"])

        # Writers
        for w in (film.get("writers") or [])[:3]:
            if isinstance(w, dict) and w.get("id"):
                wi = get_or_create(f"writer:{w['id']}", "writer")
                add_edge(fi, wi, EDGE_WEIGHTS_PPR["writer"])

        # Genres
        for g in genres:
            gi = get_or_create(f"genre:{g}", "genre")
            add_edge(fi, gi, EDGE_WEIGHTS_PPR["genre"])

        # Genre-pair nodes
        if len(genres) >= 2:
            for gi_idx in range(len(genres)):
                for gj_idx in range(gi_idx + 1, min(len(genres), 4)):
                    pair = "+".join(sorted([genres[gi_idx], genres[gj_idx]]))
                    pi = get_or_create(f"genrepair:{pair}", "genre")
                    add_edge(fi, pi, EDGE_WEIGHTS_PPR["genre"] * 0.5)

        cast = (film.get("top_cast") or [])[:MAX_CAST]
        for i, m in enumerate(cast):
            if isinstance(m, dict) and m.get("id"):
                w = EDGE_WEIGHTS_PPR["cast"] * (1.5 if i < 2 else 1.0)
                ci = get_or_create(f"cast:{m['id']}", "cast")
                add_edge(fi, ci, w)

        for kw in (film.get("keywords") or [])[:MAX_KEYWORDS]:
            if isinstance(kw, dict) and kw.get("id") and not _is_blocked_keyword(kw.get("name", "")):
                ki = get_or_create(f"keyword:{kw['id']}", "keyword")
                add_edge(fi, ki, EDGE_WEIGHTS_PPR["keyword"])

        for c in (film.get("country") or []):
            ci = get_or_create(f"country:{c.lower()}", "country")
            add_edge(fi, ci, EDGE_WEIGHTS_PPR["country"])

        langs = set()
        for l in (film.get("primary_language") or []): langs.add(l.lower())
        for l in (film.get("spoken_languages") or []): langs.add(l.lower())
        for l in langs:
            li = get_or_create(f"lang:{l}", "language")
            add_edge(fi, li, EDGE_WEIGHTS_PPR["language"])

        year = film.get("year")
        dec = "unknown" if year is None else ("pre-1960" if year < 1960 else f"{(year // 10) * 10}s")
        di = get_or_create(f"decade:{dec}", "decade")
        add_edge(fi, di, EDGE_WEIGHTS_PPR["decade"])

        if film.get("collection_id"):
            ci = get_or_create(f"collection:{film['collection_id']}", "collection")
            add_edge(fi, ci, EDGE_WEIGHTS_PPR["collection"])

        for co in (film.get("production_companies") or [])[:MAX_COMPANIES]:
            if isinstance(co, dict) and co.get("id"):
                ci = get_or_create(f"company:{co['id']}", "company")
                add_edge(fi, ci, EDGE_WEIGHTS_PPR["company"])

    # TMDB recommendation edges
    tmdb_to_node = {}
    for film in films:
        if film.get("tmdb_id"):
            idx = node_index.get(f"film:{film['id']}")
            if idx is not None:
                tmdb_to_node[film["tmdb_id"]] = idx

    TMDB_REC_WEIGHT = 6.0
    for film in films:
        recs = film.get("tmdb_recommendations") or []
        if not recs:
            continue
        film_idx = node_index.get(f"film:{film['id']}")
        if film_idx is None:
            continue
        for rec_tmdb_id in recs:
            rec_idx = tmdb_to_node.get(rec_tmdb_id)
            if rec_idx is not None and rec_idx != film_idx:
                if not any(t == rec_idx for t, _ in adjacency[film_idx]):
                    add_edge(film_idx, rec_idx, TMDB_REC_WEIGHT)

    # Proportional hub pruning
    film_count = sum(1 for n in nodes if n[1] == "film")
    PRUNABLE_THRESHOLDS = {
        "genre": MAX_HUB_FRACTION, "country": MAX_HUB_FRACTION,
        "language": MAX_HUB_FRACTION, "decade": MAX_HUB_FRACTION,
        "keyword": 0.15,
    }

    for i, (_, category) in enumerate(nodes):
        threshold = PRUNABLE_THRESHOLDS.get(category)
        if threshold is None:
            continue
        max_connections = max(3, int(film_count * threshold))
        film_neighbors = sum(1 for t, _ in adjacency[i] if nodes[t][1] == "film")
        if film_neighbors <= max_connections:
            continue
        scale = max_connections / film_neighbors
        adjacency[i] = [(t, w * scale) for t, w in adjacency[i]]
        for t, _ in adjacency[i]:
            adjacency[t] = [(tt, ww * scale if tt == i else ww) for tt, ww in adjacency[t]]

    return nodes, adjacency, node_index


def run_ppr(adjacency, seed_indices, seed_weights, alpha=0.15, iterations=50):
    """Run Personalized PageRank via power iteration."""
    n = len(adjacency)
    if n == 0 or not seed_indices:
        return [0.0] * n

    # Build restart distribution
    restart = [0.0] * n
    total_sw = sum(seed_weights)
    if total_sw > 0:
        for idx, w in zip(seed_indices, seed_weights):
            restart[idx] = w / total_sw

    # Precompute outgoing weights
    out_weights = [sum(w for _, w in adj) for adj in adjacency]

    p = restart[:]
    for _ in range(iterations):
        next_p = [0.0] * n
        for i in range(n):
            if p[i] == 0:
                continue
            ow = out_weights[i]
            if ow == 0:
                continue
            for nb, w in adjacency[i]:
                next_p[nb] += (1 - alpha) * p[i] * (w / ow)
        for i in range(n):
            next_p[i] += alpha * restart[i]
        p = next_p

    return p


def _compute_seed_weight(film_id, user_ratings, url_map):
    """Compute seed weight for a watched film (mirrors train.py)."""
    short_url = url_map.get(film_id)
    rating = user_ratings.get(short_url) if short_url else None
    if rating is not None:
        if rating < 3.0:
            return 0.0
        return ((rating - 1.5) / 2.5) ** 2
    # Liked films get 4.0 rating equivalent in the calling code
    # but here we just use the default
    return DEFAULT_WATCHED_WEIGHT


def _build_taste_profile(watched_films, user_ratings, url_map):
    """Build weighted taste profile with top contributing films per attribute."""
    directors = {}    # id → (weight, name, top_films)
    genres = {}       # genre_lower → (weight, genre, top_films)
    keywords = {}     # id → (weight, name, top_films)
    cast = {}         # id → (weight, name, top_films)
    cinematographers = {}  # id → (weight, name, top_films)

    def _update(d, key, name, w, ftitle, fid):
        prev = d.get(key, (0, name, []))
        top = prev[2] + [(ftitle, fid, w)]
        top.sort(key=lambda x: -x[2])
        d[key] = (prev[0] + w, name, top[:2])

    for film in watched_films:
        w = _compute_seed_weight(film["id"], user_ratings, url_map)
        if w <= 0:
            continue
        ftitle = film.get("title", "?")

        for d in (film.get("directors") or [])[:2]:
            if isinstance(d, dict) and d.get("id"):
                _update(directors, d["id"], d.get("name", f"Director {d['id']}"), w, ftitle, film["id"])
        for g in (film.get("genres") or []):
            _update(genres, g.lower(), g, w, ftitle, film["id"])
        for kw in (film.get("keywords") or [])[:MAX_KEYWORDS]:
            if isinstance(kw, dict) and kw.get("id"):
                _update(keywords, kw["id"], kw.get("name", f"keyword {kw['id']}"), w, ftitle, film["id"])
        for m in (film.get("top_cast") or [])[:MAX_CAST]:
            if isinstance(m, dict) and m.get("id"):
                _update(cast, m["id"], m.get("name", f"Actor {m['id']}"), w, ftitle, film["id"])
        for dp in (film.get("cinematographers") or [])[:2]:
            if isinstance(dp, dict) and dp.get("id"):
                _update(cinematographers, dp["id"], dp.get("name", f"DP {dp['id']}"), w, ftitle, film["id"])

    return directors, genres, keywords, cast, cinematographers


def _pick_ref_film(top_films, exclude_fid):
    """Pick the best reference film, skipping self-references."""
    for title, fid, _w in top_films:
        if fid != exclude_fid and title:
            return title
    return None


def _film_reasons(film, film_id, directors, genres, keywords, cast, cinematographers):
    """Generate structured reasons for recommending a film.

    Returns list of {type, value, referenceFilm} dicts.
    """
    reasons = []  # (type, weight, value, ref)

    for d in (film.get("directors") or [])[:2]:
        if isinstance(d, dict) and d.get("id") and d["id"] in directors:
            w, name, top_films = directors[d["id"]]
            if w >= 2.0:
                ref = _pick_ref_film(top_films, film_id)
                reasons.append(("director", w, name, ref))

    for m in (film.get("top_cast") or [])[:3]:
        if isinstance(m, dict) and m.get("id") and m["id"] in cast:
            w, name, top_films = cast[m["id"]]
            if w >= 2.0:
                ref = _pick_ref_film(top_films, film_id)
                reasons.append(("cast", w, name, ref))

    top_genre, top_genre_w, top_genre_films = None, 0, []
    for g in (film.get("genres") or []):
        gl = g.lower()
        if gl in genres:
            w, name, top_films = genres[gl]
            if w > top_genre_w:
                top_genre_w = w
                top_genre = name
                top_genre_films = top_films
    if top_genre and top_genre_w >= 5.0:
        ref = _pick_ref_film(top_genre_films, film_id)
        reasons.append(("genre", top_genre_w * 0.5, top_genre, ref))

    for kw in (film.get("keywords") or [])[:5]:
        if isinstance(kw, dict) and kw.get("id") and kw["id"] in keywords:
            w, name, top_films = keywords[kw["id"]]
            if w >= 2.0 and not _is_blocked_keyword(name):
                ref = _pick_ref_film(top_films, film_id)
                reasons.append(("keyword", w, name, ref))

    for dp in (film.get("cinematographers") or [])[:2]:
        if isinstance(dp, dict) and dp.get("id") and dp["id"] in cinematographers:
            w, name, top_films = cinematographers[dp["id"]]
            if w >= 2.0:
                ref = _pick_ref_film(top_films, film_id)
                reasons.append(("cinematographer", w, name, ref))

    reasons.sort(key=lambda r: (-r[1], r[0] == "genre"))
    seen_types = set()
    unique = []
    for rtype, _w, value, ref in reasons:
        if rtype not in seen_types:
            unique.append({"type": rtype, "value": value, "referenceFilm": ref})
            seen_types.add(rtype)
        if len(unique) >= 3:
            break

    if not unique:
        for g in (film.get("genres") or [])[:1]:
            unique.append({"type": "genre", "value": g, "referenceFilm": None})

    return unique


def score_films_pagerank(watched_films, screened_films, user_ratings, url_map):
    """Score screened films using Personalized PageRank with quality prior and
    percentile calibration. Returns dict of {film_id: {"score": int, "reasons": list}}.
    """
    # Deduplicate films
    all_films_map = {}
    for f in watched_films:
        all_films_map[f["id"]] = f
    for f in screened_films:
        all_films_map[f["id"]] = f
    all_films = list(all_films_map.values())

    nodes, adjacency, node_index = build_knowledge_graph(all_films)

    # Build seeds from highly-rated watched films
    watched_ids = {f["id"] for f in watched_films}
    seed_indices = []
    seed_weights = []
    for film in watched_films:
        w = _compute_seed_weight(film["id"], user_ratings, url_map)
        if w <= 0:
            continue
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        if idx is None:
            continue
        seed_indices.append(idx)
        seed_weights.append(w)

    if not seed_indices:
        return {f["id"]: {"score": 0, "reasons": []} for f in screened_films}

    # Adaptive damping
    alpha = 0.10 + 0.15 * math.exp(-len(watched_films) / 200)
    probs = run_ppr(adjacency, seed_indices, seed_weights, alpha=alpha, iterations=PAGERANK_ITERATIONS)

    # Build taste profile for reasons
    prof = _build_taste_profile(watched_films, user_ratings, url_map)

    # Raw scores with quality prior
    pr_max = max(probs) or 1.0
    QUALITY_EPSILON = 0.25
    raw_scores = {}
    for film in screened_films:
        if film["id"] in watched_ids:
            continue
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        pr_score = (probs[idx] / pr_max) if idx is not None else 0.0
        lb = (film.get("letterboxd_rating") or 3.5) / 5.0
        raw_scores[film["id"]] = pr_score + QUALITY_EPSILON * lb

    if not raw_scores:
        return {}

    # Percentile-based calibration
    sorted_scores = sorted(raw_scores.values())
    n_cands = len(sorted_scores)

    result = {}
    for fid, raw in raw_scores.items():
        if n_cands > 1:
            rank = bisect.bisect_left(sorted_scores, raw)
            percentile = rank / (n_cands - 1)
        else:
            percentile = 0.5
        score = round(math.sqrt(percentile) * 90)
        film = all_films_map.get(fid, {})
        reasons = _film_reasons(film, fid, *prof)
        result[fid] = {"score": score, "reasons": reasons}

    return result


# ── Supabase helpers ─────────────────────────────────────────────────────────

FILM_COLUMNS = (
    "id,title,genres,director,directors,cinematographers,composers,writers,"
    "top_cast,keywords,production_companies,"
    "country,primary_language,spoken_languages,year,runtime_minutes,"
    "letterboxd_rating,tmdb_rating,tmdb_votes,letterboxd_viewers,"
    "collection_id,tmdb_id,tmdb_recommendations"
)

BATCH = 500


def fetch_watched_for_user(supabase, user_id):
    """Paginate through all enriched watched films for a user."""
    rows = []
    offset = 0
    while True:
        resp = (
            supabase.table("user_watched_films")
            .select("letterboxd_short_url,film_id,rating,liked")
            .eq("user_id", user_id)
            .not_.is_("film_id", "null")
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < BATCH:
            break
        offset += BATCH
    return rows


def fetch_in_batches(supabase, table, column, values, *, select="*"):
    """Fetch rows where column IN values, in batches (Supabase URL length limit)."""
    rows = []
    for i in range(0, len(values), BATCH):
        batch = values[i:i + BATCH]
        resp = supabase.table(table).select(select).in_(column, batch).execute()
        rows.extend(resp.data or [])
    return rows


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Compute match scores for all users")
    parser.add_argument(
        "--full", action="store_true",
        help="Recompute all scores (replaces existing). Default: only add missing scores."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be written without touching the DB."
    )
    parser.add_argument(
        "--algorithm", choices=["pagerank", "cosine"], default="pagerank",
        help="Algorithm to use. Default: pagerank. Use 'cosine' for the old cosine-similarity approach."
    )
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        sys.exit(1)

    supabase = create_client(url, key)

    # ── 1. Load currently-screened films ─────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    resp = supabase.table("screenings").select("film_id").gte("showtime", now).execute()
    screened_film_ids = list({row["film_id"] for row in (resp.data or [])})

    if not screened_film_ids:
        print("No current or future screenings found. Nothing to do.")
        return

    print(f"Found {len(screened_film_ids)} currently-screened film(s).")

    screened_films = fetch_in_batches(supabase, "films", "id", screened_film_ids, select=FILM_COLUMNS)
    screened_by_id = {f["id"]: f for f in screened_films}

    print(f"Loaded features for {len(screened_films)} screened film(s).")

    # ── 2. Find all users with enriched watched data ──────────────────────────
    resp = (
        supabase.table("user_watched_films")
        .select("user_id")
        .not_.is_("film_id", "null")
        .execute()
    )
    user_ids = list({row["user_id"] for row in (resp.data or [])})

    if not user_ids:
        print("No users with enriched watched data found. Nothing to do.")
        return

    print(f"Found {len(user_ids)} user(s) with enriched watched data.")

    screened_id_set = set(screened_film_ids)
    now_str = datetime.now(timezone.utc).isoformat()
    total_inserted = 0

    # ── 3. Process each user ─────────────────────────────────────────────────
    for i, user_id in enumerate(user_ids, 1):
        print(f"\n[{i}/{len(user_ids)}] User {user_id[:8]}…")

        # Determine which screened films need scoring for this user
        if args.full:
            films_to_score_ids = screened_id_set
        else:
            resp = (
                supabase.table("user_film_scores")
                .select("film_id")
                .eq("user_id", user_id)
                .in_("film_id", screened_film_ids)
                .execute()
            )
            already_scored = {row["film_id"] for row in (resp.data or [])}
            films_to_score_ids = screened_id_set - already_scored

        if not films_to_score_ids:
            print("  All screened films already scored. Skipping.")
            continue

        print(f"  Need to score {len(films_to_score_ids)} film(s).")

        # Load this user's watched films
        watched_rows = fetch_watched_for_user(supabase, user_id)

        if not watched_rows:
            print("  No enriched watched films. Skipping.")
            continue

        # Build ratings map and film_id list
        user_ratings = {}
        film_ids = []
        url_map = {}
        for row in watched_rows:
            short_url = row["letterboxd_short_url"]
            if row["rating"] is not None:
                user_ratings[short_url] = float(row["rating"])
            elif row.get("liked"):
                user_ratings[short_url] = 4.0
            if row["film_id"] is not None:
                film_ids.append(row["film_id"])
                url_map[row["film_id"]] = short_url

        # Load watched film features
        watched_films = fetch_in_batches(supabase, "films", "id", film_ids, select=FILM_COLUMNS)
        print(f"  Loaded {len(watched_films)} watched film(s) for profile.")

        # Score the films that need it
        score_rows = []
        films_to_score = [screened_by_id[fid] for fid in films_to_score_ids if fid in screened_by_id]

        if args.algorithm == "pagerank":
            # Personalized PageRank (improved algorithm from film-recommendations)
            ppr_results = score_films_pagerank(watched_films, films_to_score, user_ratings, url_map)
            for film_id, result in ppr_results.items():
                breakdown = {"reasons": result["reasons"]} if result["reasons"] else None
                score_rows.append({
                    "user_id": user_id, "film_id": film_id,
                    "score": result["score"],
                    "breakdown": json.dumps(breakdown) if breakdown else None,
                    "computed_at": now_str,
                })
        else:
            # Cosine similarity (old algorithm)
            profile = build_user_profile(watched_films, user_ratings, url_map)
            for film in films_to_score:
                s = score_film(profile, film)
                score_rows.append({
                    "user_id": user_id, "film_id": film["id"],
                    "score": s, "computed_at": now_str,
                })

        if not score_rows:
            print("  No scores to write.")
            continue

        if args.dry_run:
            for row in score_rows:
                reasons_str = ""
                if row.get("breakdown"):
                    bd = json.loads(row["breakdown"]) if isinstance(row["breakdown"], str) else row.get("breakdown")
                    if bd and bd.get("reasons"):
                        reasons_str = f" reasons={bd['reasons']}"
                print(f"  [dry-run] film_id={row['film_id']} score={row['score']}{reasons_str}")
            continue

        # In full mode, delete existing scores for this user first
        if args.full:
            supabase.table("user_film_scores").delete().eq("user_id", user_id).execute()

        # Upsert scores
        for j in range(0, len(score_rows), BATCH):
            supabase.table("user_film_scores").upsert(
                score_rows[j:j + BATCH],
                on_conflict="user_id,film_id"
            ).execute()

        total_inserted += len(score_rows)
        print(f"  Wrote {len(score_rows)} score(s).")

    print(f"\nDone. Total scores written: {total_inserted}.")


if __name__ == "__main__":
    main()
