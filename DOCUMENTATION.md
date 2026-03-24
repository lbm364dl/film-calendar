# Madrid Film Calendar — Complete Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Data Pipeline](#3-data-pipeline)
4. [Python Backend](#4-python-backend)
   - [Entry Point & CLI](#41-entry-point--cli)
   - [Commands Package](#42-commands-package)
   - [Letterboxd Package](#43-letterboxd-package)
   - [TMDB Integration](#44-tmdb-integration)
   - [Theater Scrapers](#45-theater-scrapers)
   - [Helper Scripts](#46-helper-scripts)
5. [Next.js Frontend](#5-nextjs-frontend)
   - [Server Entry Point](#51-server-entry-point)
   - [Components](#52-components)
   - [Hooks](#53-hooks)
   - [Library Modules](#54-library-modules)
   - [API Routes](#55-api-routes)
   - [Styling](#56-styling)
6. [Database Schema](#6-database-schema)
7. [Edge Functions](#7-edge-functions)
8. [Recommendation Algorithm](#8-recommendation-algorithm)
9. [Static Site (Legacy)](#9-static-site-legacy)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Configuration & Environment](#12-configuration--environment)
13. [Data Structures](#13-data-structures)

---

## 1. Project Overview

**Madrid Film Calendar** is an automated system that aggregates independent cinema screenings
across Madrid, enriches them with metadata from Letterboxd and TMDB, and provides a browsable
web interface with personalized recommendations.

**Live site:** https://lbm364dl.github.io/film-calendar/

### What It Does

1. **Scrapes** screening schedules from 10 Madrid independent cinemas
2. **Matches** each film to its Letterboxd page (ratings, viewer counts)
3. **Enriches** with TMDB metadata (genres, cast, directors, keywords, translations)
4. **Publishes** results as both a static GitHub Pages site and a dynamic Supabase-backed Next.js app
5. **Recommends** films based on the user's Letterboxd viewing history

### Supported Cinemas

| Cinema | Scraping Method | Update Period |
|--------|----------------|---------------|
| Cineteca Madrid | BeautifulSoup | Monthly |
| Cine Doré (Filmoteca) | BeautifulSoup (paginated) | Monthly |
| Sala Berlanga | Selenium (AJAX) | Monthly |
| Sala Equis | BeautifulSoup + Selenium | Monthly |
| Círculo de Bellas Artes | BeautifulSoup | Weekly |
| Cines Renoir (3 locations) | Selenium | Weekly |
| Golem Madrid | BeautifulSoup | Weekly |
| Cines Embajadores | BeautifulSoup | Weekly |
| Cine Paz | BeautifulSoup | Weekly |
| Cines Verdi | BeautifulSoup | Weekly |

### Technology Stack

**Backend (Python):** Selenium, undetected-chromedriver, BeautifulSoup, pandas, requests, python-dotenv

**Frontend (Next.js/TypeScript):** Next.js 15, React 19, Supabase client, PapaParse, JSZip

**Database:** Supabase (PostgreSQL) with Row Level Security, Edge Functions

**External APIs:** Letterboxd (web scraping), TMDB v3/v4 (REST API)

**Deployment:** Vercel (frontend), GitHub Pages (legacy static), Supabase (database + edge functions)

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE (Python)                         │
│                                                                        │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐ │
│  │  SCRAPE   │───>│  MATCH   │───>│  MERGE   │───>│ UPLOAD/IMPORT   │ │
│  │ theaters  │    │letterboxd│    │ JSON+meta│    │   to Supabase   │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────────────┘ │
│       │                │               │                    │          │
│   10 cinema        Selenium       TMDB API +          PostgreSQL      │
│   scrapers         search        Selenium fetch        upserts        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Database + Edge Functions)                 │
│                                                                        │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────────────┐  │
│  │  films   │  │  screenings  │  │  film_enrichment_queue         │  │
│  │ (master) │  │ (per-session)│  │  (background TMDB enrichment)  │  │
│  └──────────┘  └──────────────┘  └────────────────────────────────┘  │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │ user_watched_films│  │user_watchlist   │  │ user_film_scores   │  │
│  │ (per-user)        │  │(per-user)       │  │ (recommendations)  │  │
│  └──────────────────┘  └─────────────────┘  └────────────────────┘  │
│                                                                        │
│  Edge Function: process-enrichment (Deno, triggered by queue insert)  │
│  pg_cron: polls enrichment queue every 3 minutes                       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Next.js on Vercel)                     │
│                                                                        │
│  Server Component (page.tsx)                                           │
│    ├─ Load user prefs, auth, scores from Supabase                     │
│    └─ Pass initial props to client                                     │
│                                                                        │
│  Client Component (FilmCalendar.tsx)                                   │
│    ├─ useFilmData      → load films + screenings from Supabase        │
│    ├─ useFilmFilters   → search, theater, date, year filtering        │
│    ├─ useLetterboxd    → watchlist/watched/recommendations            │
│    ├─ useUrlParams     → bookmarkable filter state                    │
│    └─ useModal         → session & Letterboxd modals                  │
│                                                                        │
│  API Routes                                                            │
│    ├─ /api/preferences    → save user language & filter prefs         │
│    ├─ /api/upload-watched → parse Letterboxd ZIP, queue enrichment    │
│    ├─ /api/recommend      → compute match scores for user             │
│    └─ /api/enrich-batch   → poll enrichment progress                  │
└────────────────────────────────────────────────────────────────────────┘
```

### File Structure Overview

```
film-calendar/
├── main.py                    # CLI entry point (thin dispatcher)
├── cli.py                     # Argument parsing + boilerplate generator
├── json_io.py                 # JSON read/write helpers
├── rate.py                    # Re-export shim for letterboxd/
├── tmdb.py                    # TMDB API client
├── theaters.py                # Theater scraper registry
│
├── commands/                  # CLI command handlers
│   ├── scrape.py              # Fetch films from cinema websites
│   ├── match.py               # Find Letterboxd URLs
│   ├── merge.py               # Merge into master JSON + fetch metadata
│   ├── archive.py             # Move old sessions to historical storage
│   └── new_cinema.py          # Generate scraper boilerplate
│
├── letterboxd/                # Letterboxd integration
│   ├── browser.py             # Undetected Chrome management
│   ├── helpers.py             # URL constants, parsing utilities
│   ├── fetch.py               # Metadata scraping (rating, viewers, TMDB link)
│   └── search.py              # Film search + DataFrame matching
│
├── fetch_films/               # Cinema scrapers (1 base + 10 implementations)
│   ├── base.py                # Abstract base class + dataclasses
│   ├── cineteca.py            # Cineteca Madrid
│   ├── dore.py                # Cine Doré / Filmoteca Española
│   ├── circulo_bellas_artes.py# Círculo de Bellas Artes
│   ├── renoir.py              # Cines Renoir (3 locations)
│   ├── golem.py               # Golem Madrid
│   ├── sala_berlanga.py       # Sala Berlanga
│   ├── embajadores.py         # Cines Embajadores
│   ├── cine_paz.py            # Cine Paz
│   ├── verdi.py               # Cines Verdi
│   └── sala_equis.py          # Sala Equis
│
├── scripts/                   # Standalone utility scripts
│   ├── upload_to_supabase.py  # JSON → Supabase uploader
│   ├── import_screenings_json.py # Historical data migration
│   ├── compute_scores.py      # Recommendation engine (batch)
│   ├── fetch_letterboxd_viewers.py # Viewer count updater
│   └── debug_scores.py        # Score analysis & visualization
│
├── tests/                     # Pytest test suite
│   ├── conftest.py            # Fixtures
│   ├── test_cineteca.py … test_tmdb.py
│   └── fixtures/              # HTML fixtures per cinema
│
├── docs/                      # Static GitHub Pages site (legacy)
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   ├── screenings.json        # Master data file
│   └── assets/
│
├── web/                       # Next.js frontend (Vercel)
│   ├── src/
│   │   ├── app/               # Pages, layout, API routes
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Shared utilities & types
│   └── public/                # Static assets
│
└── supabase/                  # Database config
    ├── schema.sql             # Full schema
    ├── migrations/            # Incremental changes
    └── functions/             # Edge functions (Deno)
```

---

## 3. Data Pipeline

The system follows a four-step pipeline to transform raw cinema website data into
a searchable, metadata-rich database.

### Step 1: Scrape

```bash
python main.py scrape --start-date 2025-03-20 --end-date 2025-03-27 --output raw.csv
```

Each cinema scraper navigates its website and extracts screening data. The output is a CSV
with columns: `theater, title, director, year, theater_film_link, dates`.

Each `dates` entry is a JSON array of session objects:
```json
{
  "timestamp": "2025-03-20 20:00",
  "location": "Cine Paz",
  "url_tickets": "https://...",
  "url_info": "https://...",
  "version": "dubbed"
}
```

### Step 2: Match

```bash
python main.py match --input raw.csv --output matched.csv --cache docs/screenings.json
```

Uses Selenium to search Letterboxd for each film. The search strategy tries multiple
approaches in order:

1. Title + year (most specific)
2. Title + director slug (for ambiguous titles)
3. Title alone (fallback)

A URL cache from the master JSON avoids redundant searches for known films.

### Step 3: Merge

```bash
python main.py merge --input matched.csv --source docs/screenings.json
```

Merges the matched CSV into the master JSON file:

1. **Film matching:** By `letterboxd_url` (primary) or `title` (fallback)
2. **Date merging:** Adds new sessions, avoids duplicates by `(timestamp, location)` key
3. **Letterboxd metadata:** Batch-fetches ratings, viewer counts, short URLs, TMDB links
4. **TMDB metadata:** Batch-fetches genres, cast, directors, keywords, translations, etc.

### Step 4: Upload

```bash
python scripts/upload_to_supabase.py --json docs/screenings.json
```

Upserts films and screenings into Supabase PostgreSQL. Deduplicates by
`letterboxd_short_url` (primary) or `(title, director)` (fallback).

### Optional: Archive

```bash
python main.py archive --start-date 2024-12-01 --end-date 2024-12-31 \
  --source docs/screenings.json --output old_screenings/2024-q4.json
```

Moves past sessions from the live database to a historical JSON file.
Supports `--dry-run` for previewing changes.

---

## 4. Python Backend

### 4.1 Entry Point & CLI

#### `main.py` (19 lines)

Thin dispatcher that imports from `cli` and `commands`:

```python
args = parse_args()
if args.command == "scrape":
    run_scrape(args)
elif args.command == "match":
    run_match(args)
# ...
```

#### `cli.py` (315 lines)

Defines all CLI subcommands with argparse:

| Command | Key Arguments | Purpose |
|---------|--------------|---------|
| `scrape` | `--start-date`, `--end-date`, `--fetch-from`, `--period` | Fetch raw screenings |
| `match` | `--input`, `--output`, `--skip-existing`, `--cache` | Find Letterboxd URLs |
| `merge` | `--source`, `--input`, `--output`, `--backfill` | Merge + enrich metadata |
| `archive` | `--start-date`, `--end-date`, `--source`, `--output`, `--dry-run` | Move old sessions |
| `new-cinema` | `--key`, `--name`, `--url` | Generate scraper boilerplate |

The `generate_cinema_boilerplate()` function creates a new scraper file with abstract methods,
test fixture directories, and prints setup instructions.

#### `json_io.py` (39 lines)

Three utilities for master JSON management:

- **`read_master_json(path)`** — Load JSON array from file (returns `[]` if missing)
- **`write_master_json(films, path)`** — Write films list with `ensure_ascii=False` and indentation
- **`parse_dates_column(val)`** — Parse dates from CSV/JSON (handles JSON strings, Python repr, lists)

#### `theaters.py` (52 lines)

Central registry for all scrapers. Maps theater keys to scraper instances:

```python
SCRAPERS = {
    "cineteca": CinetecaScraper(),
    "dore": DoreScraper(),
    # ... 10 total
}
```

Key functions:
- `fetch_films(theater, start, end)` — Dispatch to the right scraper
- `all_theaters()` — List all supported theater keys
- `get_theaters_by_period(period)` — Filter by "weekly" or "monthly"

### 4.2 Commands Package

#### `commands/scrape.py` (34 lines)

Orchestrates scraping from specified theaters. Filters by `--fetch-from` list or
`--period`. Deduplicates by `theater_film_link`, sorts by title, and exports CSV.

#### `commands/match.py` (61 lines)

Loads a URL cache from the master JSON to skip known films.
Calls `match_films()` which opens a single Selenium browser and searches
Letterboxd for each unmatched film.

#### `commands/merge.py` (271 lines)

The most complex command. Internally organized into three functions:

- **`_merge_input_into_master()`** — Merge CSV rows into the master film list.
  Uses two-key matching: `letterboxd_url` first, then `title`.
  Merges screening dates avoiding duplicates by `(timestamp, location)`.

- **`_batch_fetch_letterboxd()`** — Opens a single Selenium browser and fetches
  rating, viewers, short URL, and TMDB URL from each Letterboxd film page.

- **`_batch_fetch_tmdb()`** — Calls the TMDB API for genres, cast, directors,
  keywords, translations, and other metadata. Rate-limited at ~4 requests/second.

**Backfill mode** (`--backfill`): Re-fetches metadata for ALL films, not just new ones.

#### `commands/archive.py` (137 lines)

Partitions sessions into three categories:
1. **Fully archived** — All sessions in date range → removed from live DB
2. **Partially archived** — Some sessions in range → kept with remaining sessions
3. **Untouched** — No sessions in range → unchanged

Matching to historical DB uses `letterboxd_short_url` first, then `(title, director, year)`.

#### `commands/new_cinema.py` (8 lines)

Delegates to `cli.generate_cinema_boilerplate()`.

### 4.3 Letterboxd Package

#### `letterboxd/browser.py` (73 lines)

Chrome browser management for bypassing Cloudflare:

- **`create_browser()`** — Creates an `undetected_chromedriver.Chrome` instance.
  Detects installed Chrome version automatically. Configures stealth options
  (`--no-first-run`, `--no-service-autorun`, `--password-store=basic`).

- **`dismiss_cookie_consent(browser, timeout)`** — Tries 9 common cookie consent
  selectors, then falls back to matching button text ("Accept", "Accept All", etc.).

#### `letterboxd/helpers.py` (61 lines)

Constants and utility functions:

- `LETTERBOXD` = `"https://letterboxd.com"`
- `LETTERBOXD_SEARCH` = `"https://letterboxd.com/search/films/"`
- `REQUESTS_HEADERS` — Mozilla user-agent string
- **`viewers_to_int(viewers)`** — Convert "1.5K" → 1500, "2M" → 2000000
- **`parse_ld_json(soup)`** — Extract LD+JSON structured data from HTML
- **`wait_and_fetch_soup(browser, delay, xpath)`** — WebDriverWait + BeautifulSoup

#### `letterboxd/fetch.py` (191 lines)

Two-phase metadata scraping:

**`fetch_letterboxd_info(url, browser=None)`**
- **Phase 1 (requests, fast):** Rating from `twitter:data2` meta tag,
  short URL from hidden input, TMDB URL from page link or body `data-tmdb-id`.
- **Phase 2 (Selenium, if browser provided):** Viewer count from
  `div.production-statistic.-watches` aria-label. Rating fallback from rendered page.

**`fetch_letterboxd_info_batch(urls, use_selenium=True)`**
- Opens a single browser session for all URLs (efficient).
- Warms up with Letterboxd homepage, dismisses cookies, then fetches sequentially.
- Falls back to requests-only if Chrome fails.

**`fetch_viewers_batch(urls)`**
- Generator that yields viewer counts one-by-one (memory efficient).
- Opens single browser session.

#### `letterboxd/search.py` (197 lines)

Film search and DataFrame matching:

**`find_letterboxd_url(title, year, director, browser)`**

Multi-strategy search:
1. Search with `year:YYYY` filter
2. Search with `director:slug` filter (for each comma-separated director)
3. Search with bare title (fallback)

Returns `(url, found_year)` tuple.

**`match_films(df, skip_existing=False, url_cache=dict)`**

Adds `letterboxd_url` column to a pandas DataFrame:
- Checks cache first (theater_film_link → letterboxd_url)
- Falls back to Selenium search
- `skip_existing` mode only processes films without existing URLs

**`rate_films(df)`**

Fetches Letterboxd metadata for all films with a `letterboxd_url`.
Adds columns: `letterboxd_rating`, `letterboxd_viewers`, `letterboxd_short_url`, `tmdb_url`.

### 4.4 TMDB Integration

#### `tmdb.py` (371 lines)

TMDB API client supporting both v3 API keys and v4 JWT tokens.

**Authentication:**
- Reads `TMDB_API_KEY` from environment (via python-dotenv)
- v4 tokens (JWT format with dots) → sent as `Authorization: Bearer` header
- v3 keys (32-char hex) → sent as `api_key` query parameter

**`fetch_tmdb_info(tmdb_url)`**

Makes a single API call with `append_to_response=translations,credits,keywords`
and returns a comprehensive metadata dict:

| Field | Description |
|-------|-------------|
| `tmdb_id` | TMDB numeric ID |
| `genres` | List of genre names |
| `country` | Production countries |
| `primary_language` | Original language (full name) |
| `spoken_languages` | All spoken languages |
| `runtime_minutes` | Duration (for TV: episodes × avg runtime) |
| `directors` | Top 2 directors with TMDB person ID |
| `top_cast` | Top 5 billed actors with TMDB person ID |
| `keywords` | Thematic keywords with TMDB keyword ID |
| `tmdb_rating` | Vote average (0-10) |
| `tmdb_votes` | Vote count |
| `production_companies` | Studios with TMDB company ID |
| `collection_name/id` | Franchise info |
| `overview`, `tagline` | Description text |
| `title_original` | Original language title |
| `title_en`, `title_es` | English and Spanish translations |

**`fetch_tmdb_info_batch(urls, delay=0.25)`**

Batch-fetches with rate limiting (default ~4 requests/second, within TMDB's free tier limit
of 40 requests per 10 seconds).

### 4.5 Theater Scrapers

All scrapers inherit from `BaseCinemaScraper` (defined in `fetch_films/base.py`).

#### Base Class

**`CinemaInfo`** dataclass:
```python
@dataclass
class CinemaInfo:
    key: str              # "cineteca", "dore", etc.
    name: str             # "Cineteca Madrid"
    base_url: str         # "https://cinetecamadrid.com"
    update_period: str    # "monthly" or "weekly"
```

**`FilmInfo`** dataclass:
```python
@dataclass
class FilmInfo:
    theater: str
    title: str
    theater_film_link: str
    dates: list                  # List of session dicts
    director: Optional[str]
    year: Optional[str]
```

**Abstract methods** each scraper must implement:
- `cinema_info` property → CinemaInfo
- `build_day_url(date)` → URL string
- `parse_films_list(html, date)` → list of film detail URLs
- `parse_film_page(html, film_url, date)` → FilmInfo

#### Scraper Specifics

| Scraper | Lines | Key Challenges |
|---------|-------|----------------|
| **cineteca.py** | 146 | Simple HTML structure. Parses `h2.title > a` for film links, `div.sb-sessions__items` for showtimes. |
| **dore.py** | 276 | Date filters are broken on site; uses **full pagination** instead. Fetches all listing pages, filters client-side. Merges duplicate films by `(title, director, year)` key. |
| **circulo_bellas_artes.py** | 315 | **Weekly tabbed interface** with all weeks in one page load. Parses `cba_cine_table_*` divs for hour/title/type data. |
| **renoir.py** | 195 | **Selenium required** for JS-rendered content. Fetches per-location (Princesa, Retiro, Plaza de España). Merges across dates/locations by `(title, url)`. |
| **golem.py** | 169 | Film titles in `a.txtNegXXL`. Removes "VOSE" suffix from titles. Caches fetched director info to avoid re-fetching. |
| **sala_berlanga.py** | 556 | **Most complex scraper.** Uses Selenium to: click date range picker, select "Cine" category, click "Ver más" repeatedly. Two-pass ticket URL fetching via entradas.com. |
| **embajadores.py** | 285 | Catalog-based. Groups by base slug to merge VOSE + dubbed versions. Version detection via `-vose`/`-doblada` URL suffixes. |
| **cine_paz.py** | 345 | **Dual-page approach:** fetches VOSE page first to identify subtitled films, then main cartelera. Per-session version tagging. |
| **verdi.py** | 252 | Title from `data-tiulo` attribute (Latin-1 decoded). Tabbed showtimes interface. Version detection: "V.O. SUB. CASTELLANO" vs "CASTELLANO". |
| **sala_equis.py** | 325 | Fetches `/taquilla/` catalog, then detail pages for metadata. Uses **Selenium for kinetike.co ticketing** page to scrape session times from rendered buttons. |

#### Version/Language Tagging

Sessions can have a `version` field:
- `null` — Original language (default, no tag shown)
- `"dubbed"` — Dubbed in Spanish (shown with speaker icon + "ES" badge)
- `"VOSE"` — Original version with Spanish subtitles (not currently displayed differently)

### 4.6 Helper Scripts

#### `scripts/compute_scores.py` (527 lines)

Batch recommendation engine that mirrors the TypeScript algorithm in `web/src/lib/recommender.ts`.
Runs server-side against the full Supabase database.

```bash
python scripts/compute_scores.py             # Incremental (new films only)
python scripts/compute_scores.py --full      # Re-score everything
python scripts/compute_scores.py --dry-run   # Preview without writing
```

See [Section 8: Recommendation Algorithm](#8-recommendation-algorithm) for details.

#### `scripts/upload_to_supabase.py` (166 lines)

Uploads `docs/screenings.json` to Supabase. Deduplicates by `letterboxd_short_url` first,
then `(title, director)`. Supports `--clear` to wipe existing data.

#### `scripts/import_screenings_json.py` (223 lines)

One-time migration tool: imports screenings.json with optional TMDB enrichment.
Converts timestamps from "YYYY-MM-DD HH:MM" (Madrid local) to ISO 8601 with timezone.

#### `scripts/fetch_letterboxd_viewers.py` (106 lines)

Scrapes Letterboxd viewer counts using Selenium and updates the `films` table.
Supports `--only-missing` (skip films with existing counts) and `--limit N`.

#### `scripts/debug_scores.py` (919 lines)

Analysis and visualization tool for the recommendation algorithm.
Useful for tuning feature weights and understanding score distributions.

---

## 5. Next.js Frontend

### 5.1 Server Entry Point

#### `web/src/app/layout.tsx` (76 lines)

Root layout with:
- HTML lang set to Spanish (`es`)
- Google Analytics script injection (`NEXT_PUBLIC_GA_ID`, default: `G-FKN0ELREQD`)
- JSON-LD structured data (WebApplication schema)
- SEO metadata: title, description, OpenGraph tags, keywords

#### `web/src/app/page.tsx` (100 lines)

Server component that bootstraps the client:

1. Reads `fc_lang` cookie for language preference
2. Checks authentication via `createServerSupabase()`
3. For authenticated users, loads from Supabase:
   - `user_preferences` (language, filter toggles)
   - `user_watched_films` (Letterboxd short URLs)
   - `user_watchlist_films` (Letterboxd short URLs)
   - `user_film_scores` (precomputed match scores)
4. Passes all as props to `<FilmCalendar />` client component

#### `web/src/middleware.ts`

Session refresh middleware. Runs on every request (except static assets).
Calls `supabase.auth.getUser()` to refresh auth cookies, ensuring Server Components
always see the latest session state.

### 5.2 Components

#### `FilmCalendar.tsx` (269 lines) — Main Orchestrator

The top-level client component that wires everything together:

```
FilmCalendar
├── Header (inline)
│   ├── AuthButton
│   └── Language Toggle (ES/EN)
├── FiltersGrid
├── Stats Row + Sort Toggle
├── Film Grid
│   └── FilmCard (×N, paginated)
├── Footer (inline)
├── LetterboxdModal (overlay)
└── SessionModal (overlay)
```

**Props received from server:**
```typescript
interface FilmCalendarProps {
  initialLang: LangKey;
  initialWatchlistUrls: string[];
  initialWatchedUrls: string[];
  initialWatchlistActive: boolean;
  initialWatchedActive: boolean;
  initialUserId: string | null;
  initialUserEmail: string | null;
  initialScores: Record<number, number>;
}
```

**State management** is fully delegated to hooks:
- `useFilmData()` — Data loading
- `useFilmFilters()` — Filtering, sorting, pagination
- `useLetterboxd()` — Watchlist/watched/recommendations
- `useUrlParams()` — URL parameter sync
- `useSessionModal()` + `useLbModal()` — Modal state

**Language handling:**
- State stored in `lang` (es/en)
- Changes persist to cookie (`fc_lang`) and Supabase (`user_preferences.lang`)
- All text rendered via `t(lang, key, ...args)` translation function

#### `FilmCard.tsx` (149 lines)

Displays a single film with:

1. **Header row:** Title with metadata (director, year, runtime)
2. **Card actions:**
   - Match score badge (color-coded: green ≥70%, yellow ≥40%, red <40%)
     with tooltip showing category breakdown
   - Letterboxd rating (gold star)
   - Viewer count (formatted: 1.5M, 100k, etc.)
   - Letterboxd link icon
3. **Genre badges** (translated to Spanish when `lang === 'es'`)
4. **Sessions** via `SessionsDisplay` component

The `buildScoreTooltip()` helper generates multi-line tooltips showing:
- Overall match percentage
- Top 3 contributing categories with percentages
- Data coverage percentage

#### `FiltersGrid.tsx` (205 lines)

All filter controls in a responsive grid:

| Control | Type | Details |
|---------|------|---------|
| Date picker | `<input type="date">` | Min: today. Click triggers `showPicker()`. Locale-aware. |
| Search box | `<input type="text">` | Searches title, titleEn, director (accent-insensitive) |
| Theater dropdown | `<select>` | All 10 cinemas listed |
| Year range | Dual `<input type="number">` + dual `<input type="range">` | Visual gradient track between thumbs |
| Letterboxd button | `<button>` | Opens LetterboxdModal. Shows active indicator dot. |
| Clear filters | `<button>` | Resets all filters and clears URL params |

Hidden file inputs for CSV/ZIP upload are also rendered here (triggered by Letterboxd modal).

#### `SessionModal.tsx` (45 lines)

Overlay modal showing actions for a clicked session:

- **If direct ticket URL available:** Buy Tickets, View Film Page, Add to Calendar
- **If no direct URL:** View Film Page (opens theater website), Add to Calendar

Calendar links are Google Calendar TEMPLATE URLs with:
- Event title: film title + year
- Location: mapped from `THEATER_LOCATIONS` to full address
- Details: director, theater link, location link

#### `LetterboxdModal.tsx` (161 lines)

Multi-section overlay for Letterboxd data management:

1. **Instructions:** Step-by-step guide to export Letterboxd data
2. **Recommendations** (authenticated only):
   - ZIP upload button with progress indicator
   - Progress bar during enrichment
   - "Recommendations ready" status
3. **Filters** (when data exists):
   - Watchlist toggle with count
   - Watched (hide already-watched) toggle with count
   - Clear data button

#### `AuthButton.tsx` (234 lines)

Authentication UI with two states:

**Logged out:** "Log in" button → modal with:
- Google OAuth ("Continue with Google")
- Email/password form (login or signup toggle)
- Password validation (min 6 chars)

**Logged in:** Avatar circle (first letter of email) → dropdown with:
- Email display
- Logout button

OAuth uses Supabase auth with `fc_auth_next` cookie to preserve return path.

#### Session Sub-components

**`sessions/SessionRow.tsx` (54 lines):**
Single screening button showing date badge, location badge, and dubbed indicator.
Clicking opens SessionModal.

**`sessions/GroupedSessions.tsx` (80 lines):**
Groups sessions by day, showing day headers ("Mon, Mar 24") and time slots.
Each time slot is a clickable button opening SessionModal.

**`sessions/SessionsDisplay.tsx` (101 lines):**
Wrapper that decides rendering strategy:
- ≤2 sessions: render SessionRow for each (always visible)
- \>2 sessions: collapsible toggle showing date range, location summary, and count.
  Expanding shows GroupedSessions popup.

### 5.3 Hooks

#### `useFilmData` (60 lines)

Fetches all films with screenings from Supabase on mount:

```typescript
const { data } = await supabase
  .from('films')
  .select('*, screenings(*)')
  .order('title');
```

Maps `FilmRow[]` to `Film[]` (converting ISO timestamps to local strings).
Computes year bounds from films with future screenings only.

Returns: `{ allFilms, loading, error, yearBoundsMin, yearBoundsMax }`

#### `useFilmFilters` (144 lines)

Filtering pipeline (all memoized):

1. **Session filtering:** Remove past sessions. Filter by theater and date.
2. **Film filtering:** Search term (accent-insensitive), year range,
   watchlist membership, watched exclusion.
3. **Sorting:** By match score (if enabled), then Letterboxd rating, then title.
4. **Pagination:** 30 films per page (3 columns × 10 rows).

Returns: all filter state + setters, `filteredFilms`, `sortedFilms`, `visibleFilms`,
`remaining`, `clearAllFilters()`, `loadMore()`.

#### `useUrlParams` (52 lines)

Bidirectional URL parameter sync:

- **On mount:** Reads `search`, `theater`, `date`, `min_year`, `max_year` from URL
- **On change:** Updates URL with `replaceState` (no page reload)

This makes all filter combinations bookmarkable and shareable.

#### `useLetterboxd` (248 lines)

Manages all Letterboxd-related state and operations:

**State:**
- `watchlistUrls` / `watchedUrls` — Sets of Letterboxd short URLs
- `matchScores` — `Record<filmId, score>` (0-100)
- `breakdowns` — `Record<filmId, CompactBreakdown>` (category-level scores)
- `enrichmentTotal` / `enrichmentProcessed` — Progress tracking
- `enrichmentPolling` / `recommendReady` — Status flags

**Key operations:**

- **`handleCsvUpload(file, type)`** — Parses CSV with PapaParse, extracts Letterboxd URIs,
  saves to `user_watchlist_films` in Supabase.

- **`handleZipUpload(file)`** — POSTs ZIP to `/api/upload-watched`, then polls
  `/api/enrich-batch` every 4 seconds until completion, then fetches recommendations.

- **`fetchRecommendations()`** — GET `/api/recommend`, updates scores and breakdowns.

- **`clearLetterboxdData()`** — Wipes all user data from Supabase tables.

**Auto-resume:** On mount, checks enrichment progress. If incomplete, resumes polling.
If complete but no scores cached, fetches recommendations.

#### `useModal` (50 lines)

Two modal hooks plus an escape key handler:

- **`useSessionModal()`** — `{ modal, modalClosing, openModal, closeModal }`
- **`useLbModal()`** — `{ showLbModal, lbModalClosing, openLbModal, closeLbModal }`
- **`useEscapeKey(handlers)`** — Calls handlers array on Escape key press

Both modals use a 220ms close animation via `closing` state.

### 5.4 Library Modules

#### `lib/types.ts` (72 lines)

Core TypeScript interfaces:

| Interface | Purpose |
|-----------|---------|
| `Screening` | Raw database screening row |
| `FilmRow` | Database film row with nested screenings |
| `Film` | Processed frontend film object |
| `DateEntry` | Single screening session (timestamp, location, URLs, version) |
| `SessionModalData` | Data for the session action modal |

#### `lib/constants.ts` (15 lines)

Configuration constants:
- `ROWS_PER_PAGE = 10` (×3 columns = 30 films per page)
- `SESSIONS_COLLAPSE_THRESHOLD = 2`
- `RENOIR_LOCATIONS` / `EMBAJADORES_LOCATIONS` — Multi-location cinema branches
- `THEATER_LOCATIONS` — Map of location names to full Google Maps addresses

#### `lib/film-helpers.ts` (142 lines)

Pure utility functions:

| Function | Purpose |
|----------|---------|
| `isRenoirLocation(loc)` | Check if location is a Renoir branch |
| `isEmbajadoresLocation(loc)` | Check if location is an Embajadores branch |
| `normalizeText(text)` | Remove diacritics + lowercase (for search) |
| `getLocalTodayStart()` | Today at 00:00 in browser timezone |
| `formatDateInputValue(date)` | Format as YYYY-MM-DD for input elements |
| `getDateOnly(timestamp)` | Parse "YYYY-MM-DD HH:MM" to Date |
| `formatViewerCount(n)` | Format: "1.5M", "100k", "42" |
| `getTheaterFallbackUrl(film, dateObj)` | Fallback URL by theater name |
| `isoToLocal(iso)` | Convert UTC ISO to "YYYY-MM-DD HH:MM" (reads UTC fields directly because DB stores Madrid local times with Z suffix) |
| `mapFilmRows(rows)` | Transform FilmRow[] → Film[] |
| `savePreference(data)` | POST to /api/preferences (fire-and-forget) |
| `setLangCookie(lang)` | Set `fc_lang` cookie (1 year) |
| `generateCalendarUrl(title, film, dateObj)` | Google Calendar TEMPLATE URL |

#### `lib/translations.ts` (193 lines)

Bilingual (ES/EN) translation system:

```typescript
type LangKey = 'es' | 'en';
type TranslationValue = string | ((...args: any[]) => string);
```

Translation function: `t(lang, key, ...args)` — Looks up key, calls if function,
falls back to English if Spanish missing.

Genre translations via `translateGenre(genre, lang)` using `GENRE_TRANSLATIONS_ES`
map (24 genres: "action" → "Acción", "science fiction" → "Ciencia ficción", etc.).

#### `lib/recommender.ts` (526 lines)

Content-based recommendation engine. See [Section 8](#8-recommendation-algorithm).

#### `lib/letterboxd.ts` (295 lines)

Client-side Letterboxd utilities:

- **`parseExportZip(buffer)`** — Extracts watched.csv, ratings.csv, watchlist.csv,
  likes/films.csv from a Letterboxd export ZIP. Returns `ParsedExport` with arrays
  of URLs, ratings map, liked set, and watched dates.

- **`fetchLetterboxdInfo(url)`** — Server-side scraping of a Letterboxd film page
  (static HTML only, no Selenium). Extracts rating, short URL, and TMDB URL.

- **`resolveShortUrl(shortUrl)`** — Follows boxd.it redirect to get full URL.

- **`parseCSV(text)` / `parseCSVLine(line)`** — Minimal CSV parser for Letterboxd exports.

#### `lib/tmdb-client.ts` (376 lines)

Frontend TMDB API wrapper. Mirrors `tmdb.py` but in TypeScript:

- Supports v3 API keys and v4 JWT tokens
- `fetchTmdbInfo(url)` — Single API call with `append_to_response=translations,credits,keywords`
- Handles both movie and TV types (tries alternate if first fails)
- Returns `TmdbInfo` with directors, cast, keywords, translations, etc.

#### `lib/supabase-browser.ts` (27 lines)

Singleton Supabase client for browser use:
```typescript
export function getBrowserSupabase(): SupabaseClient
```
Creates client with public key, manages cookies via `document.cookie`.

#### `lib/supabase-server.ts` (37 lines)

Server-side Supabase client (async, creates new instance per call):
```typescript
export async function createServerSupabase(): SupabaseClient
```
Uses Next.js `cookies()` hook for auth cookie management.

### 5.5 API Routes

#### `POST /api/preferences`

Saves user preferences (language, filter toggles) to `user_preferences` table.
Requires authentication. Body: `{ lang?, watchlist_active?, watched_active? }`.

#### `POST /api/upload-watched`

Handles Letterboxd ZIP upload:

1. Parse ZIP via `parseExportZip()` → watched, watchlist, ratings, likes
2. Delete old user data (watched, watchlist, scores)
3. Query `films` table to resolve known Letterboxd URLs to film IDs
4. Insert `user_watched_films` rows (with rating, liked, watched_date, film_id)
5. Insert `user_watchlist_films` rows
6. Queue unknown films in `film_enrichment_queue` for background TMDB enrichment
7. Returns: `{ total, alreadyKnown, toEnrich, watchedUrls, watchlistUrls }`

#### `GET /api/recommend`

Computes personalized match scores:

1. Load user's watched films with features
2. Load currently-screened films with features
3. Call `computeRecommendationsWithBreakdown()`
4. Persist scores to `user_film_scores` table
5. Returns: `{ scores: { filmId: score }, breakdowns: { filmId: CompactBreakdown } }`

#### `GET /api/enrich-batch`

Polls enrichment progress for the current user:

1. Count total watched films
2. Count films with resolved `film_id` (enriched)
3. Count active queue items (pending/processing, retry < 5)
4. Returns: `{ total, processed, done }`

#### `GET /auth/callback`

OAuth callback handler. Exchanges auth code for session, reads return path
from `fc_auth_next` cookie, clears cookie, redirects.

### 5.6 Styling

#### `globals.css` (~1,867 lines)

Dark theme with CSS custom properties:

```css
--bg: #0f0f0f;          /* Main background */
--bg-card: #1a1a1a;     /* Card background */
--bg-hover: #252525;    /* Hover state */
--text: #e0e0e0;        /* Main text */
--text-dim: #999;       /* Dimmed text */
--accent: #ff6b6b;      /* Accent color (coral red) */
--border: #333;         /* Border color */
--rating-gold: #f5c518; /* Letterboxd rating color */
```

**Layouts:**
- Filters: 13-column grid (responsive → stacked on mobile)
- Film grid: 3-column auto-fill (responsive → single column on mobile)
- Cards: Flexbox with header, genres row, sessions list

**Key features:**
- Dual-thumb year range slider with gradient track
- Custom toggle switch (checkbox → slider)
- Modal overlays with 220ms fade animation
- Match score badges with color gradients
- Responsive breakpoints for mobile

---

## 6. Database Schema

### Core Tables

#### `films`

Master film table with all metadata:

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint (PK) | Auto-increment |
| `title` | text | Film title (Spanish or original) |
| `director` | text | Comma-separated director names |
| `year` | integer | Release year |
| `letterboxd_url` | text | Full Letterboxd URL |
| `letterboxd_short_url` | text (unique) | Short boxd.it URL (dedup key) |
| `letterboxd_rating` | numeric | Letterboxd average (0-5) |
| `letterboxd_viewers` | integer | Number of Letterboxd viewers |
| `genres` | text[] | Genre names from TMDB |
| `country` | text[] | Production countries |
| `primary_language` | text[] | Original language |
| `spoken_languages` | text[] | All spoken languages |
| `tmdb_url` | text | TMDB page URL |
| `tmdb_id` | integer | TMDB numeric ID |
| `runtime_minutes` | integer | Duration |
| `directors` | jsonb | `[{id, name}, ...]` (TMDB person IDs) |
| `top_cast` | jsonb | `[{id, name}, ...]` (top 5 billed) |
| `keywords` | jsonb | `[{id, name}, ...]` (TMDB keywords) |
| `tmdb_rating` | numeric | TMDB average (0-10) |
| `tmdb_votes` | integer | TMDB vote count |
| `production_companies` | jsonb | `[{id, name}, ...]` |
| `collection_name` | text | Franchise name |
| `collection_id` | integer | TMDB collection ID |
| `overview` | text | Plot summary |
| `tagline` | text | Marketing tagline |
| `title_original` | text | Original language title |
| `title_en` | text | English title |
| `title_es` | text | Spanish title |

#### `screenings`

Individual screening sessions (many-to-one with films):

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint (PK) | Auto-increment |
| `film_id` | bigint (FK → films) | Parent film |
| `showtime` | timestamptz | Session date/time |
| `location` | text | Cinema/room name |
| `url_tickets` | text | Direct booking link |
| `url_info` | text | Film info page link |
| `version` | text | "dubbed", "VOSE", or null |

Unique constraint: `(film_id, showtime, location)`. Cascade delete with parent film.

#### `film_enrichment_queue`

Background job queue for TMDB/Letterboxd enrichment:

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigint (PK) | Job ID |
| `letterboxd_short_url` | text (unique) | Film to enrich |
| `status` | enum | `pending`, `processing`, `done`, `failed` |
| `requested_by` | uuid (FK) | User who triggered enrichment |
| `retry_count` | integer | Failed attempt count (max 5) |
| `tmdb_url_override` | text | Manual override for TMDB lookup |
| `locked_at` | timestamptz | When worker acquired item |

INSERT trigger invokes the Edge Function. pg_cron polls every 3 minutes.

### User Tables

#### `user_preferences`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid (PK, FK) | Auth user |
| `lang` | enum ('es','en') | Language preference |
| `watchlist_active` | boolean | Watchlist filter toggle |
| `watched_active` | boolean | Watched filter toggle |

#### `user_watched_films`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid (FK) | Auth user |
| `letterboxd_short_url` | text | Letterboxd film ID |
| `film_id` | bigint (FK → films) | Resolved link (set by trigger) |
| `rating` | numeric(2,1) | User's 0.5-5.0 star rating |
| `liked` | boolean | Letterboxd heart |
| `watched_date` | date | When they watched it |

PK: `(user_id, letterboxd_short_url)`. `film_id` is auto-set by `resolve_user_film_ids()` trigger.

#### `user_watchlist_films`

Same structure as `user_watched_films` without rating/liked/watched_date fields.

#### `user_film_scores`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid (FK) | Auth user |
| `film_id` | bigint (FK → films) | Screened film |
| `score` | smallint | Match percentage (0-100) |
| `computed_at` | timestamptz | When scored |

### Row Level Security

All tables have RLS enabled:
- **Public read** on `films` and `screenings`
- **User CRUD own rows** on user_* tables
- **Service role** can read/write everything (for backend scripts)

### Database Functions

| Function | Purpose |
|----------|---------|
| `take_enrichment_batch(size)` | Atomic, concurrent-safe batch acquisition with advisory lock |
| `invoke_enrichment_edge_function(source)` | HTTP POST to Edge Function via pg_net |
| `cron_process_enrichment()` | pg_cron handler, checks queue and invokes function |
| `resolve_user_film_ids()` | Trigger: links user_watched/watchlist to films by short_url |
| `update_updated_at()` | Trigger: auto-set `updated_at = now()` |
| `retry_enrichment_with_tmdb_url(url, tmdb)` | Manual retry with TMDB URL override |

---

## 7. Edge Functions

### `process-enrichment` (Deno/TypeScript)

Background worker that enriches films with Letterboxd and TMDB metadata.

**Trigger:** INSERT into `film_enrichment_queue` → database trigger → HTTP POST.
Also called by pg_cron every 3 minutes.

**Workflow per batch:**

1. Call `take_enrichment_batch(30)` RPC to atomically grab pending items
2. For each item:
   - Resolve short URL (boxd.it → full letterboxd.com)
   - Scrape Letterboxd page with cheerio (rating, TMDB link)
   - Fetch TMDB API (genres, cast, directors, keywords, translations)
   - Upsert enriched film into `films` table
   - Mark queue item as `done` (or `failed` if max retries exceeded)
3. If more pending items: POST to self with incremented `chain_depth`

**Concurrency control:**
- Max 5 concurrent workers (enforced by database advisory lock)
- Stale items (locked > 5 minutes) auto-reset to `pending`
- Max 5 retries before marking as `failed`
- Max chain depth of 50 (prevents infinite recursion)

**Rate limiting:** 300ms delay between TMDB API calls.

---

## 8. Recommendation Algorithm

The recommendation system uses **content-based collaborative filtering** with
**cosine similarity** on sparse feature vectors.

### Feature Weights

```
keyword:    20%   — Thematic tags (highest weight, most discriminating)
director:   14%   — TMDB person IDs
cast:       14%   — Top 5 billed actors (billing-order weighted)
genre:      10%   — Genre names (divided by max(count, 3) to prevent dominance)
decade:      8%   — Year bucketed into decades ("1970s", "pre-1960", etc.)
country:     8%   — Production countries
language:    6%   — Union of primary + spoken languages
company:     6%   — Top 3 production companies
rating:      6%   — Normalized: Letterboxd÷5 averaged with TMDB÷10
collection:  4%   — Franchise/collection ID
runtime:     4%   — Bucketed: short (<90m), medium (90-120), long (120-150), epic (>150)
```

### How It Works

**1. Film → Feature Vector**

Each film is converted to a sparse vector of weighted features:

```
{
  "genre:Drama":     0.033,    // 0.10 / 3 (min divisor)
  "genre:Comedy":    0.033,
  "director:id:1234": 0.14,
  "cast:id:5678":    0.056,   // 0.14 × (5-0)/(5×(5+1)/2) = billing weight
  "keyword:id:42":   0.020,   // 0.20 / 10 (max keywords)
  "decade:1990s":    0.08,
  "country:France":  0.04,
  "lang:French":     0.03,
  "company:id:99":   0.02,
  "rating:0.82":     0.06,
  "runtime:medium":  0.04,
  ...
}
```

**2. User → Taste Profile**

The user's watched films are aggregated into a taste profile:

```python
for film in watched_films:
    weight = user_rating / 5.0   # default 3.0 if unrated
    for feature, value in film_vector.items():
        profile[feature] += value * weight
    total_weight += weight

profile = { k: v / total_weight for k, v in profile.items() }
```

Films rated 5★ contribute 2× more than films rated 2.5★.

**3. Score Computation**

For each screened film:

```
similarity = cosine_similarity(user_profile, film_vector)  // 0.0 - 1.0
coverage   = sqrt(feature_coverage)                        // penalty for missing metadata
boost      = 1 + min(0.05, log10(viewers) / 150)          // gentle popularity tiebreaker
score      = min(100, round(similarity × coverage × boost × 100))
```

**Coverage** is the fraction of total feature weight that has actual data.
A film with missing keywords/cast/directors will score lower than one with
complete metadata, all else being equal.

**Popularity boost** is capped at 5% and log-scaled, preventing blockbusters
from dominating while providing a gentle tiebreaker.

### Score Breakdown

The API returns a `CompactBreakdown` for each scored film:

```typescript
{
  coverage: 0.85,           // 85% of features had data
  byCategory: {
    keyword: 0.35,          // 35% of score came from keyword matches
    director: 0.25,         // 25% from director match
    cast: 0.15,             // etc.
    genre: 0.10,
    decade: 0.08,
    country: 0.07,
  }
}
```

This powers the tooltip on match score badges in the UI.

### Dual Implementation

The algorithm is implemented identically in two places:

1. **`scripts/compute_scores.py`** — Python batch computation for all users (cron job)
2. **`web/src/lib/recommender.ts`** — TypeScript real-time computation in API route

Both use the same feature weights, bucketing logic, and scoring formula.

---

## 9. Static Site (Legacy)

The original deployment at `docs/` serves a static GitHub Pages site.

### `docs/index.html`

Full-featured HTML page with:
- Filter bar (date, search, theater, year range, Letterboxd CSV upload)
- Film grid with infinite scroll
- Session action modals
- Dark theme
- SEO meta tags, JSON-LD structured data, Google Analytics

### `docs/app.js` (~1,700 lines)

Vanilla JavaScript client-side renderer:
- Fetches `screenings.json` on load
- Filters/sorts/paginates films entirely client-side
- PapaParse for CSV import
- URL parameter persistence

### `docs/screenings.json`

Master data file containing all films and screenings. Updated by the Python
merge command. This is the single source of truth for the static site.

### `docs/style.css`

~800 lines of responsive dark-theme CSS. Shared visual design with the Next.js frontend.

---

## 10. Testing

### Python Tests (pytest)

**197 tests** across 10+ test files in `tests/`.

Each scraper has a corresponding test file (e.g., `test_cineteca.py`) that tests:
- Cinema info validation (name, key, base URL)
- URL construction for specific dates
- Film list parsing from HTML fixtures
- Film page parsing (title, director, year, dates)
- Ticket URL and session date extraction

**Fixtures** are saved HTML files in `tests/fixtures/<cinema_key>/`:
- `day_listing.html` — Sample listing page
- `film_page.html` — Sample film detail page

`conftest.py` provides fixtures for loading HTML and skipping if fixtures are placeholders.

`test_tmdb.py` tests TMDB URL parsing and response parsing with sample API payloads.

### TypeScript Tests (Vitest)

**44 tests** in `web/src/lib/recommender.test.ts`.

Tests cover:
- Feature vector extraction (genres, directors, cast, keywords, decades, etc.)
- Cosine similarity math
- Popularity boost calculations
- User profile building from watched films
- Full scoring pipeline (realistic scenarios)
- Edge cases: missing metadata, unrated films, empty profiles

Run with: `cd web && npx vitest run`

---

## 11. Deployment

### GitHub Pages (Static Site)

Changes to `docs/` on the `main` branch auto-deploy via GitHub Pages.
No build step required — purely static files.

### Vercel (Next.js Frontend)

1. Connect GitHub repo to Vercel
2. Set root directory to `web/`
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_GA_ID` (optional)
4. Auto-deploys on push

### Supabase

1. Create project at supabase.com
2. Run `supabase/schema.sql` to create tables
3. Run migrations from `supabase/migrations/`
4. Deploy edge function: `supabase functions deploy process-enrichment`
5. Set secrets: `supabase secrets set TMDB_API_KEY=...`
6. Configure vault secrets for pg_cron (see `enrichment_background.sql`)

### Typical Update Workflow

```bash
# 1. Scrape current week's screenings
python main.py scrape --start-date 2025-03-24 --end-date 2025-03-30

# 2. Match to Letterboxd (uses cached URLs)
python main.py match --input films_raw.csv --cache docs/screenings.json

# 3. Merge into master JSON (fetches metadata)
python main.py merge --input films_matched.csv

# 4. Upload to Supabase
python scripts/upload_to_supabase.py

# 5. (Optional) Recompute recommendations
python scripts/compute_scores.py

# 6. Commit and push (triggers both deployments)
git add docs/screenings.json
git commit -m "Update screenings"
git push
```

---

## 12. Configuration & Environment

### Python (.env)

```bash
# Required for merge step (TMDB metadata)
TMDB_API_KEY=<v3-api-key or v4-jwt-token>

# Required for Supabase scripts
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

### Next.js (.env.local)

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Optional
NEXT_PUBLIC_GA_ID=G-FKN0ELREQD
TMDB_API_KEY=<for API route enrichment>
```

### TMDB API Key Formats

- **v3 API Key** (32-char hex): Sent as `?api_key=` query parameter
- **v4 Read Access Token** (JWT with dots): Sent as `Authorization: Bearer` header

Both formats are auto-detected by checking for dots in the token string.

### System Requirements

- **Python 3.10+** (for type hints and zoneinfo)
- **Chrome/Chromium** (for Selenium-based scrapers)
- **Node.js 18+** (for Next.js)

---

## 13. Data Structures

### Master JSON Format (`docs/screenings.json`)

```json
[
  {
    "title": "La Quimera",
    "director": "Alice Rohrwacher",
    "year": 2023,
    "dates": [
      {
        "timestamp": "2025-03-24 18:30",
        "location": "Cineteca",
        "url_tickets": "https://entradas.cinetecamadrid.com/...",
        "url_info": "https://www.cinetecamadrid.com/pelicula/la-quimera",
        "version": null
      },
      {
        "timestamp": "2025-03-25 20:00",
        "location": "Princesa",
        "url_tickets": "https://www.cinesrenoir.com/...",
        "url_info": "https://www.cinesrenoir.com/pelicula/la-quimera",
        "version": "dubbed"
      }
    ],
    "letterboxd_url": "https://letterboxd.com/film/la-chimera/",
    "letterboxd_short_url": "https://boxd.it/A1b2C",
    "letterboxd_rating": 3.9,
    "letterboxd_viewers": 45000,
    "tmdb_url": "https://www.themoviedb.org/movie/934632/",
    "tmdb_id": 934632,
    "genres": ["Drama", "Fantasy", "Romance"],
    "country": ["Italy", "France", "Switzerland"],
    "primary_language": ["Italian"],
    "spoken_languages": ["Italian", "English", "French"],
    "runtime_minutes": 130,
    "directors": [{"id": 125025, "name": "Alice Rohrwacher"}],
    "top_cast": [
      {"id": 17419, "name": "Josh O'Connor"},
      {"id": 56731, "name": "Isabella Rossellini"}
    ],
    "keywords": [
      {"id": 818, "name": "based on novel or book"},
      {"id": 4344, "name": "musical"}
    ],
    "tmdb_rating": 7.1,
    "tmdb_votes": 1250,
    "production_companies": [
      {"id": 7319, "name": "Tempesta"}
    ],
    "collection_name": null,
    "collection_id": null,
    "overview": "An English archaeologist...",
    "tagline": "What you seek is seeking you",
    "title_original": "La chimera",
    "title_en": "La Chimera",
    "title_es": "La quimera"
  }
]
```

### CSV Formats

**After scrape:**
```
theater,title,director,year,theater_film_link,dates
Cineteca Madrid,La Quimera,Alice Rohrwacher,2023,https://...,[{"timestamp":"2025-03-24 18:30",...}]
```

**After match:**
Same as above plus `letterboxd_url` column.

### Frontend Film Object

After `mapFilmRows()` transforms database rows:

```typescript
{
  id: 42,
  title: "La Quimera",
  titleEn: "La Chimera",
  titleOriginal: "La chimera",
  director: "Alice Rohrwacher",
  year: 2023,
  theater: "Cineteca, Princesa",       // comma-joined locations
  theaterLink: "https://...",           // first url_info found
  dates: [DateEntry, DateEntry, ...],   // processed sessions
  letterboxdUrl: "https://letterboxd.com/film/la-chimera/",
  letterboxdShortUrl: "https://boxd.it/A1b2C",
  rating: 3.9,
  viewers: 45000,
  runtimeMinutes: 130,
  genres: ["Drama", "Fantasy", "Romance"],
  country: ["Italy", "France", "Switzerland"],
  primaryLanguage: ["Italian"],
  spokenLanguages: ["Italian", "English", "French"],
  tmdbUrl: "https://www.themoviedb.org/movie/934632/",
}
```

### Recommendation Score Object

```typescript
{
  filmId: 42,
  score: 78,                   // 0-100 match percentage
  breakdown: {
    coverage: 0.92,            // 92% feature coverage
    byCategory: {
      keyword: 0.30,           // 30% from keyword matches
      director: 0.22,          // 22% from director
      cast: 0.18,
      genre: 0.12,
      country: 0.08,
      decade: 0.05,
      language: 0.03,
      company: 0.02,
    }
  }
}
```
