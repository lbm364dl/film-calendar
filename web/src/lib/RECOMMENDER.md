# Recommendation System

How the film recommendation engine works, end to end.

## Overview

The system is a **content-based recommender** — it builds a taste profile from the user's watched films, then scores each currently-screened film by how similar it is to that profile. The core algorithm is **cosine similarity over sparse feature vectors**.

There is no collaborative filtering (no "users like you also watched..."). Everything is derived from film metadata.

## Pipeline

```
User's Letterboxd export (watched films + ratings)
        │
        ▼
┌──────────────────┐
│  Build user       │   For each watched film:
│  taste profile    │     1. Convert to feature vector
│                   │     2. Scale by user's own rating
│                   │     3. Accumulate into profile vector
│                   │     4. Normalize (divide by total weight)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Score each       │   For each screened film:
│  screened film    │     1. Convert to feature vector
│                   │     2. Cosine similarity vs. profile
│                   │     3. Apply mild popularity boost
│                   │     4. Scale to 0-100
└────────┬─────────┘
         │
         ▼
    Sorted list of { filmId, score }
```

## Step 1: Film → Feature Vector

Each film is converted into a **sparse vector** — a `Map<string, number>` where keys are dimension names like `genre:drama` or `cast:1234` and values are weights.

The vector encodes 11 feature groups, each with a fixed weight budget that sums to 1.0:

| Feature            | Weight | Dimensions                        | Encoding |
|--------------------|--------|-----------------------------------|----------|
| Genre              | 0.22   | `genre:drama`, `genre:thriller`...| Multi-hot, split evenly |
| Director           | 0.14   | `director:137427` (TMDB ID)       | Multi-hot, split evenly |
| Cast               | 0.14   | `cast:1234` (TMDB ID)             | Billing-order weighted |
| Keywords           | 0.14   | `keyword:5678` (TMDB ID)          | Multi-hot, split evenly |
| Country            | 0.08   | `country:france`, ...             | Multi-hot, split evenly |
| Decade             | 0.08   | `decade:2020s`, `decade:pre-1960` | Single bucket |
| Language           | 0.05   | `lang:english`, `lang:french`...  | Multi-hot, deduplicated |
| Production Company | 0.05   | `company:41077` (TMDB ID)         | Multi-hot, split evenly |
| Rating             | 0.04   | `rating`                          | Single continuous value |
| Runtime            | 0.03   | `runtime:short`, `runtime:medium` | Single bucket |
| Collection         | 0.03   | `collection:726871`               | Present or absent |

### Multi-hot encoding

When a film belongs to multiple categories (e.g., genres: Drama + Thriller), the weight budget is split evenly across them:

```
Film genres: ["Drama", "Thriller"]
Weight budget: 0.22

→ genre:drama    = 0.22 / 2 = 0.11
→ genre:thriller = 0.22 / 2 = 0.11
```

This means a film with 6 genres spreads its genre signal thinner than a film with 1 genre. That's intentional — a film tagged as just "Horror" has a stronger horror identity than one tagged as "Horror, Comedy, Thriller, Mystery, Sci-Fi, Adventure".

### Billing-order weighting (cast)

Cast doesn't use even splitting. Instead, lead actors get more weight using a triangular distribution:

```
Cast: [Lead, Supporting, Minor]  (3 actors)
Weights: [3, 2, 1]  →  normalized: [3/6, 2/6, 1/6] = [0.50, 0.33, 0.17]

→ cast:lead_id     = 0.14 × 0.50 = 0.070
→ cast:support_id  = 0.14 × 0.33 = 0.047
→ cast:minor_id    = 0.14 × 0.17 = 0.023
```

The formula for position `i` (0-indexed) in a cast of size `N`:

```
orderWeight(i) = (N - i) / (N × (N + 1) / 2)
```

Only the top 5 cast members are used (`MAX_CAST = 5`). The rest are discarded to avoid noise from bit parts.

### Decade buckets

Year is bucketed into decades rather than used as a continuous value, because "1972" and "1974" should feel almost identical, while "1972" and "2022" should feel different:

| Year range | Bucket |
|------------|--------|
| < 1960     | `decade:pre-1960` |
| 1960-1969  | `decade:1960s` |
| 1970-1979  | `decade:1970s` |
| ...        | ... |
| 2020-2029  | `decade:2020s` |
| null       | `decade:unknown` |

### Runtime buckets

| Minutes   | Bucket |
|-----------|--------|
| < 90      | `runtime:short` |
| 90–120    | `runtime:medium` |
| 121–150   | `runtime:long` |
| > 150     | `runtime:epic` |
| null      | `runtime:unknown` |

### Rating

Letterboxd rating (0–5) and TMDB rating (0–10) are both normalized to 0–1, then averaged if both are present. If only one exists, that one is used alone. The result is multiplied by the weight:

