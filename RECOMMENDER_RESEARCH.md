# Recommender System Research & Comparison

This document records all research conducted on recommendation algorithms for the
Madrid Film Calendar project, including algorithms surveyed, implementations tested,
quantitative/qualitative results, and the rationale for choosing Personalized PageRank.

## User Taste Profile (from Letterboxd export: 536 watched, 212 rated)

- **Directors followed**: Kurosawa (6), Ozu (5), Kiarostami (3, all 5★), Erice (2, both 5★), Buñuel (3), Kieślowski (3)
- **Countries**: Japan, Iran, Spain, France dominate 5★ list
- **Genres**: Character-driven dramas, animation (Ghibli), visual storytelling
- **Eras**: 1950s and 2020s are peak decades
- **Rating distribution**: 63.8% rated 4+, only 7 films ≤2.5★
- **Average rating**: ~4.0★
- **Viewing venues**: Golem-Madrid (62), Doré (61), Renoir (52), Filmin (46), Cineteca (35)

## Algorithms Surveyed

### 1. Content-Based Cosine Similarity (Current System)
- **Math**: Film → sparse feature vector (11 categories with fixed weights). User profile = rating-weighted average of watched film vectors. Score = cosine_similarity × popularity_boost × √coverage.
- **Strengths**: Simple, interpretable, no cold-start for new films with TMDB data.
- **Weaknesses**: Hand-tuned weights, treats features independently, can't capture "feel" or transitive connections.
- **Single-user**: Yes.

### 2. TF-IDF Enhanced Content-Based
- **Math**: Same as above but multiply features by IDF = log(N / (1 + df)). Rare features (niche directors, unusual keywords) get boosted.
- **Strengths**: Significantly better discrimination. Spanish cinema, specific directors become strong signals.
- **Weaknesses**: Still cosine similarity at core. Same structural limitations.
- **Single-user**: Yes.

### 3. Matrix Factorization (SVD/ALS)
- **Math**: Decompose user-item rating matrix R ≈ U × V^T into low-rank factors. Users and items get k-dimensional latent vectors.
- **Strengths**: Discovers latent patterns across users. Netflix Prize winner.
- **Weaknesses**: Needs MANY users. Single user = one row = degenerate factorization.
- **Single-user**: No. **Not applicable.**

### 4. Bayesian Personalized Ranking (BPR)
- **Math**: Optimize pairwise ranking: if user watched A but not B, want score(A) > score(B). Loss = -log(σ(score_A - score_B)). SGD on (user, positive, negative) triples.
- **Strengths**: Directly optimizes ranking (not rating prediction). Works with implicit feedback.
- **Weaknesses**: Standard form needs multiple users. Single-user variant learns feature weights.
- **Single-user**: Via adapted form (learn feature weights from pairwise comparisons).

### 5. Personalized PageRank / Random Walk with Restart ← CHOSEN
- **Math**: Build knowledge graph (films ↔ directors ↔ genres ↔ actors ↔ keywords). Run random walk with restart from liked films. Probability of landing on a candidate film = recommendation score.
- **Strengths**: Captures transitive connections (You → Kurosawa → Ran → samurai keyword → other samurai films). Naturally models director-following. No hand-tuned weights. Works for single user.
- **Weaknesses**: Less interpretable breakdowns. Graph construction quality matters.
- **Single-user**: Yes.

### 6. k-Nearest Neighbors (Item-Based Collaborative)
- **Math**: sim(i,j) = pearson_correlation(ratings_i, ratings_j) across all users. Predict rating = weighted average of k-nearest rated items.
- **Strengths**: Captures "fans of X also love Y" patterns that content features miss.
- **Weaknesses**: Needs multi-user rating data. Cold-start for new items.
- **Single-user**: No without community data. **Not applicable.**

### 7. Learning to Rank (LambdaMART / Pairwise SGD)
- **Math**: For pairs (high-rated, low-rated), learn feature weights via gradient descent on pairwise logistic loss. Can learn non-linear feature interactions with decision trees.
- **Strengths**: Automatically discovers optimal weights for this specific user.
- **Weaknesses**: Can overfit with small datasets. Less principled than graph methods.
- **Single-user**: Yes (needs ~100+ rated films).

### 8. Embedding-Based (Film2Vec)
- **Math**: Treat watch history as a "sentence", each film as a "word". Train Skip-gram with Negative Sampling. Films watched in similar contexts get similar embeddings.
- **Strengths**: Captures sequential viewing patterns.
- **Weaknesses**: Needs more data than one user's 500-film history. Marginal for single user.
- **Single-user**: Marginal.

### 9. Gaussian Process / Bayesian UCB
- **Math**: Model predicted rating as GP(μ, σ²). Score = μ + β×σ (Upper Confidence Bound). High-uncertainty films get exploration bonus.
- **Strengths**: Explicitly balances exploit vs explore. Pushes user toward new territory.
- **Weaknesses**: Not a standalone system — works best as a layer on top of another scorer.
- **Single-user**: Yes.

