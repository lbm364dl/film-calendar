#!/usr/bin/env python3
"""
Compute and store match scores between users' watched films and currently-screened films.

Mirrors the logic in web/src/lib/recommender-pagerank.ts — keep in sync if the algorithm changes.

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
import re
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

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


# ══════════════════════════════════════════════════════════════════════════════
# PERSONALIZED PAGERANK (mirrors web/src/lib/recommender-pagerank.ts)
# ══════════════════════════════════════════════════════════════════════════════

# ── Edge weights per category ───────────────────────────────────────────────

EDGE_WEIGHTS = {
    "director": 3.0,
    "cinematographer": 2.5,
    "writer": 2.5,
    "cast": 2.5,
    "keyword": 2.0,
    "composer": 2.0,
    "genre": 1.5,
    "collection": 1.5,
    "company": 1.0,
    "country": 0.5,
    "decade": 0.5,
    "language": 0.3,
}

MAX_HUB_FRACTION = 0.30
MAX_CAST = 5
MAX_KEYWORDS = 10
MAX_COMPANIES = 3
TMDB_REC_WEIGHT = 2.0

# Keywords that are metadata tags, not taste signals — skip in graph.
BLOCKED_KEYWORDS = {
    "aftercreditsstinger", "duringcreditsstinger", "post-credits scene",
    "black and white", "woman director", "anime", "based on manga",
    "excited", "amused", "admiring", "dramatic", "inspirational",
    "somber", "playful", "suspenseful", "tense", "angry", "defiant",
    "arrogant", "sequel", "remake", "3d",
}

DECADE_PATTERN = re.compile(r"^\d{4}s$")


def is_blocked_keyword(name):
    if name.lower() in BLOCKED_KEYWORDS:
        return True
    if DECADE_PATTERN.match(name):
        return True
    return False


def get_decade_bucket(year):
    if year is None:
        return "unknown"
    if year < 1960:
        return "pre-1960"
    return f"{(year // 10) * 10}s"


# ── Graph construction ──────────────────────────────────────────────────────

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

        # Directors (strongest signal)
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

        # Cinematographers
        for dp in (film.get("cinematographers") or [])[:2]:
            if isinstance(dp, dict) and dp.get("id"):
                dpi = get_or_create(f"cinematographer:{dp['id']}", "cinematographer")
                add_edge(fi, dpi, EDGE_WEIGHTS["cinematographer"])

        # Composers
        for comp in (film.get("composers") or [])[:2]:
            if isinstance(comp, dict) and comp.get("id"):
                ci = get_or_create(f"composer:{comp['id']}", "composer")
                add_edge(fi, ci, EDGE_WEIGHTS["composer"])

        # Writers
        for w in (film.get("writers") or [])[:3]:
            if isinstance(w, dict) and w.get("id"):
                wi = get_or_create(f"writer:{w['id']}", "writer")
                add_edge(fi, wi, EDGE_WEIGHTS["writer"])

        # Genres
        for g in (film.get("genres") or []):
            gi = get_or_create(f"genre:{g.lower()}", "genre")
            add_edge(fi, gi, EDGE_WEIGHTS["genre"])

        # Cast (top billed get stronger edges)
        cast = (film.get("top_cast") or [])[:MAX_CAST]
        for i, m in enumerate(cast):
            if isinstance(m, dict) and m.get("id"):
                w = EDGE_WEIGHTS["cast"] * 1.5 if i < 2 else EDGE_WEIGHTS["cast"]
                ci = get_or_create(f"cast:{m['id']}", "cast")
                add_edge(fi, ci, w)

        # Keywords (skip blocked metadata tags)
        for kw in (film.get("keywords") or [])[:MAX_KEYWORDS]:
            if isinstance(kw, dict) and kw.get("id") and not is_blocked_keyword(kw.get("name", "")):
                ki = get_or_create(f"keyword:{kw['id']}", "keyword")
                add_edge(fi, ki, EDGE_WEIGHTS["keyword"])

        # Countries
        for c in (film.get("country") or []):
            ci = get_or_create(f"country:{c.lower()}", "country")
            add_edge(fi, ci, EDGE_WEIGHTS["country"])

        # Languages (deduplicated)
        langs = set()
        for l in (film.get("primary_language") or []):
            langs.add(l.lower())
        for l in (film.get("spoken_languages") or []):
            langs.add(l.lower())
        for l in langs:
            li = get_or_create(f"lang:{l}", "language")
            add_edge(fi, li, EDGE_WEIGHTS["language"])

        # Decade
        dec = get_decade_bucket(film.get("year"))
        di = get_or_create(f"decade:{dec}", "decade")
        add_edge(fi, di, EDGE_WEIGHTS["decade"])

        # Collection
        if film.get("collection_id"):
            ci = get_or_create(f"collection:{film['collection_id']}", "collection")
            add_edge(fi, ci, EDGE_WEIGHTS["collection"])

        # Production companies
        for co in (film.get("production_companies") or [])[:MAX_COMPANIES]:
            if isinstance(co, dict) and co.get("id"):
                ci = get_or_create(f"company:{co['id']}", "company")
                add_edge(fi, ci, EDGE_WEIGHTS["company"])

    # ── TMDB recommendation edges (direct film-to-film, collaborative signal) ──
    tmdb_id_to_node_idx = {}
    for film in films:
        if film.get("tmdb_id"):
            idx = node_index.get(f"film:{film['id']}")
            if idx is not None:
                tmdb_id_to_node_idx[film["tmdb_id"]] = idx

    for film in films:
        recs = film.get("tmdb_recommendations") or []
        if not recs:
            continue
        film_idx = node_index.get(f"film:{film['id']}")
        if film_idx is None:
            continue
        existing_targets = {e[0] for e in adjacency[film_idx]}
        for rec_tmdb_id in recs:
            rec_idx = tmdb_id_to_node_idx.get(rec_tmdb_id)
            if rec_idx is not None and rec_idx != film_idx and rec_idx not in existing_targets:
                add_edge(film_idx, rec_idx, TMDB_REC_WEIGHT)
                existing_targets.add(rec_idx)

    # ── Prune noisy hub nodes ──────────────────────────────────────────────
    prunable = {"genre", "country", "language", "decade"}
    film_count = len(films)
    max_connections = max(3, int(film_count * MAX_HUB_FRACTION))

    for i, (node_id, category) in enumerate(nodes):
        if category not in prunable:
            continue
        film_neighbors = sum(1 for nb, _ in adjacency[i] if nodes[nb][1] == "film")
        if film_neighbors <= max_connections:
            continue
        # Disconnect: remove all edges from this node AND back-references to it
        targets = [nb for nb, _ in adjacency[i]]
        adjacency[i] = []
        for t in targets:
            adjacency[t] = [(nb, w) for nb, w in adjacency[t] if nb != i]

    return nodes, adjacency, node_index


# ── Personalized PageRank ───────────────────────────────────────────────────

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


# ── Seed weight computation ─────────────────────────────────────────────────

DEFAULT_WATCHED_WEIGHT = 0.5625  # ~3-star equivalent


def recency_factor(url, watched_dates, now_ms):
    """Recency multiplier: 1.0 for today, decays to 0.3 over ~2 years."""
    if not watched_dates or not url:
        return 1.0
    date_str = watched_dates.get(url)
    if not date_str:
        return 1.0
    try:
        watched_ms = datetime.fromisoformat(date_str).timestamp() * 1000
    except (ValueError, TypeError):
        return 1.0
    days_since = (now_ms - watched_ms) / (1000 * 60 * 60 * 24)
    return max(0.3, math.exp(-0.00385 * days_since))


def compute_seed_weight(url, ratings, signals, now_ms):
    """Compute seed weight using all available signals (mirrors TS computeSeedWeight)."""
    if not url:
        return DEFAULT_WATCHED_WEIGHT

    rating = ratings.get(url)
    rewatches = (signals.get("rewatch_counts") or {}).get(url, 0)
    rewatch_mult = 1 + 0.3 * math.log2(1 + rewatches) if rewatches > 0 else 1

    # 1. Has an explicit rating
    if rating is not None:
        if rating < 3.0:
            return 0  # exclude disliked
        return ((rating - 1.5) / 2.5) ** 2 * rewatch_mult

    # 2. Liked but not rated
    liked = (signals.get("liked") or {}).get(url)
    if liked:
        recency = recency_factor(url, signals.get("watched_dates"), now_ms)
        return 4.0 * recency * rewatch_mult

    # 3. Watched only (no rating, no like)
    recency = recency_factor(url, signals.get("watched_dates"), now_ms)
    return DEFAULT_WATCHED_WEIGHT * recency * rewatch_mult


# ── Breakdown computation ───────────────────────────────────────────────────

def compute_breakdown(film_node_idx, adjacency, nodes, probabilities):
    """Compute a category breakdown for a film's PageRank score."""
    category_prob = {}
    total_prob = 0
    categories_with_data = 0

    for nb, weight in adjacency[film_node_idx]:
        _, category = nodes[nb]
        if category == "film":
            continue
        prob = probabilities[nb] * weight
        category_prob[category] = category_prob.get(category, 0) + prob
        total_prob += prob

    by_category = {}
    if total_prob > 0:
        for cat, prob in category_prob.items():
            by_category[cat] = prob / total_prob
            if prob > 0:
                categories_with_data += 1

    possible_categories = len(EDGE_WEIGHTS)
    coverage = categories_with_data / possible_categories if possible_categories > 0 else 0

    return {"coverage": coverage, "byCategory": by_category}


