#!/usr/bin/env python3
"""
Interactive debugger for the film recommendation scoring system.

Connects to Supabase and lets you inspect:
  - User taste profiles (what features they prefer)
  - Film feature vectors (how a film is encoded)
  - Score breakdowns (why a film got a particular score)
  - Side-by-side film comparisons
  - Top/bottom scored films with explanations

Setup:
    pip install supabase python-dotenv

Usage:
    python scripts/debug_scores.py                  # interactive mode
    python scripts/debug_scores.py profile           # show user profile
    python scripts/debug_scores.py film <id>         # show film vector
    python scripts/debug_scores.py score <film_id>   # score breakdown
    python scripts/debug_scores.py compare <id1> <id2>  # compare two films
    python scripts/debug_scores.py top [N]           # top N scored films
    python scripts/debug_scores.py bottom [N]        # bottom N scored films
    python scripts/debug_scores.py search <query>    # find film by title

Options:
    --user-id UUID   Override the user (default: first user found)
"""

import argparse
import math
import os
import sys
from collections import defaultdict

try:
    from dotenv import load_dotenv
except ImportError:
    print("Install python-dotenv:  pip install python-dotenv")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Install supabase-py:  pip install supabase")
    sys.exit(1)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# ── Weights & constants (must match recommender.ts) ──────────────────────────

WEIGHTS = {
    "genre":      0.12,
    "director":   0.14,
    "cast":       0.14,
    "keyword":    0.25,
    "country":    0.08,
    "language":   0.06,
    "decade":     0.03,
    "company":    0.06,
    "collection": 0.04,
    "runtime":    0.02,
    "rating":     0.06,
}

MAX_CAST = 5
MAX_KEYWORDS = 10
MAX_COMPANIES = 3
MIN_GENRE_DIVISOR = 3

FILM_SELECT = "id, title, year, genres, director, directors, top_cast, keywords, production_companies, country, primary_language, spoken_languages, runtime_minutes, letterboxd_rating, tmdb_rating, tmdb_votes, letterboxd_viewers, collection_id"

# ── Terminal colors ──────────────────────────────────────────────────────────

class C:
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    RESET = "\033[0m"

    @staticmethod
    def bar(value, max_value, width=30, color=GREEN):
        filled = int(round(value / max(max_value, 1e-9) * width))
        filled = min(filled, width)
        return f"{color}{'█' * filled}{C.DIM}{'░' * (width - filled)}{C.RESET}"

# ── Feature extraction (mirrors recommender.ts) ─────────────────────────────

