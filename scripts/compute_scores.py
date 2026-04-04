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
# ══════════════════════════════════════════════════════════════════════════════

EDGE_WEIGHTS = {
    "director": 3.0, "genre": 2.0, "cast": 1.5, "keyword": 1.5,
    "country": 2.0, "language": 1.0, "decade": 1.5, "collection": 1.0,
    "company": 1.0,
}


def build_knowledge_graph(films):
    """Build knowledge graph from film metadata.

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

        # Directors
        directors = film.get("directors") or []
        if directors:
            for d in directors[:2]:
                if isinstance(d, dict) and d.get("id"):
                    di = get_or_create(f"director:{d['id']}", "director")
                    add_edge(fi, di, EDGE_WEIGHTS["director"])
        elif film.get("director"):
            for name in film["director"].split(",")[:2]:
                di = get_or_create(f"director:{name.strip().lower()}", "director")
                add_edge(fi, di, EDGE_WEIGHTS["director"])

        for g in (film.get("genres") or []):
            gi = get_or_create(f"genre:{g.lower()}", "genre")
            add_edge(fi, gi, EDGE_WEIGHTS["genre"])

        cast = (film.get("top_cast") or [])[:MAX_CAST]
        for i, m in enumerate(cast):
            if isinstance(m, dict) and m.get("id"):
                w = EDGE_WEIGHTS["cast"] * (1.5 if i < 2 else 1.0)
                ci = get_or_create(f"cast:{m['id']}", "cast")
                add_edge(fi, ci, w)

        for kw in (film.get("keywords") or [])[:MAX_KEYWORDS]:
            if isinstance(kw, dict) and kw.get("id"):
                ki = get_or_create(f"keyword:{kw['id']}", "keyword")
                add_edge(fi, ki, EDGE_WEIGHTS["keyword"])

        for c in (film.get("country") or []):
            ci = get_or_create(f"country:{c.lower()}", "country")
            add_edge(fi, ci, EDGE_WEIGHTS["country"])

        langs = set()
        for l in (film.get("primary_language") or []): langs.add(l.lower())
        for l in (film.get("spoken_languages") or []): langs.add(l.lower())
        for l in langs:
            li = get_or_create(f"lang:{l}", "language")
            add_edge(fi, li, EDGE_WEIGHTS["language"])

        year = film.get("year")
        dec = "unknown" if year is None else ("pre-1960" if year < 1960 else f"{(year // 10) * 10}s")
        di = get_or_create(f"decade:{dec}", "decade")
        add_edge(fi, di, EDGE_WEIGHTS["decade"])

        if film.get("collection_id"):
            ci = get_or_create(f"collection:{film['collection_id']}", "collection")
            add_edge(fi, ci, EDGE_WEIGHTS["collection"])

        for co in (film.get("production_companies") or [])[:MAX_COMPANIES]:
            if isinstance(co, dict) and co.get("id"):
                ci = get_or_create(f"company:{co['id']}", "company")
                add_edge(fi, ci, EDGE_WEIGHTS["company"])

    return nodes, adjacency, node_index


def run_ppr(adjacency, seed_indices, seed_weights, alpha=0.15, iterations=25):
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


def score_films_pagerank(watched_films, screened_films, user_ratings, url_map):
    """Score screened films using Personalized PageRank.

    Returns dict of {film_id: score (0-100)}.
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
        short_url = url_map.get(film["id"])
        rating = user_ratings.get(short_url, 3.0) if short_url else 3.0
        if rating < 3.0:
            continue
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        if idx is None:
            continue
        weight = ((rating - 1.5) / 2.5) ** 2
        seed_indices.append(idx)
        seed_weights.append(weight)

    if not seed_indices:
        return {f["id"]: 0 for f in screened_films}

    probs = run_ppr(adjacency, seed_indices, seed_weights)

    # Extract raw scores for screened films
    raw_scores = {}
    for film in screened_films:
        if film["id"] in watched_ids:
            continue
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        raw_scores[film["id"]] = probs[idx] if idx is not None else 0.0

    # Min-max normalize to 5-95
    if not raw_scores:
        return {}
    vals = list(raw_scores.values())
    mn, mx = min(vals), max(vals)
    rng = mx - mn
    result = {}
    for fid, raw in raw_scores.items():
        normalized = (raw - mn) / rng if rng > 0 else 0.5
        result[fid] = round(5 + normalized * 90)
    return result


# ── Supabase helpers ─────────────────────────────────────────────────────────

FILM_COLUMNS = (
    "id,genres,director,directors,top_cast,keywords,production_companies,"
    "country,primary_language,spoken_languages,year,runtime_minutes,"
    "letterboxd_rating,tmdb_rating,tmdb_votes,letterboxd_viewers,collection_id"
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
            # Personalized PageRank
            ppr_scores = score_films_pagerank(watched_films, films_to_score, user_ratings, url_map)
            for film_id, s in ppr_scores.items():
                score_rows.append({
                    "user_id": user_id, "film_id": film_id,
                    "score": s, "computed_at": now_str,
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
                print(f"  [dry-run] film_id={row['film_id']} score={row['score']}")
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