```
letterboxd_rating = 4.0  →  4.0 / 5  = 0.80
tmdb_rating       = 8.0  →  8.0 / 10 = 0.80
average = 0.80

→ rating = 0.80 × 0.04 = 0.032
```

Note: rating is a weak signal (only 4% weight). It captures whether the user tends to watch highly-rated vs. cult/niche films, not whether a specific film is "good."

### Director fallback

The system prefers the `directors` jsonb array (which contains TMDB IDs) over the plain `director` string field. TMDB IDs avoid problems with name variations ("Denis Villeneuve" vs "Denis villeneuve" vs misspellings). If `directors` is empty (data not yet enriched), it falls back to the string.

### Language deduplication

`primary_language` and `spoken_languages` are merged into a single set before encoding. A film with `primary_language: ["English"]` and `spoken_languages: ["English", "French"]` produces 2 dimensions, not 3.

### Collection

If a film belongs to a TMDB collection (franchise), it gets a single `collection:ID` dimension. This means if you've watched Dune Part One (collection 726871), Dune Part Two (same collection) gets a small boost.

## Step 2: Building the User Profile

The user profile is a single sparse vector that represents their aggregate taste. It's built by:

1. Converting each watched film to a feature vector
2. Scaling each vector by the user's own rating for that film
3. Summing all scaled vectors into an accumulator
4. Normalizing by dividing by total weight

### Rating as weight

The user's Letterboxd rating (0.5–5.0) is normalized to 0–1 and used as a multiplier:

```
5.0★ → weight 1.0  (full contribution)
4.0★ → weight 0.8
3.0★ → weight 0.6  (default for unrated films)
2.0★ → weight 0.4
1.0★ → weight 0.2
0.5★ → weight 0.1  (near-zero contribution)
```

This means a 5-star film influences the profile 5x more than a 1-star film. Films you loved define your taste; films you disliked are mostly ignored.

If a watched film has no user rating, it defaults to **3.0** (weight 0.6) — slightly positive, not neutral-zero.

### Normalization

After accumulating, every dimension is divided by the total weight sum. This ensures the profile represents an **average** taste, not biased by how many films the user has watched.

```
totalWeight = sum of all rating-weights
for each dimension:
    profile[dim] = profile[dim] / totalWeight
```

Without normalization, users who've watched 5000 films would have much larger profile magnitudes than users who've watched 50, which would distort cosine similarity calculations.

### Concrete example

User watched 2 films:

```
Film A (rated 5★, weight = 1.0):
  genre:drama = 0.22, decade:2020s = 0.08, ...

Film B (rated 2★, weight = 0.4):
  genre:comedy = 0.22, decade:2020s = 0.08, ...

Accumulated:
  genre:drama  = 0.22 × 1.0          = 0.220
  genre:comedy = 0.22 × 0.4          = 0.088
  decade:2020s = 0.08 × 1.0 + 0.08 × 0.4 = 0.112

Total weight = 1.0 + 0.4 = 1.4

Normalized:
  genre:drama  = 0.220 / 1.4 = 0.157
  genre:comedy = 0.088 / 1.4 = 0.063
  decade:2020s = 0.112 / 1.4 = 0.080
```

Drama dominates the profile because Film A was rated much higher.

## Step 3: Cosine Similarity

Each screened film's vector is compared to the user profile using **cosine similarity**:

```
cosine_similarity(A, B) = (A · B) / (|A| × |B|)
```

Where:
- `A · B` is the **dot product**: sum of `A[key] × B[key]` for all shared keys
- `|A|` is the **magnitude**: `sqrt(sum of A[key]²)`

Cosine similarity measures the **angle** between two vectors, ignoring their magnitudes. It ranges from 0 (completely different) to 1 (identical direction). Negative values aren't possible here because all vector values are non-negative.

### Why cosine similarity?

- **Scale-invariant**: A user with 5000 watched films gets comparable scores to one with 50 (after normalization)
- **Handles sparsity**: Dimensions that don't exist in both vectors contribute 0 to the dot product, which is the correct behavior — an absent feature is not evidence for or against
- **Fast on sparse vectors**: Only shared dimensions need computation. The implementation iterates over the smaller vector and looks up keys in the larger one

### Worked example