def get_decade_bucket(year):
    if year is None:
        return "decade:unknown"
    if year < 1960:
        return "decade:pre-1960"
    decade = (year // 10) * 10
    return f"decade:{decade}s"

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

def film_to_vector(film):
    """Convert a film dict to a sparse feature vector (dict key→weight)."""
    vec = {}

    # Genres
    genres = film.get("genres") or []
    if genres:
        per = WEIGHTS["genre"] / max(len(genres), MIN_GENRE_DIVISOR)
        for g in genres:
            vec[f"genre:{g.lower()}"] = per

    # Directors
    dirs = film.get("directors") or []
    if dirs:
        per = WEIGHTS["director"] / len(dirs)
        for d in dirs:
            vec[f"director:{d['id']}"] = per
    elif film.get("director"):
        vec[f"director:{film['director'].lower()}"] = WEIGHTS["director"]

    # Cast (billing-order weighted)
    cast = (film.get("top_cast") or [])[:MAX_CAST]
    if cast:
        total_order = len(cast) * (len(cast) + 1) / 2
        for i, c in enumerate(cast):
            order_weight = (len(cast) - i) / total_order
            vec[f"cast:{c['id']}"] = WEIGHTS["cast"] * order_weight

    # Keywords
    kws = (film.get("keywords") or [])[:MAX_KEYWORDS]
    if kws:
        per = WEIGHTS["keyword"] / len(kws)
        for k in kws:
            vec[f"keyword:{k['id']}"] = per

    # Production companies
    companies = (film.get("production_companies") or [])[:MAX_COMPANIES]
    if companies:
        per = WEIGHTS["company"] / len(companies)
        for c in companies:
            vec[f"company:{c['id']}"] = per

    # Country
    countries = film.get("country") or []
    if countries:
        per = WEIGHTS["country"] / len(countries)
        for c in countries:
            vec[f"country:{c.lower()}"] = per

    # Languages (deduplicated)
    all_langs = set()
    for l in (film.get("primary_language") or []):
        all_langs.add(l.lower())
    for l in (film.get("spoken_languages") or []):
        all_langs.add(l.lower())
    if all_langs:
        per = WEIGHTS["language"] / len(all_langs)
        for l in all_langs:
            vec[f"lang:{l}"] = per

    # Decade
    vec[get_decade_bucket(film.get("year"))] = WEIGHTS["decade"]

    # Runtime
    vec[get_runtime_bucket(film.get("runtime_minutes"))] = WEIGHTS["runtime"]

    # Rating
    ratings = []
    if film.get("letterboxd_rating") is not None:
        ratings.append(film["letterboxd_rating"] / 5.0)
    if film.get("tmdb_rating") is not None:
        ratings.append(film["tmdb_rating"] / 10.0)
    if ratings:
        avg = sum(ratings) / len(ratings)
        vec["rating"] = avg * WEIGHTS["rating"]

    # Collection
    if film.get("collection_id") is not None:
        vec[f"collection:{film['collection_id']}"] = WEIGHTS["collection"]

    return vec

# ── Vector math ──────────────────────────────────────────────────────────────

def dot_product(a, b):
    total = 0
    smaller, larger = (a, b) if len(a) <= len(b) else (b, a)
    for k, v in smaller.items():
        if k in larger:
            total += v * larger[k]
    return total

def magnitude(v):
    return math.sqrt(sum(val * val for val in v.values()))

def cosine_similarity(a, b):
    mag_a, mag_b = magnitude(a), magnitude(b)
    if mag_a == 0 or mag_b == 0:
        return 0
    return dot_product(a, b) / (mag_a * mag_b)

def feature_coverage(vec):
    real_weight = sum(v for k, v in vec.items() if not k.endswith(":unknown"))
    max_expected = 1.0 - WEIGHTS["collection"]
    return min(real_weight / max_expected, 1.0)

def popularity_boost(viewers):
    if viewers is None or viewers <= 0:
        return 1.0
    log_v = math.log10(viewers)
    boost = min(log_v / 150, 0.05)
    return 1.0 + boost

# ── IDF weighting ────────────────────────────────────────────────────────────

def compute_corpus_idf(films):
    N = len(films)
    if N == 0:
        return {}
    df = {}
    for film in films:
        vec = film_to_vector(film)
        for key in vec:
            df[key] = df.get(key, 0) + 1
    # Penalty-only IDF: can only suppress (≤1), never amplify.
    # Features in all screened films are excluded (zero discriminating power).
    return {key: min(1.0, math.log(N / count)) for key, count in df.items() if count < N}

IDF_CATEGORIES = {"country", "lang", "runtime", "rating"}

def apply_idf(vec, idf):
    result = {}
    for k, v in vec.items():
        category = k.split(":")[0]
        if category in IDF_CATEGORIES:
            if k in idf:
                result[k] = v * idf[k]
        elif k in idf:
            result[k] = v
    return result

# ── Profile building ─────────────────────────────────────────────────────────

def build_profile(watched_films, user_ratings, url_map):
    profile = {}
    total_weight = 0

    for film in watched_films:
        vec = film_to_vector(film)
        short_url = url_map.get(film["id"])
        user_rating = user_ratings.get(short_url, 3.0) if short_url else 3.0
        weight = user_rating / 5.0

        for k, v in vec.items():
            profile[k] = profile.get(k, 0) + v * weight
        total_weight += weight

    if total_weight > 0:
        for k in profile:
            profile[k] /= total_weight

    return profile

# ── Score with full breakdown ────────────────────────────────────────────────

def score_film_breakdown(profile, film, idf=None):
    if not profile:
        return None

    film_vec = film_to_vector(film)
    profile_for_sim = apply_idf(profile, idf) if idf else profile
    film_vec_for_sim = apply_idf(film_vec, idf) if idf else film_vec

    sim = cosine_similarity(profile_for_sim, film_vec_for_sim)
    boost = popularity_boost(film.get("letterboxd_viewers"))
    cov = feature_coverage(film_vec)
    cov_penalty = math.sqrt(cov)
    raw_score = sim * boost * cov_penalty
    final_score = min(100, round(raw_score * 100))

    # Per-feature contributions in IDF-adjusted space (what actually drives the score)
    p_vec = profile_for_sim
    f_vec = film_vec_for_sim
    contributions = {}
    for key, film_val in f_vec.items():
        profile_val = p_vec.get(key, 0)
        if profile_val > 0:
            contributions[key] = profile_val * film_val

    # Group by category
    by_category = defaultdict(list)
    for key, contrib in contributions.items():
        cat = key.split(":")[0]
        by_category[cat].append((key, contrib))

    for cat in by_category:
        by_category[cat].sort(key=lambda x: -x[1])

    total_dot = sum(contributions.values())

    return {
        "score": final_score,
        "similarity": sim,
        "popularity_boost": boost,
        "coverage": cov,
        "coverage_penalty": cov_penalty,
        "total_dot_product": total_dot,
        "by_category": dict(by_category),
        "contributions": contributions,
        "film_vec": film_vec,
        "idf": idf or {},
    }

# ── Name resolution helpers ──────────────────────────────────────────────────

def resolve_feature_name(key, film=None):
    """Turn a feature key like 'cast:12345' into a human-readable name."""
    if film is None:
        return key

    prefix, _, val = key.partition(":")
    if prefix == "genre":
        return f"genre:{val}"
    elif prefix == "director":
        for d in (film.get("directors") or []):
            if str(d["id"]) == val:
                return f"director:{d['name']}"
        if film.get("director") and film["director"].lower() == val:
            return f"director:{film['director']}"
    elif prefix == "cast":
        for c in (film.get("top_cast") or []):
            if str(c["id"]) == val:
                return f"cast:{c['name']}"
    elif prefix == "keyword":
        for k in (film.get("keywords") or []):
            if str(k["id"]) == val:
                return f"keyword:{k['name']}"
    elif prefix == "company":
        for c in (film.get("production_companies") or []):
            if str(c["id"]) == val:
                return f"company:{c['name']}"
    return key

def resolve_feature_name_from_profile_films(key, watched_films):
    """Resolve a feature name by searching through all watched films."""
    prefix, _, val = key.partition(":")
    if prefix in ("genre", "country", "lang", "decade", "runtime") or not val:
        return key
    for film in watched_films:
        name = resolve_feature_name(key, film)
        if name != key:
            return name
    return key

# ── Display functions ────────────────────────────────────────────────────────

def print_header(text):
    print(f"\n{C.BOLD}{C.CYAN}{'─' * 60}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}  {text}{C.RESET}")
    print(f"{C.BOLD}{C.CYAN}{'─' * 60}{C.RESET}")

def print_subheader(text):
    print(f"\n{C.BOLD}{C.YELLOW}  {text}{C.RESET}")
    print(f"  {C.DIM}{'─' * 50}{C.RESET}")

def print_film_title(film):
    title = film.get("title", "Unknown")
    year = film.get("year", "?")
    fid = film.get("id", "?")
    print(f"  {C.BOLD}{title}{C.RESET} ({year})  {C.DIM}id={fid}{C.RESET}")

def show_film_vector(film):
    """Display a film's feature vector with all dimensions."""
    print_header(f"Film Feature Vector")
    print_film_title(film)

    vec = film_to_vector(film)
    cov = feature_coverage(vec)
    boost = popularity_boost(film.get("letterboxd_viewers"))

    print(f"\n  {C.DIM}Coverage:{C.RESET} {cov:.2%}  "
          f"{C.DIM}Pop. boost:{C.RESET} {boost:.4f}  "
          f"{C.DIM}Magnitude:{C.RESET} {magnitude(vec):.4f}")

    # Group by category
    by_cat = defaultdict(list)
    for k, v in vec.items():
        cat = k.split(":")[0]
        by_cat[cat].append((k, v))

    # Show each category
    max_val = max(vec.values()) if vec else 1
    for cat in sorted(by_cat.keys()):
        features = sorted(by_cat[cat], key=lambda x: -x[1])
        cat_total = sum(v for _, v in features)
        weight_budget = WEIGHTS.get(cat, 0)
        usage = cat_total / weight_budget if weight_budget > 0 else 0

        print(f"\n  {C.BOLD}{cat.upper()}{C.RESET}  "
              f"{C.DIM}budget={weight_budget:.2f}  used={cat_total:.4f} ({usage:.0%}){C.RESET}")

        for key, val in features:
            name = resolve_feature_name(key, film)
            bar = C.bar(val, max_val, width=25)
            print(f"    {bar} {val:.4f}  {name}")

def show_profile(profile, watched_films, user_ratings, url_map, top_n=30):
    """Display user taste profile: top features that define their preferences."""
    print_header("User Taste Profile")

    rated = sum(1 for v in user_ratings.values() if v is not None)
    avg_rating = sum(user_ratings.values()) / len(user_ratings) if user_ratings else 0
    print(f"  {C.DIM}Watched:{C.RESET} {len(watched_films)} films  "
          f"{C.DIM}Rated:{C.RESET} {rated}  "
          f"{C.DIM}Avg rating:{C.RESET} {avg_rating:.1f}  "
          f"{C.DIM}Profile dims:{C.RESET} {len(profile)}")

    # Top features overall
    print_subheader(f"Top {top_n} Profile Features (what you like)")
    sorted_features = sorted(profile.items(), key=lambda x: -x[1])[:top_n]
    max_val = sorted_features[0][1] if sorted_features else 1

    for key, val in sorted_features:
        name = resolve_feature_name_from_profile_films(key, watched_films)
        bar = C.bar(val, max_val, width=30)
        print(f"    {bar} {val:.5f}  {name}")

    # Category weight distribution
    print_subheader("Weight Distribution by Category")
    cat_totals = defaultdict(float)
    for k, v in profile.items():
        cat = k.split(":")[0]
        cat_totals[cat] += v

    total_weight = sum(cat_totals.values())
    sorted_cats = sorted(cat_totals.items(), key=lambda x: -x[1])
    max_cat = sorted_cats[0][1] if sorted_cats else 1

    for cat, val in sorted_cats:
        pct = val / total_weight * 100 if total_weight > 0 else 0
        bar = C.bar(val, max_cat, width=30, color=C.BLUE)
        print(f"    {bar} {pct:5.1f}%  {cat}")

    # Top features per category
    by_cat = defaultdict(list)
    for k, v in profile.items():
        cat = k.split(":")[0]
        by_cat[cat].append((k, v))

    print_subheader("Top 5 Features per Category")
    for cat in sorted(by_cat.keys()):
        features = sorted(by_cat[cat], key=lambda x: -x[1])[:5]
        print(f"\n  {C.BOLD}{cat.upper()}{C.RESET}")
        for key, val in features:
            name = resolve_feature_name_from_profile_films(key, watched_films)
            print(f"    {val:.5f}  {name}")

def show_score_breakdown(breakdown, film, profile, watched_films):
    """Display a detailed score breakdown for a single film."""
    print_header("Score Breakdown")
    print_film_title(film)

    s = breakdown
    # Color the score
    score = s["score"]
    if score >= 70:
        sc = C.GREEN
    elif score >= 40:
        sc = C.YELLOW
    else:
        sc = C.RED

    print(f"\n  {C.BOLD}Final Score:{C.RESET}  {sc}{C.BOLD}{score}/100{C.RESET}")
    print(f"  {C.DIM}{'─' * 40}{C.RESET}")
    print(f"  Cosine similarity:  {s['similarity']:.4f}")
    print(f"  Popularity boost:   {s['popularity_boost']:.4f}")
    print(f"  Coverage:           {s['coverage']:.2%}")
    print(f"  Coverage penalty:   {s['coverage_penalty']:.4f}  (sqrt of coverage)")
    print(f"  Total dot product:  {s['total_dot_product']:.6f}")
    print()
    print(f"  {C.DIM}score = similarity({s['similarity']:.4f})"
          f" * boost({s['popularity_boost']:.4f})"
          f" * sqrt(cov)({s['coverage_penalty']:.4f})"
          f" * 100 = {s['similarity'] * s['popularity_boost'] * s['coverage_penalty'] * 100:.1f}{C.RESET}")

    # Category contributions
    total_dot = s["total_dot_product"]
    if total_dot > 0:
        print_subheader("Category Contributions")

        cat_totals = {}
        for cat, features in s["by_category"].items():
            cat_totals[cat] = sum(c for _, c in features)

        sorted_cats = sorted(cat_totals.items(), key=lambda x: -x[1])
        max_cat = sorted_cats[0][1] if sorted_cats else 1

        for cat, val in sorted_cats:
            pct = val / total_dot * 100
            bar = C.bar(val, max_cat, width=30, color=C.MAGENTA)
            print(f"    {bar} {pct:5.1f}%  {cat}")

    # Matching features
    print_subheader("Matching Features (film <-> profile overlap)")
    sorted_contribs = sorted(s["contributions"].items(), key=lambda x: -x[1])[:20]

    if not sorted_contribs:
        print(f"    {C.RED}No matching features!{C.RESET}")
    else:
        idf = s.get("idf", {})
        max_contrib = sorted_contribs[0][1]
        for key, contrib in sorted_contribs:
            name = resolve_feature_name(key, film)
            profile_val = profile.get(key, 0)
            film_val = s["film_vec"].get(key, 0)
            idf_val = idf.get(key)
            idf_str = f" idf={idf_val:.2f}" if idf_val is not None else ""
            bar = C.bar(contrib, max_contrib, width=20, color=C.GREEN)
            pct = contrib / total_dot * 100 if total_dot > 0 else 0
            print(f"    {bar} {pct:5.1f}% "
                  f" {C.DIM}p={profile_val:.4f} f={film_val:.4f}{idf_str}{C.RESET}"
                  f"  {name}")

    # Missing features (in film but not in profile)
    missing = [(k, v) for k, v in s["film_vec"].items()
               if k not in s["contributions"] and not k.endswith(":unknown")]
    if missing:
        print_subheader("Non-matching Features (in film, absent from profile)")
        missing.sort(key=lambda x: -x[1])
        for key, val in missing[:10]:
            name = resolve_feature_name(key, film)
            print(f"    {C.DIM}{val:.4f}  {name}{C.RESET}")

def show_comparison(film1, film2, breakdown1, breakdown2, profile, watched_films):
    """Compare two films side by side."""
    print_header("Film Comparison")

    t1 = f"{film1.get('title', '?')} ({film1.get('year', '?')})"
    t2 = f"{film2.get('title', '?')} ({film2.get('year', '?')})"

    s1, s2 = breakdown1["score"], breakdown2["score"]
    sc1 = C.GREEN if s1 >= 70 else (C.YELLOW if s1 >= 40 else C.RED)
    sc2 = C.GREEN if s2 >= 70 else (C.YELLOW if s2 >= 40 else C.RED)

    print(f"\n  {C.BOLD}A:{C.RESET} {t1}  {sc1}{C.BOLD}{s1}/100{C.RESET}")
    print(f"  {C.BOLD}B:{C.RESET} {t2}  {sc2}{C.BOLD}{s2}/100{C.RESET}")

    print_subheader("Score Components")
    fmt = "  {:<22} {:>10} {:>10}"
    print(fmt.format("", "Film A", "Film B"))
    print(fmt.format("Similarity", f"{breakdown1['similarity']:.4f}", f"{breakdown2['similarity']:.4f}"))
    print(fmt.format("Popularity boost", f"{breakdown1['popularity_boost']:.4f}", f"{breakdown2['popularity_boost']:.4f}"))
    print(fmt.format("Coverage", f"{breakdown1['coverage']:.2%}", f"{breakdown2['coverage']:.2%}"))
    print(fmt.format("Coverage penalty", f"{breakdown1['coverage_penalty']:.4f}", f"{breakdown2['coverage_penalty']:.4f}"))
    print(fmt.format("Dot product", f"{breakdown1['total_dot_product']:.6f}", f"{breakdown2['total_dot_product']:.6f}"))

    # Category comparison
    print_subheader("Category Contributions (%)")
    all_cats = set()
    cat1, cat2 = {}, {}
    td1, td2 = breakdown1["total_dot_product"], breakdown2["total_dot_product"]

    for cat, feats in breakdown1["by_category"].items():
        all_cats.add(cat)
        cat1[cat] = sum(c for _, c in feats)
    for cat, feats in breakdown2["by_category"].items():
        all_cats.add(cat)
        cat2[cat] = sum(c for _, c in feats)

    print(fmt.format("Category", "Film A", "Film B"))
    for cat in sorted(all_cats):
        v1 = cat1.get(cat, 0) / td1 * 100 if td1 > 0 else 0
        v2 = cat2.get(cat, 0) / td2 * 100 if td2 > 0 else 0
        diff = v1 - v2
        diff_str = f"{'+'if diff>0 else ''}{diff:.1f}" if abs(diff) > 0.5 else ""
        print(f"  {cat:<22} {v1:>9.1f}% {v2:>9.1f}%  {C.DIM}{diff_str}{C.RESET}")

    # Shared features
    shared = set(breakdown1["contributions"].keys()) & set(breakdown2["contributions"].keys())
    if shared:
        print_subheader(f"Shared Matching Features ({len(shared)})")
        items = [(k, breakdown1["contributions"][k], breakdown2["contributions"][k]) for k in shared]
        items.sort(key=lambda x: -(x[1] + x[2]))
        for key, c1, c2 in items[:15]:
            name = resolve_feature_name(key, film1)
            if name == key:
                name = resolve_feature_name(key, film2)
            print(f"    {name:<35} A={c1:.5f}  B={c2:.5f}")

    # Unique to each
    only1 = set(breakdown1["contributions"].keys()) - set(breakdown2["contributions"].keys())
    only2 = set(breakdown2["contributions"].keys()) - set(breakdown1["contributions"].keys())

    if only1:
        print_subheader(f"Matching Features Unique to A ({len(only1)})")
        items = sorted([(k, breakdown1["contributions"][k]) for k in only1], key=lambda x: -x[1])
        for key, val in items[:10]:
            name = resolve_feature_name(key, film1)
            print(f"    {val:.5f}  {name}")

    if only2:
        print_subheader(f"Matching Features Unique to B ({len(only2)})")
        items = sorted([(k, breakdown2["contributions"][k]) for k in only2], key=lambda x: -x[1])
        for key, val in items[:10]:
            name = resolve_feature_name(key, film2)
            print(f"    {val:.5f}  {name}")

def show_top_bottom(screened_films, profile, watched_films, n=10, bottom=False, idf=None):
    """Show top or bottom scored films with brief breakdowns."""
    label = "Bottom" if bottom else "Top"
    print_header(f"{label} {n} Scored Films")

    results = []
    for film in screened_films:
        bd = score_film_breakdown(profile, film, idf)
        if bd:
            results.append((film, bd))

    results.sort(key=lambda x: x[1]["score"], reverse=not bottom)

    # Normalize scores so best film = 100 (mirrors what the app shows)
    max_score = max((bd["score"] for _, bd in results), default=0)
    if max_score > 0:
        for _, bd in results:
            bd["normalized_score"] = round(bd["score"] / max_score * 100)
    else:
        for _, bd in results:
            bd["normalized_score"] = 0

    results = results[:n]

    for i, (film, bd) in enumerate(results, 1):
        score = bd["normalized_score"]
        sc = C.GREEN if score >= 70 else (C.YELLOW if score >= 40 else C.RED)

        title = film.get("title", "?")
        year = film.get("year", "?")
        fid = film.get("id", "?")

        # Top 3 contributing categories
        td = bd["total_dot_product"]
        cat_pcts = {}
        for cat, feats in bd["by_category"].items():
            cat_pcts[cat] = sum(c for _, c in feats) / td * 100 if td > 0 else 0

        top_cats = sorted(cat_pcts.items(), key=lambda x: -x[1])[:3]
        cats_str = ", ".join(f"{cat}={pct:.0f}%" for cat, pct in top_cats)

        bar = C.bar(score, 100, width=15)
        print(f"  {i:>3}. {bar} {sc}{score:>3}{C.RESET}  "
              f"{C.BOLD}{title}{C.RESET} ({year}) "
              f"{C.DIM}id={fid}  [{cats_str}]{C.RESET}")

# ── Data loading ─────────────────────────────────────────────────────────────

def get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env")
        sys.exit(1)
    return create_client(url, key)

def load_user_data(sb, user_id=None):
    """Load a user's watched films, ratings, and url map."""
    # Find user
    if user_id:
        data = sb.table("user_watched_films").select("user_id").eq("user_id", user_id).limit(1).execute().data
        if not data:
            print(f"No watched films found for user {user_id}")
            sys.exit(1)
    else:
        data = sb.table("user_watched_films").select("user_id").limit(1).execute().data
        if not data:
            print("No users with watched films found")
            sys.exit(1)
        user_id = data[0]["user_id"]

    print(f"{C.DIM}  User: {user_id}{C.RESET}")

    # Load watched films with pagination
    BATCH = 500
    all_watched = []
    offset = 0
    while True:
        resp = (sb.table("user_watched_films")
                .select("letterboxd_short_url, film_id, rating, liked")
                .eq("user_id", user_id)
                .range(offset, offset + BATCH - 1)
                .execute())
        all_watched.extend(resp.data)
        if len(resp.data) < BATCH:
            break
        offset += BATCH

    user_ratings = {}
    film_ids = []
    url_map = {}

    for row in all_watched:
        if row["rating"] is not None:
            user_ratings[row["letterboxd_short_url"]] = row["rating"]
        elif row.get("liked"):
            user_ratings[row["letterboxd_short_url"]] = 4.0
        if row["film_id"] is not None:
            film_ids.append(row["film_id"])
            url_map[row["film_id"]] = row["letterboxd_short_url"]

    # Load film features
    watched_films = []
    for i in range(0, len(film_ids), BATCH):
        batch = film_ids[i:i + BATCH]
        resp = sb.table("films").select(FILM_SELECT).in_("id", batch).execute()
        watched_films.extend(resp.data)

    print(f"{C.DIM}  Loaded {len(watched_films)} watched films, {len(user_ratings)} ratings{C.RESET}")
    return user_id, watched_films, user_ratings, url_map

def load_screened_films(sb):
    """Load currently screened films."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    resp = sb.table("screenings").select("film_id").gte("showtime", now).execute()
    unique_ids = list(set(s["film_id"] for s in resp.data))

    films = []
    BATCH = 500
    for i in range(0, len(unique_ids), BATCH):
        batch = unique_ids[i:i + BATCH]
        resp = sb.table("films").select(FILM_SELECT).in_("id", batch).execute()
        films.extend(resp.data)

    print(f"{C.DIM}  Loaded {len(films)} screened films{C.RESET}")
    return films

def load_film_by_id(sb, film_id):
    resp = sb.table("films").select(FILM_SELECT).eq("id", film_id).execute()
    if not resp.data:
        print(f"Film id={film_id} not found")
        sys.exit(1)
    return resp.data[0]

def search_films(sb, query):
    resp = sb.table("films").select("id, title, year").ilike("title", f"%{query}%").limit(20).execute()
    return resp.data

# ── Interactive mode ─────────────────────────────────────────────────────────

def interactive(sb, user_id):
    """REPL for exploring scores."""
    print_header("Score Debugger - Interactive Mode")
    print(f"  {C.DIM}Loading user data...{C.RESET}")

    uid, watched_films, user_ratings, url_map = load_user_data(sb, user_id)
    profile = build_profile(watched_films, user_ratings, url_map)

    print(f"  {C.DIM}Loading screened films...{C.RESET}")
    screened_films = load_screened_films(sb)
    idf = compute_corpus_idf(screened_films)
    print(f"  {C.DIM}IDF computed over {len(idf)} screened-corpus features{C.RESET}")

    print(f"\n  {C.BOLD}Commands:{C.RESET}")
    print(f"    {C.CYAN}profile{C.RESET}              Show your taste profile")
    print(f"    {C.CYAN}film <id>{C.RESET}            Show film feature vector")
    print(f"    {C.CYAN}score <id>{C.RESET}           Score breakdown for a film")
    print(f"    {C.CYAN}compare <id1> <id2>{C.RESET}  Compare two films")
    print(f"    {C.CYAN}top [N]{C.RESET}              Top N scored films (default 10)")
    print(f"    {C.CYAN}bottom [N]{C.RESET}           Bottom N scored films")
    print(f"    {C.CYAN}search <query>{C.RESET}       Find film by title")
    print(f"    {C.CYAN}quit{C.RESET}                 Exit")
    print()

    while True:
        try:
            line = input(f"{C.BOLD}> {C.RESET}").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue

        parts = line.split()
        cmd = parts[0].lower()

        if cmd in ("quit", "exit", "q"):
            break
        elif cmd == "profile":
            show_profile(profile, watched_films, user_ratings, url_map)
        elif cmd == "film" and len(parts) >= 2:
            try:
                film = load_film_by_id(sb, int(parts[1]))
                show_film_vector(film)
            except ValueError:
                print("Usage: film <id>")
        elif cmd == "score" and len(parts) >= 2:
            try:
                film = load_film_by_id(sb, int(parts[1]))
                bd = score_film_breakdown(profile, film, idf)
                if bd:
                    show_score_breakdown(bd, film, profile, watched_films)
            except ValueError:
                print("Usage: score <id>")
        elif cmd == "compare" and len(parts) >= 3:
            try:
                f1 = load_film_by_id(sb, int(parts[1]))
                f2 = load_film_by_id(sb, int(parts[2]))
                bd1 = score_film_breakdown(profile, f1, idf)
                bd2 = score_film_breakdown(profile, f2, idf)
                if bd1 and bd2:
                    show_comparison(f1, f2, bd1, bd2, profile, watched_films)
            except ValueError:
                print("Usage: compare <id1> <id2>")
        elif cmd == "top":
            n = int(parts[1]) if len(parts) >= 2 else 10
            show_top_bottom(screened_films, profile, watched_films, n=n, idf=idf)
        elif cmd == "bottom":
            n = int(parts[1]) if len(parts) >= 2 else 10
            show_top_bottom(screened_films, profile, watched_films, n=n, bottom=True, idf=idf)
        elif cmd == "search":
            query = " ".join(parts[1:])
            results = search_films(sb, query)
            if not results:
                print("  No films found.")
            else:
                for f in results:
                    print(f"  {C.BOLD}{f['id']:>6}{C.RESET}  {f['title']} ({f.get('year', '?')})")
        else:
            print(f"  Unknown command. Type a command or 'quit' to exit.")

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Debug film recommendation scores")
    parser.add_argument("command", nargs="?", default="interactive",
                        choices=["interactive", "profile", "film", "score", "compare", "top", "bottom", "search"],
                        help="Command to run (default: interactive)")
    parser.add_argument("args", nargs="*", help="Command arguments (film IDs, search query, etc.)")
    parser.add_argument("--user-id", help="User UUID (default: first user found)")

    args = parser.parse_args()
    sb = get_supabase()

    if args.command == "interactive":
        interactive(sb, args.user_id)
        return

    # Non-interactive commands
    uid, watched_films, user_ratings, url_map = load_user_data(sb, args.user_id)
    profile = build_profile(watched_films, user_ratings, url_map)

    if args.command == "profile":
        show_profile(profile, watched_films, user_ratings, url_map)

    elif args.command == "film":
        if not args.args:
            print("Usage: debug_scores.py film <id>")
            sys.exit(1)
        film = load_film_by_id(sb, int(args.args[0]))
        show_film_vector(film)

    elif args.command == "score":
        if not args.args:
            print("Usage: debug_scores.py score <film_id>")
            sys.exit(1)
        screened = load_screened_films(sb)
        idf = compute_corpus_idf(screened)
        film = load_film_by_id(sb, int(args.args[0]))
        bd = score_film_breakdown(profile, film, idf)
        if bd:
            show_score_breakdown(bd, film, profile, watched_films)

    elif args.command == "compare":
        if len(args.args) < 2:
            print("Usage: debug_scores.py compare <id1> <id2>")
            sys.exit(1)
        screened = load_screened_films(sb)
        idf = compute_corpus_idf(screened)
        f1 = load_film_by_id(sb, int(args.args[0]))
        f2 = load_film_by_id(sb, int(args.args[1]))
        bd1 = score_film_breakdown(profile, f1, idf)
        bd2 = score_film_breakdown(profile, f2, idf)
        if bd1 and bd2:
            show_comparison(f1, f2, bd1, bd2, profile, watched_films)

    elif args.command == "top":
        n = int(args.args[0]) if args.args else 10
        screened = load_screened_films(sb)
        idf = compute_corpus_idf(screened)
        show_top_bottom(screened, profile, watched_films, n=n, idf=idf)

    elif args.command == "bottom":
        n = int(args.args[0]) if args.args else 10
        screened = load_screened_films(sb)
        idf = compute_corpus_idf(screened)
        show_top_bottom(screened, profile, watched_films, n=n, bottom=True, idf=idf)

    elif args.command == "search":
        query = " ".join(args.args)
        results = search_films(sb, query)
        if not results:
            print("No films found.")
        else:
            for f in results:
                print(f"  {C.BOLD}{f['id']:>6}{C.RESET}  {f['title']} ({f.get('year', '?')})")

if __name__ == "__main__":
    main()
