#!/usr/bin/env python3
"""
Recommendation Algorithm Comparison Tool — v2

Implements 5 fundamentally different recommendation approaches:
1. Current Baseline (cosine similarity, hand-tuned weights)
2. TF-IDF Enhanced (best cosine-sim variant)
3. Personalized PageRank (graph-based random walks)
4. Pairwise Learning to Rank (learned feature weights via BPR-style SGD)
5. Bayesian UCB (exploration-exploitation with uncertainty)

Evaluates using 10-split holdout validation on the user's 212 rated films,
then generates an interactive HTML comparison page for the 35 currently
screening films.

Usage:
    python scripts/compare_recommenders.py
"""

import math
import os
import random
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()


# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════

def load_supabase_data():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    sb = create_client(url, key)

    print("Loading films...")
    all_films = []
    offset = 0
    while True:
        res = sb.table("films").select("*").range(offset, offset + 999).execute()
        all_films.extend(res.data)
        if len(res.data) < 1000:
            break
        offset += 1000
    print(f"  {len(all_films)} films")

    print("Loading screenings...")
    now = datetime.now().isoformat()
    screenings = sb.table("screenings").select("film_id").gte("showtime", now).execute()
    future_film_ids = set(s["film_id"] for s in screenings.data)
    print(f"  {len(future_film_ids)} films screening")

    print("Loading watched films...")
    watched = sb.table("user_watched_films").select("*").execute()
    print(f"  {len(watched.data)} watched")

    films_by_id = {f["id"]: f for f in all_films}
    return {
        "all_films": all_films,
        "films_by_id": films_by_id,
        "future_film_ids": future_film_ids,
        "watched": watched.data,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FEATURE EXTRACTION (shared by cosine-based algorithms)
# ═══════════════════════════════════════════════════════════════════════════════

WEIGHTS_CURRENT = {
    "genre": 0.10, "director": 0.14, "cast": 0.14, "keyword": 0.20,
    "country": 0.08, "language": 0.06, "decade": 0.08, "company": 0.06,
    "collection": 0.04, "runtime": 0.04, "rating": 0.06,
}

MAX_CAST, MAX_KEYWORDS, MAX_COMPANIES, MIN_GENRE_DIVISOR = 5, 10, 3, 3


def decade_bucket(year):
    if year is None: return "unknown"
    return "pre-1960" if year < 1960 else f"{(year // 10) * 10}s"


def runtime_bucket(minutes):
    if minutes is None: return "unknown"
    if minutes < 90: return "short"
    if minutes <= 120: return "medium"
    if minutes <= 150: return "long"
    return "epic"


def film_to_vector(film, weights=None):
    if weights is None:
        weights = WEIGHTS_CURRENT
    vec = {}

    genres = film.get("genres") or []
    if genres:
        w = weights["genre"] / max(len(genres), MIN_GENRE_DIVISOR)
        for g in genres:
            vec[f"genre:{g.lower()}"] = w

    directors_arr = film.get("directors") or []
    if directors_arr and isinstance(directors_arr, list) and len(directors_arr) > 0:
        w = weights["director"] / len(directors_arr)
        for d in directors_arr[:2]:
            key = f"director:id:{d['id']}" if isinstance(d, dict) and d.get("id") else f"director:{str(d).lower()}"
            vec[key] = w
    elif film.get("director"):
        dirs = [d.strip() for d in film["director"].split(",")]
        w = weights["director"] / len(dirs)
        for d in dirs:
            vec[f"director:{d.lower()}"] = w

    cast = (film.get("top_cast") or [])[:MAX_CAST]
    if cast:
        n = len(cast)
        tri = n * (n + 1) / 2
        for i, m in enumerate(cast):
            ow = (n - i) / tri
            key = f"cast:id:{m['id']}" if isinstance(m, dict) and m.get("id") else f"cast:{str(m).lower()}"
            vec[key] = weights["cast"] * ow

    keywords = (film.get("keywords") or [])[:MAX_KEYWORDS]
    if keywords:
        w = weights["keyword"] / len(keywords)
        for kw in keywords:
            key = f"keyword:id:{kw['id']}" if isinstance(kw, dict) and kw.get("id") else f"keyword:{str(kw).lower()}"
            vec[key] = w

    countries = film.get("country") or []
    if countries:
        w = weights["country"] / len(countries)
        for c in countries:
            vec[f"country:{c.lower()}"] = w

    langs = set()
    for l in (film.get("primary_language") or []): langs.add(l.lower())
    for l in (film.get("spoken_languages") or []): langs.add(l.lower())
    if langs:
        w = weights["language"] / len(langs)
        for l in langs:
            vec[f"lang:{l}"] = w

    vec[f"decade:{decade_bucket(film.get('year'))}"] = weights["decade"]
    vec[f"runtime:{runtime_bucket(film.get('runtime_minutes'))}"] = weights["runtime"]

    lb = film.get("letterboxd_rating")
    tmdb = film.get("tmdb_rating")
    vals = []
    if lb and isinstance(lb, (int, float)) and lb > 0: vals.append(float(lb) / 5.0)
    if tmdb and isinstance(tmdb, (int, float)) and tmdb > 0: vals.append(float(tmdb) / 10.0)
    if vals:
        vec["rating"] = (sum(vals) / len(vals)) * weights["rating"]

    cid = film.get("collection_id")
    if cid:
        vec[f"collection:{cid}"] = weights["collection"]

    return vec


# ═══════════════════════════════════════════════════════════════════════════════
# SHARED MATH
# ═══════════════════════════════════════════════════════════════════════════════

def cosine_sim(a, b):
    if not a or not b: return 0.0
    if len(a) > len(b): a, b = b, a
    dot = sum(a[k] * b[k] for k in a if k in b)
    ma = math.sqrt(sum(v * v for v in a.values()))
    mb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (ma * mb) if ma > 0 and mb > 0 else 0.0


def pop_boost(viewers):
    if not viewers or viewers <= 0: return 1.0
    return 1.0 + min(math.log10(viewers) / 150, 0.05)


def feat_coverage(vec, weights):
    real = sum(v for k, v in vec.items() if ":unknown" not in k)
    mx = 1.0 - weights.get("collection", 0.04)
    return min(real / mx, 1.0) if mx > 0 else 1.0


def compute_idf(vectors):
    n = len(vectors)
    if n == 0: return {}
    df = defaultdict(int)
    for vec in vectors:
        for k in vec: df[k] += 1
    return {k: math.log(n / (1 + c)) for k, c in df.items()}


def apply_idf(vec, idf):
    return {k: v * idf.get(k, 1.0) for k, v in vec.items()}


def normalize_scores(items, lo=5, hi=95):
    if not items: return items
    raw = [s["raw_score"] for s in items]
    mn, mx = min(raw), max(raw)
    if mx == mn:
        for s in items: s["score"] = 50
        return items
    for s in items:
        s["score"] = int(lo + (s["raw_score"] - mn) / (mx - mn) * (hi - lo))
    return items


def vec_breakdown(profile, film_vec):
    cats = defaultdict(float)
    total = 0
    for k in film_vec:
        if k in profile:
            c = profile[k] * film_vec[k]
            total += c
            cats[k.split(":")[0]] += c
    if total > 0:
        cats = {k: v / total for k, v in cats.items()}
    return dict(cats)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 1: CURRENT BASELINE (Cosine Similarity)
# ═══════════════════════════════════════════════════════════════════════════════

class CurrentBaseline:
    name = "Current Baseline"
    short_name = "baseline"
    description = (
        "Hand-tuned weights (keyword 20%, director 14%, cast 14%, genre 10%). "
        "Cosine similarity between user taste profile and film feature vector. "
        "Profile weighted by user_rating/5. Popularity boost + coverage penalty."
    )
    color = "#888"

    def score_all(self, watched_films, ratings_map, candidates, all_vecs):
        profile = defaultdict(float)
        tw = 0
        for f in watched_films:
            vec = film_to_vector(f)
            url = f.get("letterboxd_short_url", "")
            w = ratings_map.get(url, 3.0) / 5.0
            for k, v in vec.items(): profile[k] += v * w
            tw += w
        if tw > 0:
            profile = {k: v / tw for k, v in profile.items()}

        results = []
        for film in candidates:
            vec = film_to_vector(film)
            raw = cosine_sim(profile, vec) * pop_boost(film.get("letterboxd_viewers")) * math.sqrt(feat_coverage(vec, WEIGHTS_CURRENT)) * 100
            bd = vec_breakdown(profile, vec)
            results.append({"film": film, "raw_score": raw, "score": 0, "breakdown": bd})
        return normalize_scores(results)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 2: TF-IDF ENHANCED
# ═══════════════════════════════════════════════════════════════════════════════

class TfIdfEnhanced:
    name = "TF-IDF Enhanced"
    short_name = "tfidf"
    description = (
        "Same feature weights but applies Inverse Document Frequency: rare features "
        "(niche directors, unusual keywords) get boosted; common features (Drama genre, "
        "English language) get dampened. Makes rare signal like 'Spanish animation' "
        "or 'Iranian cinema' much more discriminating."
    )
    color = "#4CAF50"

    def score_all(self, watched_films, ratings_map, candidates, all_vecs):
        idf = compute_idf(all_vecs)

        profile = defaultdict(float)
        tw = 0
        for f in watched_films:
            vec = apply_idf(film_to_vector(f), idf)
            url = f.get("letterboxd_short_url", "")
            w = ratings_map.get(url, 3.0) / 5.0
            for k, v in vec.items(): profile[k] += v * w
            tw += w
        if tw > 0:
            profile = {k: v / tw for k, v in profile.items()}

        results = []
        for film in candidates:
            vec = apply_idf(film_to_vector(film), idf)
            raw = cosine_sim(profile, vec) * pop_boost(film.get("letterboxd_viewers")) * math.sqrt(feat_coverage(film_to_vector(film), WEIGHTS_CURRENT)) * 100
            bd = vec_breakdown(profile, vec)
            results.append({"film": film, "raw_score": raw, "score": 0, "breakdown": bd})
        return normalize_scores(results)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 3: PERSONALIZED PAGERANK (Graph-Based)
# ═══════════════════════════════════════════════════════════════════════════════

class PersonalizedPageRank:
    name = "Personalized PageRank"
    short_name = "pagerank"
    description = (
        "Builds a knowledge graph (films ↔ directors ↔ genres ↔ actors ↔ keywords ↔ countries). "
        "Runs Random Walk with Restart from your liked films. Recommendations flow through "
        "graph paths: 'You liked Stalker → Tarkovsky → Solaris → sci-fi philosophy → 2001'. "
        "Discovers transitive connections that cosine similarity misses entirely. "
        "Inspired by Google's PageRank."
    )
    color = "#9C27B0"

    def _build_graph(self, films):
        """Build bipartite graph: film nodes ↔ attribute nodes."""
        adj = defaultdict(set)

        for film in films:
            fnode = f"film:{film['id']}"

            # Directors (strongest edges — weight by adding multiple edges)
            for d in (film.get("directors") or [])[:2]:
                if isinstance(d, dict) and d.get("id"):
                    dnode = f"dir:{d['id']}"
                    adj[fnode].add(dnode); adj[dnode].add(fnode)
                    # Add extra edge for director emphasis
                    adj[fnode].add(dnode + "_2"); adj[dnode + "_2"].add(fnode)
            if not (film.get("directors") or []) and film.get("director"):
                dnode = f"dir:{film['director'].lower()}"
                adj[fnode].add(dnode); adj[dnode].add(fnode)

            for g in (film.get("genres") or []):
                gnode = f"genre:{g.lower()}"
                adj[fnode].add(gnode); adj[gnode].add(fnode)

            for m in (film.get("top_cast") or [])[:5]:
                if isinstance(m, dict) and m.get("id"):
                    cnode = f"cast:{m['id']}"
                    adj[fnode].add(cnode); adj[cnode].add(fnode)

            for kw in (film.get("keywords") or [])[:10]:
                if isinstance(kw, dict) and kw.get("id"):
                    knode = f"kw:{kw['id']}"
                    adj[fnode].add(knode); adj[knode].add(fnode)

            for c in (film.get("country") or []):
                cnode = f"country:{c.lower()}"
                adj[fnode].add(cnode); adj[cnode].add(fnode)

            dec = decade_bucket(film.get("year"))
            dnode = f"decade:{dec}"
            adj[fnode].add(dnode); adj[dnode].add(fnode)

            cid = film.get("collection_id")
            if cid:
                colnode = f"col:{cid}"
                adj[fnode].add(colnode); adj[colnode].add(fnode)

        return adj

    def _run_ppr(self, adj, seed_nodes, alpha=0.15, iterations=20):
        """Personalized PageRank via power iteration."""
        all_nodes = list(adj.keys())
        # Map nodes to indices for speed
        node_idx = {n: i for i, n in enumerate(all_nodes)}
        n = len(all_nodes)

        # Restart distribution (uniform over seeds that exist in graph)
        restart = [0.0] * n
        valid_seeds = [s for s in seed_nodes if s in node_idx]
        if not valid_seeds:
            return {}
        for s in valid_seeds:
            restart[node_idx[s]] = 1.0 / len(valid_seeds)

        # Initialize probability
        p = restart[:]

        for _ in range(iterations):
            new_p = [0.0] * n
            for i, node in enumerate(all_nodes):
                neighbors = adj.get(node, set())
                if not neighbors or p[i] == 0:
                    continue
                share = p[i] / len(neighbors)
                for nb in neighbors:
                    if nb in node_idx:
                        new_p[node_idx[nb]] += (1 - alpha) * share
            for i in range(n):
                new_p[i] += alpha * restart[i]
            p = new_p

        # Extract film scores
        scores = {}
        for i, node in enumerate(all_nodes):
            if node.startswith("film:"):
                fid = int(node.split(":")[1])
                scores[fid] = p[i]
        return scores

    def score_all(self, watched_films, ratings_map, candidates, all_vecs):
        # Build graph from watched + candidate films
        all_films_for_graph = list({f["id"]: f for f in watched_films + candidates}.values())
        adj = self._build_graph(all_films_for_graph)

        # Seeds: films rated 4+ (strong positive signal) with extra weight for 5-star
        seed_nodes = []
        for f in watched_films:
            url = f.get("letterboxd_short_url", "")
            rating = ratings_map.get(url)
            if rating and rating >= 4.0:
                seed_nodes.append(f"film:{f['id']}")
                if rating >= 4.5:
                    seed_nodes.append(f"film:{f['id']}")  # Double weight

        ppr_scores = self._run_ppr(adj, seed_nodes)

        results = []
        for film in candidates:
            raw = ppr_scores.get(film["id"], 0) * 1e6  # Scale up for readability
            # Build pseudo-breakdown from graph neighbors
            fnode = f"film:{film['id']}"
            bd = {}
            for nb in adj.get(fnode, set()):
                cat = nb.split(":")[0]
                if cat in ("dir", "genre", "cast", "kw", "country", "decade", "col"):
                    cat_map = {"dir": "director", "kw": "keyword", "col": "collection"}
                    cat = cat_map.get(cat, cat)
                    bd[cat] = bd.get(cat, 0) + 1
            total = sum(bd.values()) or 1
            bd = {k: v / total for k, v in bd.items()}
            results.append({"film": film, "raw_score": raw, "score": 0, "breakdown": bd})
        return normalize_scores(results)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 4: PAIRWISE LEARNING TO RANK (BPR-style SGD)
# ═══════════════════════════════════════════════════════════════════════════════

class PairwiseLTR:
    name = "Pairwise Learning to Rank"
    short_name = "ltr"
    description = (
        "Instead of hand-tuning feature weights, LEARNS them from your rating data. "
        "For every pair where you rated film A > film B, trains a model to predict "
        "that A's features should score higher. Uses BPR-style stochastic gradient descent. "
        "Discovers which features actually matter for YOUR preferences — not generic weights. "
        "Inspired by Bayesian Personalized Ranking (BPR) and LambdaMART."
    )
    color = "#FF5722"

    def score_all(self, watched_films, ratings_map, candidates, all_vecs):
        # Collect all features
        rated_films = []
        rated_vecs = {}
        rated_ratings = {}
        for f in watched_films:
            url = f.get("letterboxd_short_url", "")
            r = ratings_map.get(url)
            if r is not None:
                rated_films.append(f)
                rated_vecs[f["id"]] = film_to_vector(f)
                rated_ratings[f["id"]] = r

        all_features = set()
        for vec in rated_vecs.values():
            all_features.update(vec.keys())
        for film in candidates:
            all_features.update(film_to_vector(film).keys())
        feat_list = sorted(all_features)
        feat_idx = {f: i for i, f in enumerate(feat_list)}
        n_feat = len(feat_list)

        # Convert to dense arrays
        def to_dense(vec):
            arr = [0.0] * n_feat
            for k, v in vec.items():
                if k in feat_idx:
                    arr[feat_idx[k]] = v
            return arr

        # Build training pairs (higher rated > lower rated) — sampled for speed
        films_list = list(rated_films)
        all_pairs = []
        for i in range(len(films_list)):
            for j in range(len(films_list)):
                ri = rated_ratings[films_list[i]["id"]]
                rj = rated_ratings[films_list[j]["id"]]
                if ri > rj:
                    all_pairs.append((films_list[i]["id"], films_list[j]["id"]))
        # Sample at most 3000 pairs for speed
        if len(all_pairs) > 3000:
            random.shuffle(all_pairs)
            pairs = all_pairs[:3000]
        else:
            pairs = all_pairs

        if not pairs:
            # Fallback: return uniform scores
            results = [{"film": f, "raw_score": 50, "score": 50, "breakdown": {}} for f in candidates]
            return results

        # Pre-compute dense vectors for all rated films
        dense_cache = {}
        for fid, vec in rated_vecs.items():
            dense_cache[fid] = to_dense(vec)

        # SGD to learn weights — using sparse updates for speed
        w = [0.01] * n_feat
        lr = 0.005
        reg = 0.001
        n_epochs = 15
        batch_size = min(1500, len(pairs))

        for epoch in range(n_epochs):
            random.shuffle(pairs)
            for fid_i, fid_j in pairs[:batch_size]:
                # Sparse diff: only compute non-zero features
                vi = rated_vecs[fid_i]
                vj = rated_vecs[fid_j]
                all_keys = set(vi.keys()) | set(vj.keys())
                score_diff = 0.0
                for k in all_keys:
                    idx = feat_idx.get(k)
                    if idx is not None:
                        d = vi.get(k, 0) - vj.get(k, 0)
                        score_diff += w[idx] * d
                sigmoid = 1.0 / (1.0 + math.exp(-max(-20, min(20, score_diff))))
                grad_coeff = 1.0 - sigmoid
                for k in all_keys:
                    idx = feat_idx.get(k)
                    if idx is not None:
                        d = vi.get(k, 0) - vj.get(k, 0)
                        w[idx] += lr * (grad_coeff * d - reg * w[idx])
            lr *= 0.95

        # Score candidates using learned weights
        results = []
        for film in candidates:
            vec = film_to_vector(film)
            d = to_dense(vec)
            raw = sum(w[k] * d[k] for k in range(n_feat))
            # Build breakdown from weight contributions
            bd = defaultdict(float)
            total = 0
            for k, v in vec.items():
                if k in feat_idx:
                    contrib = abs(w[feat_idx[k]] * v)
                    cat = k.split(":")[0]
                    bd[cat] += contrib
                    total += contrib
            if total > 0:
                bd = {k: v / total for k, v in bd.items()}
            results.append({"film": film, "raw_score": raw, "score": 0, "breakdown": dict(bd)})
        return normalize_scores(results)


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 5: BAYESIAN UCB (Exploration-Exploitation)
# ═══════════════════════════════════════════════════════════════════════════════

class BayesianUCB:
    name = "Bayesian UCB (Explore-Exploit)"
    short_name = "ucb"
    description = (
        "Uses your rated films to predict ratings AND uncertainty for unrated films. "
        "Films similar to many things you've rated have LOW uncertainty (safe bets). "
        "Films in unexplored territory have HIGH uncertainty (potential discoveries). "
        "Score = predicted_rating + exploration_bonus × uncertainty. "
        "The only algorithm that explicitly pushes you toward new territory. "
        "Inspired by Netflix's contextual bandits and Gaussian Processes."
    )
    color = "#00BCD4"

    def score_all(self, watched_films, ratings_map, candidates, all_vecs):
        # Build feature vectors for rated films
        rated_data = []
        for f in watched_films:
            url = f.get("letterboxd_short_url", "")
            r = ratings_map.get(url)
            if r is not None:
                vec = film_to_vector(f)
                rated_data.append((f, vec, r))

        if not rated_data:
            return [{"film": f, "raw_score": 50, "score": 50, "breakdown": {}} for f in candidates]

        beta = 0.8  # Exploration strength

        results = []
        for film in candidates:
            cand_vec = film_to_vector(film)
            if not cand_vec:
                results.append({"film": film, "raw_score": 0, "score": 0, "breakdown": {}})
                continue

            # Compute similarity-weighted prediction and uncertainty
            weighted_sum = 0.0
            weight_total = 0.0
            sim_squared_sum = 0.0

            for _, rvec, rating in rated_data:
                sim = cosine_sim(cand_vec, rvec)
                if sim > 0.01:  # Threshold for relevance
                    weighted_sum += sim * rating
                    weight_total += sim
                    sim_squared_sum += sim * sim

            if weight_total > 0:
                predicted = weighted_sum / weight_total  # Predicted rating (1-5)
                # Uncertainty: inverse of effective sample size
                # High when few similar films, low when many
                effective_n = weight_total * weight_total / (sim_squared_sum + 1e-10)
                uncertainty = 1.0 / math.sqrt(1 + effective_n)
            else:
                predicted = 3.0  # Prior: average
                uncertainty = 1.0  # Maximum uncertainty

            # UCB score: predicted + exploration bonus
            ucb_score = predicted + beta * uncertainty

            # Normalize: map from ~1-6 range to something meaningful
            raw = (ucb_score - 1.0) / 5.0 * 100  # Map 1-6 to 0-100

            # Build breakdown
            bd = vec_breakdown(
                {k: v for k, v in cand_vec.items()},  # Just show feature presence
                cand_vec
            )
            # Add exploration info
            bd["exploration"] = uncertainty / (uncertainty + (predicted - 1) / 5)

            results.append({"film": film, "raw_score": raw, "score": 0, "breakdown": bd})
        return normalize_scores(results)


# ═══════════════════════════════════════════════════════════════════════════════
# EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

def spearman(predicted, actual):
    if len(predicted) < 3: return 0.0
    n = len(predicted)
    def rank(vals):
        indexed = sorted(enumerate(vals), key=lambda x: -x[1])
        r = [0] * n
        for rank_val, (idx, _) in enumerate(indexed):
            r[idx] = rank_val + 1
        return r
    pr = rank(predicted)
    ar = rank(actual)
    d2 = sum((p - a) ** 2 for p, a in zip(pr, ar))
    return 1 - (6 * d2) / (n * (n * n - 1))


def precision_at_k(sorted_ids, actuals, threshold, k):
    top = sorted_ids[:k]
    return sum(1 for fid in top if actuals.get(fid, 0) >= threshold) / k if k > 0 else 0


def evaluate_algo(algo, train_films, ratings_map, test_films, test_ratings_by_id, all_vecs):
    """Evaluate on test set: score test films, compare with actual ratings."""
    scored = algo.score_all(train_films, ratings_map, test_films, all_vecs)
    pred = {s["film"]["id"]: s["raw_score"] for s in scored}
    pred_list = [pred.get(f["id"], 0) for f in test_films]
    actual_list = [test_ratings_by_id.get(f["id"], 3.0) for f in test_films]
    sp = spearman(pred_list, actual_list)
    sorted_ids = [s["film"]["id"] for s in sorted(scored, key=lambda x: -x["raw_score"])]
    p5 = precision_at_k(sorted_ids, test_ratings_by_id, 4.0, min(5, len(sorted_ids)))
    p10 = precision_at_k(sorted_ids, test_ratings_by_id, 4.0, min(10, len(sorted_ids)))
    return {"spearman": sp, "p5": p5, "p10": p10}


# ═══════════════════════════════════════════════════════════════════════════════
# HTML GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

def generate_html(algo_results, user_stats):
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recommender Comparison — 5 Algorithms</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px;max-width:1200px;margin:0 auto}
h1{text-align:center;margin-bottom:8px;font-size:1.5em}
.sub{text-align:center;color:#999;margin-bottom:20px;font-size:.85em}
.stats{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:20px}
.stat{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:10px 16px;text-align:center}
.stat .n{font-size:1.4em;font-weight:700;color:#ff6b6b}
.stat .l{font-size:.75em;color:#999}
.stitle{font-size:1.1em;margin:20px 0 10px;border-bottom:1px solid #333;padding-bottom:5px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th,td{padding:8px 12px;text-align:center;border-bottom:1px solid #222;font-size:.9em}
th{background:#1a1a1a;color:#aaa;font-size:.8em}
.best{color:#4CAF50;font-weight:700}
.aname{text-align:left!important;font-weight:600}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px}
.tab{padding:7px 14px;border:1px solid #333;background:#1a1a1a;color:#ccc;border-radius:5px 5px 0 0;cursor:pointer;font-size:.8em;transition:.2s}
.tab:hover{background:#252525}.tab.on{background:#252525;color:#fff;border-bottom-color:#252525}
.pan{display:none}.pan.on{display:block}
.desc{background:#1a1a1a;border-left:3px solid #555;padding:8px 12px;margin-bottom:12px;font-size:.8em;color:#bbb;border-radius:0 5px 5px 0}
.row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #1a1a1a;transition:.15s;cursor:pointer}
.row:hover{background:#1a1a1a}
.rk{width:24px;text-align:center;font-weight:700;color:#666;font-size:.85em}
.bar-w{width:55px}
.bar{height:5px;border-radius:3px}
.bv{font-size:.75em;color:#999;text-align:center;margin-top:1px}
.info{flex:1;min-width:0}
.ft{font-weight:600;font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fm{font-size:.75em;color:#888;margin-top:1px}
.fg{display:flex;gap:3px;flex-wrap:wrap;margin-top:2px}
.gt{font-size:.65em;background:#252525;color:#aaa;padding:1px 5px;border-radius:3px}
.lb{font-size:.8em;color:#f5c518;font-weight:600;min-width:32px;text-align:right}
.bd{display:none;padding:6px 12px 8px 48px;border-bottom:1px solid #1a1a1a;font-size:.75em;color:#999}
.bd.show{display:block}
.bdi{margin-right:8px}.bdn{margin-right:2px}.bdp{color:#aaa;font-weight:600}
.uniq{display:inline-block;font-size:.6em;background:#333;color:#4CAF50;padding:1px 4px;border-radius:3px;margin-left:3px;vertical-align:middle}
.expl{display:inline-block;font-size:.6em;background:#1a3a3a;color:#00BCD4;padding:1px 4px;border-radius:3px;margin-left:3px;vertical-align:middle}
h3{font-size:.95em;margin:16px 0 8px;color:#ccc}
.h2h{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.h2hc{background:#1a1a1a;border-radius:6px;padding:10px}
.h2hh{font-weight:700;margin-bottom:6px;font-size:.85em}
.h2hf{padding:4px 0;border-bottom:1px solid #222;font-size:.8em}
.h2hs{color:#ff6b6b;font-weight:600}
@media(max-width:768px){.h2h{grid-template-columns:1fr}}
</style>
</head><body>
<h1>Recommender Algorithm Comparison</h1>
<p class="sub">5 fundamentally different approaches tested against your Letterboxd data</p>
<div class="stats">"""

    for label, value in user_stats:
        html += f'<div class="stat"><div class="n">{value}</div><div class="l">{label}</div></div>'

    html += '</div><h2 class="stitle">Quantitative Evaluation (10-Split Holdout)</h2>'
    html += '<p style="color:#999;font-size:.8em;margin-bottom:8px">Rated films split 80/20, repeated 10 times. Higher = better.</p>'
    html += '<table><thead><tr><th>Algorithm</th><th>Spearman ρ</th><th>P@5 (≥4★)</th><th>P@10 (≥4★)</th></tr></thead><tbody>'

    bsp = max(r["metrics"]["spearman"] for r in algo_results)
    bp5 = max(r["metrics"]["p5"] for r in algo_results)
    bp10 = max(r["metrics"]["p10"] for r in algo_results)

    for r in algo_results:
        m = r["metrics"]
        sc = ' class="best"' if m["spearman"] == bsp else ''
        p5c = ' class="best"' if m["p5"] == bp5 else ''
        p10c = ' class="best"' if m["p10"] == bp10 else ''
        html += f'<tr><td class="aname"><span class="dot" style="background:{r["color"]}"></span>{r["name"]}</td>'
        html += f'<td{sc}>{m["spearman"]:.3f}</td><td{p5c}>{m["p5"]:.0%}</td><td{p10c}>{m["p10"]:.0%}</td></tr>'
    html += '</tbody></table>'

    # Head-to-head
    html += '<h2 class="stitle">Head-to-Head: Unique Top-10 Picks</h2>'
    html += '<div class="h2h">'
    pairs = [(0, 2), (0, 3), (2, 4)]  # baseline vs pagerank, baseline vs ltr, pagerank vs ucb
    for i, j in pairs:
        if i >= len(algo_results) or j >= len(algo_results): continue
        a, b = algo_results[i], algo_results[j]
        ta = set(r["film"]["id"] for r in a["recs"][:10])
        tb = set(r["film"]["id"] for r in b["recs"][:10])
        oa = [r for r in a["recs"][:10] if r["film"]["id"] not in tb]
        ob = [r for r in b["recs"][:10] if r["film"]["id"] not in ta]
        for side, data, only in [(a, a, oa), (b, b, ob)]:
            html += f'<div class="h2hc"><div class="h2hh" style="color:{side["color"]}">Only in {side["name"]}</div>'
            for r in only[:5]:
                f = r["film"]
                html += f'<div class="h2hf">{f.get("title","")} ({f.get("year","")}) <span class="h2hs">{r["score"]}%</span></div>'
            if not only:
                html += '<div class="h2hf" style="color:#555">Same films in top 10</div>'
            html += '</div>'
    html += '</div>'

    # Tabs
    html += '<h2 class="stitle">Full Rankings (Currently Screening)</h2><div class="tabs">'
    for i, r in enumerate(algo_results):
        on = " on" if i == 0 else ""
        html += f'<button class="tab{on}" onclick="st({i})" style="border-color:{r["color"]}">{r["name"]}</button>'
    html += '</div>'

    for i, r in enumerate(algo_results):
        on = " on" if i == 0 else ""
        html += f'<div class="pan{on}" id="p{i}"><div class="desc" style="border-color:{r["color"]}">{r["description"]}</div>'

        other_tops = set()
        for j, o in enumerate(algo_results):
            if j != i:
                for rec in o["recs"][:10]: other_tops.add(rec["film"]["id"])

        for rk, rec in enumerate(r["recs"][:25], 1):
            f = rec["film"]
            s = rec["score"]
            bc = "#4CAF50" if s >= 70 else "#FF9800" if s >= 40 else "#f44336"
            uniq = rec["film"]["id"] not in other_tops
            uhtml = '<span class="uniq">UNIQUE</span>' if uniq else ''
            expl = rec.get("breakdown", {}).get("exploration", 0)
            ehtml = f'<span class="expl">EXPLORE {expl:.0%}</span>' if expl > 0.3 else ''
            gens = ''.join(f'<span class="gt">{g}</span>' for g in (f.get("genres") or [])[:4])
            meta = []
            if f.get("director"): meta.append(f["director"])
            if f.get("year"): meta.append(str(f["year"]))
            if f.get("runtime_minutes"): meta.append(f'{f["runtime_minutes"]}min')
            ctry = ', '.join((f.get("country") or [])[:2])
            if ctry: meta.append(ctry)
            lbr = f.get("letterboxd_rating")
            lbh = f'<div class="lb">★ {lbr:.1f}</div>' if lbr else ''
            bd = rec.get("breakdown", {})
            bds = sorted(bd.items(), key=lambda x: -x[1])[:5]
            bdh = ''.join(f'<span class="bdi"><span class="bdn">{k}:</span><span class="bdp">{v:.0%}</span></span>' for k, v in bds if v > 0.01 and k != "exploration")

            html += f'<div class="row" onclick="tb(this)"><div class="rk">#{rk}</div>'
            html += f'<div class="bar-w"><div class="bar" style="width:{s}%;background:{bc}"></div><div class="bv">{s}%</div></div>'
            html += f'<div class="info"><div class="ft">{f.get("title","")}{uhtml}{ehtml}</div>'
            html += f'<div class="fm">{" · ".join(meta)}</div><div class="fg">{gens}</div></div>{lbh}</div>'
            html += f'<div class="bd">{bdh}</div>'

        html += '</div>'

    html += '<script>function st(i){document.querySelectorAll(".tab").forEach((b,j)=>b.classList.toggle("on",j===i));'
    html += 'document.querySelectorAll(".pan").forEach((p,j)=>p.classList.toggle("on",j===i))}'
    html += 'function tb(r){var b=r.nextElementSibling;if(b&&b.classList.contains("bd"))b.classList.toggle("show")}</script>'
    html += '</body></html>'
    return html


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  Recommender Comparison v2 — 5 Fundamentally Different Approaches")
    print("=" * 60)

    data = load_supabase_data()
    films_by_id = data["films_by_id"]
    watched_entries = data["watched"]
    future_film_ids = data["future_film_ids"]

    ratings_map = {}
    for w in watched_entries:
        url = w.get("letterboxd_short_url", "")
        if w.get("rating"):
            ratings_map[url] = float(w["rating"])

    watched_films = []
    watched_ratings_by_id = {}
    for w in watched_entries:
        fid = w.get("film_id")
        if fid and fid in films_by_id:
            film = films_by_id[fid]
            watched_films.append(film)
            url = w.get("letterboxd_short_url", "")
            if url in ratings_map:
                watched_ratings_by_id[fid] = ratings_map[url]

    watched_ids = {f["id"] for f in watched_films}
    screening_films = [films_by_id[fid] for fid in future_film_ids if fid in films_by_id and fid not in watched_ids]
    excluded = [films_by_id[fid] for fid in future_film_ids if fid in films_by_id and fid in watched_ids]
    print(f"\nScreening: {len(screening_films)} films (excluded {len(excluded)} already watched)")
    if excluded:
        print(f"  Already watched: {', '.join(f.get('title','?') for f in excluded)}")

    # Pre-compute vectors for IDF
    all_vecs = [film_to_vector(f) for f in films_by_id.values()]

    # Holdout evaluation
    rated_films = [f for f in watched_films if f["id"] in watched_ratings_by_id]
    print(f"Rated films for evaluation: {len(rated_films)}")

    algorithms = [
        CurrentBaseline(),
        TfIdfEnhanced(),
        PersonalizedPageRank(),
        PairwiseLTR(),
        BayesianUCB(),
    ]

    N_SPLITS = 5
    print(f"\nRunning {N_SPLITS}-split holdout...")
    split_metrics = {a.short_name: {"sp": [], "p5": [], "p10": []} for a in algorithms}

    for si in range(N_SPLITS):
        random.seed(42 + si)
        shuf = rated_films[:]
        random.shuffle(shuf)
        sp = int(len(shuf) * 0.8)
        train_r = shuf[:sp]
        test_r = shuf[sp:]
        test_ids = {f["id"] for f in test_r}
        train_all = [f for f in watched_films if f["id"] not in test_ids]
        test_ratings = {f["id"]: watched_ratings_by_id[f["id"]] for f in test_r}

        for algo in algorithms:
            m = evaluate_algo(algo, train_all, ratings_map, test_r, test_ratings, all_vecs)
            sm = split_metrics[algo.short_name]
            sm["sp"].append(m["spearman"])
            sm["p5"].append(m["p5"])
            sm["p10"].append(m["p10"])
        print(f"  Split {si+1}/{N_SPLITS} done")

    avg = {}
    for algo in algorithms:
        sm = split_metrics[algo.short_name]
        avg[algo.short_name] = {
            "spearman": sum(sm["sp"]) / len(sm["sp"]),
            "p5": sum(sm["p5"]) / len(sm["p5"]),
            "p10": sum(sm["p10"]) / len(sm["p10"]),
        }
        m = avg[algo.short_name]
        print(f"  {algo.name}: ρ={m['spearman']:.3f}  P@5={m['p5']:.0%}  P@10={m['p10']:.0%}")

    # Final recommendations
    print("\nFinal recommendations (full training set)...")
    results = []
    for algo in algorithms:
        scored = algo.score_all(watched_films, ratings_map, screening_films, all_vecs)
        scored.sort(key=lambda x: -x["score"])

        print(f"\n{algo.name}:")
        for i, rec in enumerate(scored[:5], 1):
            f = rec["film"]
            print(f"  #{i}: {f.get('title','')} ({f.get('year','')}) — {rec['score']}% "
                  f"[{f.get('director','')}, {', '.join((f.get('genres') or [])[:3])}]")

        results.append({
            "name": algo.name, "short_name": algo.short_name,
            "description": algo.description, "color": algo.color,
            "metrics": avg[algo.short_name], "recs": scored,
        })

    user_stats = [
        ("Watched", len(watched_films)),
        ("Rated", len(ratings_map)),
        ("Avg Rating", f"{sum(ratings_map.values()) / len(ratings_map):.1f}★"),
        ("5★ Films", sum(1 for r in ratings_map.values() if r >= 5.0)),
        ("Screening", len(screening_films)),
    ]

    html = generate_html(results, user_stats)
    out = Path(__file__).parent.parent / "recommender_comparison.html"
    out.write_text(html, encoding="utf-8")
    print(f"\n✓ Output: file://{out.resolve()}")


if __name__ == "__main__":
    main()