```
Profile:
  genre:drama    = 0.157
  genre:comedy   = 0.063
  decade:2020s   = 0.080
  director:525   = 0.100
  cast:1234      = 0.050

Film vector:
  genre:drama    = 0.220
  decade:2020s   = 0.080
  director:525   = 0.140
  keyword:999    = 0.014

Shared dimensions: genre:drama, decade:2020s, director:525

Dot product:
  0.157 × 0.220 = 0.03454
  0.080 × 0.080 = 0.00640
  0.100 × 0.140 = 0.01400
  total          = 0.05494

|Profile| = sqrt(0.157² + 0.063² + 0.080² + 0.100² + 0.050²)
          = sqrt(0.02465 + 0.00397 + 0.00640 + 0.01000 + 0.00250)
          = sqrt(0.04752) = 0.2180

|Film|   = sqrt(0.220² + 0.080² + 0.140² + 0.014²)
         = sqrt(0.04840 + 0.00640 + 0.01960 + 0.00020)
         = sqrt(0.07460) = 0.2731

Cosine similarity = 0.05494 / (0.2180 × 0.2731) = 0.923

Score = round(0.923 × 100) = 92
```

## Step 4: Popularity Boost

After cosine similarity, a mild multiplier is applied based on `letterboxd_viewers`:

```
boost = 1.0 + min(log10(viewers) / 150, 0.05)
```

This is a **tiebreaker**, not a significant signal:

| Viewers      | log10  | Boost  |
|-------------|--------|--------|
| null or 0   | —      | ×1.000 (no penalty) |
| 100         | 2.0    | ×1.013 |
| 1,000       | 3.0    | ×1.020 |
| 10,000      | 4.0    | ×1.027 |
| 100,000     | 5.0    | ×1.033 |
| 1,000,000   | 6.0    | ×1.040 |
| 10,000,000  | 7.0    | ×1.047 |
| 100,000,000 | 8.0    | ×1.050 (capped) |

The final score is `min(100, round(similarity × boost × 100))`.

The boost is intentionally tiny. A film with 0 viewers and 90% similarity still scores 90. A film with 1M viewers and 85% similarity scores ~88. Taste match always dominates.

Why use it at all? When two films have nearly identical similarity scores (say 72 vs 71), the more widely-seen one is slightly more likely to be a good recommendation — it's been "vetted" by more people.

## Handling Missing Data

The system is designed to never fail due to missing data. Every field can be null/empty:

- **Empty arrays** (genres, directors, cast, etc.): That feature group simply contributes no dimensions to the vector. The film still gets scored on its other features.
- **Null scalars** (year, runtime, ratings): Bucket functions return `unknown` buckets, or the rating dimension is skipped entirely.
- **Null viewers**: Popularity boost returns 1.0 (neutral).

Cosine similarity naturally handles this. If a film has no genre data, the genre dimensions are absent from its vector, so they contribute 0 to the dot product. The film can still score well if it matches on director, cast, keywords, etc.

The worst case is a film with zero metadata — it would only have `decade:unknown` and `runtime:unknown` dimensions, and would score very low against any profile. This is correct behavior: we can't recommend what we know nothing about.

## What Each Feature Does for the User

Think of each feature as answering a question about user taste:

| Feature | Question it answers |
|---------|-------------------|
| Genre | "Do you watch dramas? Sci-fi? Horror?" |
| Director | "Do you follow specific directors?" |
| Cast | "Do you watch films because of specific actors?" |
| Keywords | "Are you into specific themes? (dystopia, coming-of-age, heist...)" |
| Country | "Do you watch mostly American films, or French, Korean...?" |
| Language | "Do you watch English-language films, or are you open to subtitles?" |
| Decade | "Do you prefer classic or contemporary cinema?" |
| Company | "Do you gravitate toward certain studios? (A24, Ghibli, Criterion-adjacent...)" |
| Collection | "Have you watched other films in this franchise?" |
| Runtime | "Do you prefer short or long films?" |
| Rating | "Do you watch mostly acclaimed films, or also under-the-radar ones?" |

## Limitations

- **Cold start**: Users with very few watched films get unreliable profiles. The system needs enough data to distinguish taste from noise.
- **No negative signal**: A 1-star rating reduces a film's influence but doesn't actively push the profile *away* from that film's features. If you've watched 100 horror films and hated all of them, horror still shows up in your profile (just weakly).
- **Popularity of features**: A keyword like "based on novel" appears on thousands of films and is low-signal, while "afrofuturism" is very specific. The system doesn't account for feature rarity (no TF-IDF).
- **No temporal weighting**: Films watched 10 years ago have the same influence as films watched last week (assuming same rating).
- **Rating as continuous**: A Letterboxd rating of 4.0 could mean "really good" or "pretty good" depending on the user's rating curve. We don't calibrate per-user.

## File Map

| File | Role |
|------|------|
| `web/src/lib/recommender.ts` | Core engine: vectors, similarity, scoring |
| `web/src/lib/recommender.test.ts` | 44 tests: unit + integration + realistic scenarios |
| `web/src/app/api/recommend/route.ts` | API endpoint: loads data from Supabase, calls recommender |
| `supabase/schema.sql` | Database schema with all film fields |