def find_similar_watched(film_node_idx, adjacency, nodes, probabilities,
                         watched_film_indices, total_films, top_n=3):
    """Find top N watched films most connected to a screened film through shared attributes."""
    INTERESTING = {"director", "cinematographer", "composer", "writer", "cast", "collection"}
    watched_data = {}  # node_idx -> {"total": float, "attrs": {attr_idx: float}}

    for edge_target, edge_weight in adjacency[film_node_idx]:
        attr_node_id, attr_category = nodes[edge_target]
        if attr_category == "film":
            continue

        film_neighbor_count = sum(1 for nb, _ in adjacency[edge_target] if nodes[nb][1] == "film")

        if attr_category in INTERESTING:
            if film_neighbor_count > total_films * 0.25:
                continue
        else:
            # Only allow very specific keywords (connected to <3% of films)
            if attr_category == "keyword" and film_neighbor_count <= total_films * 0.03:
                pass  # keep niche keywords
            else:
                continue

        attr_prob = probabilities[edge_target]
        for attr_edge_target, attr_edge_weight in adjacency[edge_target]:
            if attr_edge_target not in watched_film_indices:
                continue
            contribution = attr_prob * edge_weight * attr_edge_weight
            if attr_edge_target not in watched_data:
                watched_data[attr_edge_target] = {"total": 0, "attrs": {}}
            entry = watched_data[attr_edge_target]
            entry["total"] += contribution
            entry["attrs"][edge_target] = entry["attrs"].get(edge_target, 0) + contribution

    results = sorted(watched_data.items(), key=lambda x: x[1]["total"], reverse=True)[:top_n]
    out = []
    for idx, data in results:
        # Find top contributing attribute node
        top_attr_idx = max(data["attrs"], key=data["attrs"].get) if data["attrs"] else None
        if top_attr_idx is not None:
            attr_node = nodes[top_attr_idx]
            reason = attr_node[1]  # category
            attr_value = attr_node[0].split(":", 1)[1] if ":" in attr_node[0] else ""
        else:
            reason = ""
            attr_value = ""
        film_id = int(nodes[idx][0].split(":")[1])
        out.append({"filmId": film_id, "reason": reason, "attrValue": attr_value})
    return out