### 10. Association Rules (Apriori)
- **Math**: Find co-occurrence patterns (support, confidence, lift) in item baskets.
- **Weaknesses**: Needs multiple users' watchlists. Not applicable without Letterboxd community data.
- **Single-user**: No.

### 11. Slope One
- **Math**: For item pairs, compute average rating difference across users. Predict via linear offset.
- **Weaknesses**: Needs multiple users.
- **Single-user**: No.

### 12. Popularity-Adjusted Scoring (Inverse Propensity)
- **Math**: score_adjusted = score_raw × (1/popularity)^γ. Penalizes popular films, boosts obscure ones.
- **Strengths**: Trivial to add. Counteracts metadata richness bias.
- **Single-user**: Yes (post-processing step).

### 13. Genre-Era Affinity Matrix
- **Math**: 2D lookup table: genre × decade → user's average rating for that bucket.
- **Strengths**: Extremely simple and interpretable.
- **Weaknesses**: Too coarse for nuanced recommendations.
- **Single-user**: Yes.

## Industry Approaches

### YouTube (Google, 2016+)
Two-stage: candidate generation (deep NN embedding) + ranking (separate deep NN with richer features). Treats recommendation as extreme multiclass classification.

### Spotify (2024-2025)
Three pillars: collaborative filtering on playlists, audio CNNs, NLP on music blogs. Recently shifted toward familiarity/retention over discovery.

### Netflix (2024-2025)
Ensemble of deep NNs, RNN/LSTMs for sequential patterns, contextual bandits for explore/exploit, multi-objective optimization (completion rate, return rate, not just clicks).

## Algorithms Implemented & Compared

Five fundamentally different approaches were implemented in `scripts/compare_recommenders.py` and tested against the user's Letterboxd data:

### Quantitative Results (5-Split Holdout on 212 Rated Films)

| Algorithm | Spearman ρ | P@5 (≥4★) | P@10 (≥4★) | Math Foundation |
|-----------|-----------|-----|------|------|
| Current Baseline | 0.048 | 72% | 68% | Cosine similarity, fixed weights |
| TF-IDF Enhanced | 0.239 | 92% | 80% | Cosine + IDF weighting |
| **Personalized PageRank** | 0.234 | **100%** | **96%** | Graph random walks |
| Pairwise Learning to Rank | **0.290** | 92% | 80% | BPR gradient descent |
| Bayesian UCB | 0.259 | 84% | 80% | Uncertainty estimation |

### Qualitative Results (Top 5 Recommendations for Currently Screening Films)

**Current Baseline**: Sorry Baby, Little Amelie, Big Fish, Cumbres Borrascosas, **Candyman** (horror — bad match)

**TF-IDF**: Érase una vez… (1950 Spanish animation), ¡Átame! (Almodóvar), La ciudad perdida, Little Amelie, Good Luck (Japanese)

**PageRank**: Little Amelie, Los asesinos de la luna de miel, **Zama** (Lucrecia Martel), Cumbres Borrascosas, **Arco** (French animation)

**LTR**: En el nombre del padre, La ciudad perdida, Diabolik (action — questionable), Godard film, **El dinero** (Bresson)

**UCB**: En el nombre del padre, La ciudad perdida, Diabolik, Érase una vez…, El pájaro de papel (exploration pick)

## Why PageRank Was Chosen

1. **Best precision by far**: 100% P@5 and 96% P@10. Almost never recommends a bad film.
2. **Naturally models director-following behavior**: User goes deep into filmographies (6 Kurosawa, 5 Ozu). Director nodes become hubs in the graph.
3. **Discovers through transitive chains**: Spirit of the Beehive → Erice → El Sur. PageRank walks these paths.
4. **Found unique gems**: Zama (Martel), Arco (French animation) — not found by cosine similarity.
5. **No hand-tuned weights**: Graph structure replaces manual weight configuration.
6. **No overfitting**: Unlike LTR which put Diabolik (action) at #3, PageRank doesn't learn parameters that can overfit.

### Trade-off accepted
PageRank has slightly lower Spearman (0.234 vs LTR's 0.290) — meaning LTR predicts the exact *order* of ratings slightly better. But PageRank's precision gap (100% vs 92%) is much larger and more important for the use case: "should I go see this film?"

## Files Preserved

- `scripts/compare_recommenders.py` — Full comparison tool with all 5 algorithms
- `recommender_comparison.html` — Interactive HTML comparison page
- `web/src/lib/recommender.ts` — Original cosine-similarity implementation (kept intact)
- `scripts/compute_scores.py` — Original Python cosine-similarity scorer (kept intact)
- `scripts/debug_scores.py` — Original debug/analysis tool (kept intact)
- This document (`RECOMMENDER_RESEARCH.md`)