# ── Main scoring function ──────────────────────────────────────────────────

def score_films_pagerank(watched_films, screened_films, user_ratings, url_map, signals=None):
    """Score screened films using Personalized PageRank.

    Returns list of {"film_id": int, "score": int, "breakdown": dict}.
    """
    if signals is None:
        signals = {}

    # Deduplicate films
    all_films_map = {}
    for f in watched_films:
        all_films_map[f["id"]] = f
    for f in screened_films:
        all_films_map[f["id"]] = f
    all_films = list(all_films_map.values())

    nodes, adjacency, node_index = build_knowledge_graph(all_films)

    # Build seeds from watched films using full signal computation
    watched_ids = {f["id"] for f in watched_films}
    seed_indices = []
    seed_weights = []
    now_ms = time.time() * 1000

    for film in watched_films:
        short_url = url_map.get(film["id"])
        weight = compute_seed_weight(short_url, user_ratings, signals, now_ms)
        if weight <= 0:
            continue
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        if idx is None:
            continue
        seed_indices.append(idx)
        seed_weights.append(weight)

    # Collect watched film node indices for similarity lookup
    watched_film_node_indices = set()
    for film in watched_films:
        idx = node_index.get(f"film:{film['id']}")
        if idx is not None:
            watched_film_node_indices.add(idx)

    if not seed_indices:
        return [{"film_id": f["id"], "score": 0, "breakdown": {"coverage": 0, "byCategory": {}}}
                for f in screened_films]

    # Adaptive damping: new users stay closer to seeds, cinephiles explore more
    alpha = 0.10 + 0.15 * math.exp(-len(watched_films) / 200)

    probs = run_ppr(adjacency, seed_indices, seed_weights, alpha=alpha)

    # Extract raw scores for screened films
    raw_scores = []
    for film in screened_films:
        film_node = f"film:{film['id']}"
        idx = node_index.get(film_node)
        watched = film["id"] in watched_ids
        raw = probs[idx] if idx is not None else 0.0
        raw_scores.append({
            "film_id": film["id"], "raw": raw, "idx": idx if idx is not None else -1,
            "watched": watched,
        })

    # Min-max normalize using only unwatched films
    unwatched_raws = [s["raw"] for s in raw_scores if not s["watched"]]
    if unwatched_raws:
        mn = min(unwatched_raws)
        mx = max(unwatched_raws)
    else:
        mn, mx = 0, 1
    rng = mx - mn

    results = []
    for s in raw_scores:
        normalized = (s["raw"] - mn) / rng if rng > 0 else 0.5
        score = round(5 + normalized * 90)

        # Compute breakdown + similar watched films
        if s["idx"] >= 0:
            breakdown = compute_breakdown(s["idx"], adjacency, nodes, probs)
            similar_raw = find_similar_watched(
                s["idx"], adjacency, nodes, probs,
                watched_film_node_indices, len(all_films),
            )
            breakdown["_similarRaw"] = similar_raw
        else:
            breakdown = {"coverage": 0, "byCategory": {}}

        results.append({"film_id": s["film_id"], "score": score, "breakdown": breakdown})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ── Supabase helpers ─────────────────────────────────────────────────────────

FILM_COLUMNS = (
    "id,genres,director,directors,cinematographers,composers,writers,"
    "top_cast,keywords,production_companies,"
    "country,primary_language,spoken_languages,year,runtime_minutes,"
    "letterboxd_rating,tmdb_rating,tmdb_votes,letterboxd_viewers,"
    "collection_id,tmdb_id,tmdb_recommendations,"
    "title,title_en,letterboxd_url"
)

BATCH = 500


def fetch_watched_for_user(supabase, user_id):
    """Paginate through all enriched watched films for a user."""
    rows = []
    offset = 0
    while True:
        resp = (
            supabase.table("user_watched_films")
            .select("letterboxd_short_url,film_id,rating,liked,watched_date,rewatch_count")
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


def resolve_breakdowns(screened_films, watched_films, results):
    """Resolve _similarRaw film IDs to titles/URLs and attr IDs to names."""
    # Build attribute ID -> name lookup from all film data
    attr_names = {}
    all_films = list(screened_films) + list(watched_films)
    for f in all_films:
        for d in (f.get("directors") or []):
            if isinstance(d, dict) and d.get("id"):
                attr_names[f"director:{d['id']}"] = d.get("name", "")
        for dp in (f.get("cinematographers") or []):
            if isinstance(dp, dict) and dp.get("id"):
                attr_names[f"cinematographer:{dp['id']}"] = dp.get("name", "")
        for comp in (f.get("composers") or []):
            if isinstance(comp, dict) and comp.get("id"):
                attr_names[f"composer:{comp['id']}"] = comp.get("name", "")
        for w in (f.get("writers") or []):
            if isinstance(w, dict) and w.get("id"):
                attr_names[f"writer:{w['id']}"] = w.get("name", "")
        for c in (f.get("top_cast") or []):
            if isinstance(c, dict) and c.get("id"):
                attr_names[f"cast:{c['id']}"] = c.get("name", "")
        for k in (f.get("keywords") or []):
            if isinstance(k, dict) and k.get("id"):
                attr_names[f"keyword:{k['id']}"] = k.get("name", "")
        for co in (f.get("production_companies") or []):
            if isinstance(co, dict) and co.get("id"):
                attr_names[f"company:{co['id']}"] = co.get("name", "")

    # Build film ID -> title/url lookup
    film_titles = {}
    film_titles_en = {}
    film_urls = {}
    for f in all_films:
        film_titles[f["id"]] = f.get("title", "")
        film_titles_en[f["id"]] = f.get("title_en", "") or ""
        film_urls[f["id"]] = f.get("letterboxd_url", "") or ""

    PERSON_CATEGORIES = {"director", "cast", "cinematographer", "composer", "writer"}

    for result in results:
        bd = result["breakdown"]
        similar_raw = bd.pop("_similarRaw", None)
        if similar_raw:
            similar_to = []
            for r in similar_raw:
                fid = r["filmId"]
                if not film_titles.get(fid):
                    continue
                key = f"{r['reason']}:{r['attrValue']}"
                resolved_value = attr_names.get(key, "")
                if not resolved_value:
                    continue
                entry = {
                    "title": film_titles[fid],
                    "reason": r["reason"],
                    "value": resolved_value,
                }
                title_en = film_titles_en.get(fid)
                if title_en:
                    entry["titleEn"] = title_en
                url = film_urls.get(fid)
                if url:
                    entry["url"] = url
                if r["reason"] in PERSON_CATEGORIES and r["attrValue"]:
                    entry["valueUrl"] = f"https://www.themoviedb.org/person/{r['attrValue']}"
                similar_to.append(entry)
            if similar_to:
                bd["similarTo"] = similar_to


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
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        sys.exit(1)

    supabase = create_client(url, key)

    # ── 1. Load currently-screened films ─────────────────────────────────────
    # DB stores naive Madrid timestamps, so compare with Madrid "now"
    # (matches web/src/app/api/recommend/route.ts)
    madrid_now = datetime.now(ZoneInfo("Europe/Madrid"))
    now = madrid_now.strftime("%Y-%m-%d %H:%M:%S")
    screened_film_ids = []
    offset = 0
    while True:
        resp = (
            supabase.table("screenings")
            .select("film_id")
            .gte("showtime", now)
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        batch = resp.data or []
        screened_film_ids.extend(row["film_id"] for row in batch)
        if len(batch) < BATCH:
            break
        offset += BATCH
    screened_film_ids = list(set(screened_film_ids))

    if not screened_film_ids:
        print("No current or future screenings found. Nothing to do.")
        return

    print(f"Found {len(screened_film_ids)} currently-screened film(s).")

    screened_films = fetch_in_batches(supabase, "films", "id", screened_film_ids, select=FILM_COLUMNS)
    screened_by_id = {f["id"]: f for f in screened_films}

    print(f"Loaded features for {len(screened_films)} screened film(s).")

    # ── 2. Find all users with enriched watched data ──────────────────────────
    # Paginate: PostgREST caps responses (default 1000 rows). Without paging,
    # users whose rows fall past the cap are silently dropped from the dedup set.
    user_id_set = set()
    offset = 0
    while True:
        page = (
            supabase.table("user_watched_films")
            .select("user_id")
            .not_.is_("film_id", "null")
            .range(offset, offset + BATCH - 1)
            .execute()
        )
        rows = page.data or []
        if not rows:
            break
        user_id_set.update(row["user_id"] for row in rows)
        if len(rows) < BATCH:
            break
        offset += BATCH
    user_ids = list(user_id_set)

    if not user_ids:
        print("No users with enriched watched data found. Nothing to do.")
        return

    print(f"Found {len(user_ids)} user(s) with enriched watched data.")

    screened_id_set = set(screened_film_ids)
    now_str = datetime.now(timezone.utc).isoformat()
    total_inserted = 0

    # ── 3. Process each user ─────────────────────────────────────────────────
    for i, user_id in enumerate(user_ids, 1):
        print(f"\n[{i}/{len(user_ids)}] User {user_id[:8]}...")

        # Determine which screened films need scoring for this user
        if args.full:
            films_to_score_ids = screened_id_set
        else:
            # Chunk the IN list (PostgREST URL limit) and paginate each chunk
            # (response row cap) so we never silently drop matches.
            already_scored = set()
            for start in range(0, len(screened_film_ids), BATCH):
                chunk = screened_film_ids[start:start + BATCH]
                offset = 0
                while True:
                    page = (
                        supabase.table("user_film_scores")
                        .select("film_id")
                        .eq("user_id", user_id)
                        .in_("film_id", chunk)
                        .range(offset, offset + BATCH - 1)
                        .execute()
                    )
                    rows = page.data or []
                    already_scored.update(row["film_id"] for row in rows)
                    if len(rows) < BATCH:
                        break
                    offset += BATCH
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

        # Build ratings map, signals, and film_id list
        user_ratings = {}
        user_liked = {}
        user_watched_dates = {}
        user_rewatch_counts = {}
        film_ids = []
        url_map = {}
        for row in watched_rows:
            short_url = row["letterboxd_short_url"]
            if row["rating"] is not None:
                user_ratings[short_url] = float(row["rating"])
            if row.get("liked"):
                user_liked[short_url] = True
            if row.get("watched_date"):
                user_watched_dates[short_url] = row["watched_date"]
            if row.get("rewatch_count") and row["rewatch_count"] > 0:
                user_rewatch_counts[short_url] = row["rewatch_count"]
            if row["film_id"] is not None:
                film_ids.append(row["film_id"])
                url_map[row["film_id"]] = short_url

        signals = {
            "liked": user_liked,
            "watched_dates": user_watched_dates,
            "rewatch_counts": user_rewatch_counts,
        }

        # Load watched film features
        watched_films = fetch_in_batches(supabase, "films", "id", film_ids, select=FILM_COLUMNS)
        print(f"  Loaded {len(watched_films)} watched film(s) for profile.")

        # In full mode, score all screened films; in incremental, only missing ones
        films_to_score = [screened_by_id[fid] for fid in films_to_score_ids if fid in screened_by_id]

        # Compute scores with breakdowns
        results = score_films_pagerank(watched_films, films_to_score, user_ratings, url_map, signals)

        # Resolve breakdown _similarRaw to titles/names
        resolve_breakdowns(films_to_score, watched_films, results)

        if not results:
            print("  No scores to write.")
            continue

        if args.dry_run:
            for r in results:
                print(f"  [dry-run] film_id={r['film_id']} score={r['score']}")
            continue

        # In full mode, delete existing scores for this user first
        if args.full:
            supabase.table("user_film_scores").delete().eq("user_id", user_id).execute()

        # Upsert scores with breakdowns
        score_rows = [{
            "user_id": user_id,
            "film_id": r["film_id"],
            "score": r["score"],
            "breakdown": r["breakdown"],
            "computed_at": now_str,
        } for r in results]

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
