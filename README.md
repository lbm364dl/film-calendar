# Madrid Film Calendar

A tool that scrapes film screenings from independent cinemas in Madrid, matches them to [Letterboxd](https://letterboxd.com), enriches them with Letterboxd + TMDB metadata, stores everything in Supabase (Postgres), and serves them via a Next.js website.

**[→ See the live site](https://madridfilmcalendar.com)**

## Supported cinemas

| Cinema | Scraping method | Update period |
|---|---|---|
| [Cineteca Madrid](https://www.cinetecamadrid.com) | requests + BeautifulSoup | Monthly |
| [Cine Doré / Filmoteca Española](https://entradasfilmoteca.sacatuentrada.es) | requests + BeautifulSoup (paginated) | Monthly |
| [Círculo de Bellas Artes](https://www.circulobellasartes.com) | requests + BeautifulSoup | Weekly (Mon–Sun) |
| [Cines Renoir](https://www.cinesrenoir.com) (Princesa, Retiro, Plaza de España) | Selenium | Weekly |
| [Golem Madrid](https://www.golem.es/golem/golem-madrid) | requests + BeautifulSoup | Weekly |
| [Sala Berlanga](https://salaberlanga.com) | Selenium | Monthly |
| [Cines Embajadores](https://cinesembajadores.es) | requests + BeautifulSoup | Weekly |
| [Cine Paz](https://www.cinepazmadrid.es) | requests + BeautifulSoup | Weekly |
| [Cines Verdi](https://madrid.cines-verdi.com) | requests + BeautifulSoup | Weekly |
| [Sala Equis](https://salaequis.es) | requests + BeautifulSoup + Selenium | Monthly |
| [Cinesa](https://www.cinesa.es) | requests + BeautifulSoup | Weekly |
| [Yelmo Cines](https://yelmocines.es) | requests + BeautifulSoup | Weekly |

See `THEATER_QUIRKS.md` for per-theater publication cadence and known scraper quirks.

## Architecture

```
┌─────────────┐  scrape   ┌──────────────┐  match    ┌──────────────────┐
│ Theater     │ ────────▶ │ <theater>-   │ ────────▶ │ <theater>-       │
│ websites    │           │ scraped.csv  │           │ matched.csv      │
└─────────────┘           └──────────────┘           └────────┬─────────┘
                                                              │ merge
                                                              ▼
                                                     ┌──────────────────┐
                                                     │ Supabase         │
                                                     │ (films +         │
                                                     │  screenings)     │
                                                     └────────┬─────────┘
                                                              │ supabase-js
                                                              ▼
                                                     ┌──────────────────┐
                                                     │ web/ (Next.js)   │
                                                     │ → Vercel         │
                                                     │   madridfilm     │
                                                     │   calendar.com   │
                                                     └──────────────────┘
```

The Python CLI in this repo handles **scrape → match → merge**. Merge writes directly to Supabase and fetches Letterboxd + TMDB metadata for new films along the way. The Next.js app in `web/` reads from Supabase live, so updates are visible immediately after a successful merge.

For a step-by-step setup of Supabase + Vercel (project creation, env vars, custom domain), see `MIGRATION.md`.

For the human-driven CSV-review workflow that surrounds each scrape (per-row analysis, special-session tagging, post-merge audit), see `SCREENING_UPDATE_PROMPT.md`, `SPECIAL_SESSIONS.md`, and `THEATER_QUIRKS.md`. `CLAUDE.md` is the entry point intended for an AI collaborator.

## Setup

```bash
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt

# Supabase Python client is not in requirements.txt — install separately:
pip install supabase
```

The `match` step (and Renoir / Sala Berlanga / part of Sala Equis scraping) requires a working Selenium / ChromeDriver setup.

### Environment variables

Create a `.env` file in the project root:

```bash
# TMDB — used by merge to fetch genres, languages, runtime, etc.
TMDB_API_KEY=your_tmdb_read_access_token

# Supabase — used by merge, status, and any DB-touching command
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...your-secret-key...
```

Loaded automatically via `python-dotenv`. The frontend has its own `web/.env.local` (publishable key, see `web/.env.local.example`).

## CLI usage

```bash
python main.py <command> [options]
```

### `scrape` — Fetch films from cinemas

```bash
# All cinemas, given date range
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31

# Specific cinemas only
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31 \
    --fetch-from dore --fetch-from cineteca

# All cinemas with a specific update period
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-08 --period weekly

# Custom output path
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31 --output mar_raw.csv
```

Available `--fetch-from` values: `dore`, `cineteca`, `circulo-bellas-artes`, `renoir`, `golem`, `sala-berlanga`, `embajadores`, `cine-paz`, `verdi`, `sala-equis`, `cinesa`, `yelmo`.

### `match` — Find Letterboxd URLs

```bash
python main.py match --input films_raw.csv

# Skip rows that already have a letterboxd_url (incremental)
python main.py match --input films_raw.csv --skip-existing
```

Rows whose `special` column is set (e.g. `conference`, `shorts`) are automatically skipped — see `SPECIAL_SESSIONS.md`.

### `merge` — Upsert into Supabase

```bash
# Standard merge: upserts films + screenings, fetches metadata for new films
python main.py merge --input films_matched.csv

# Re-fetch Letterboxd + TMDB metadata for ALL films in the CSV (not only new ones)
python main.py merge --input films_matched.csv --backfill

# Print what would be upserted without writing to the DB
python main.py merge --input films_matched.csv --dry-run
```

Conflict keys: films are upserted on `letterboxd_short_url`; screenings on `(film_id, showtime, location)`.

### `status` — Per-theater coverage report

```bash
python main.py status
```

Queries Supabase and prints session counts + last-session date per theater, sorted by urgency (oldest last-session first). Useful for spotting theaters that need a re-scrape.

### `archive` — Move past sessions to a historical JSON file

> ⚠️ Currently still operates on `docs/screenings.json` (legacy) — not yet ported to Supabase.

```bash
python main.py archive --start-date 2026-02-01 --end-date 2026-02-28 \
    --output old_screenings/2026-02.json

# Preview without writing
python main.py archive --start-date 2026-02-01 --end-date 2026-02-28 \
    --output old_screenings/2026-02.json --dry-run
```

### `seo` — Inject SEO structured data into the legacy static page

> ⚠️ Reads `docs/screenings.json` and writes `docs/index.html` + `docs/sitemap.xml`. The static `docs/` page is kept as a crawlable SEO surface that redirects browsers to `madridfilmcalendar.com`.

```bash
python main.py seo
```

### `new-cinema` — Generate scraper boilerplate

```bash
python main.py new-cinema --key foo --name "Cines Foo" --url https://foo.es
```

Creates `fetch_films/<key>.py` + `tests/fixtures/<key>/` placeholders. See the printed "Next steps" — it lists the manual edits still required (`theaters.py`, `cli.py`, test file).

## Database schema

Defined in `supabase/schema.sql`. The two main tables:

### `films`

One row per Letterboxd-identified film. Holds Letterboxd + TMDB metadata.

| Field | Description |
|---|---|
| `id` | Primary key |
| `title`, `director`, `year` | Basic film info |
| `letterboxd_url`, `letterboxd_short_url` | Letterboxd page (short URL is the upsert conflict key) |
| `letterboxd_rating`, `letterboxd_viewers` | Letterboxd stats |
| `tmdb_url`, `tmdb_id` | TMDB identifiers |
| `genres`, `country`, `primary_language`, `spoken_languages` | Arrays |
| `runtime_minutes`, `tmdb_rating`, `tmdb_votes` | TMDB stats |
| `directors`, `top_cast`, `keywords`, `production_companies` | Arrays |
| `collection_name`, `collection_id` | TMDB collection (e.g. franchise) |
| `overview`, `tagline` | TMDB text |
| `title_original`, `title_en`, `title_es` | Localized titles |
| `poster_path` | TMDB poster path (the frontend builds the full URL) |

### `screenings`

One row per (film, showtime, location). Linked to `films.id` via `film_id`.

| Field | Description |
|---|---|
| `id` | Primary key |
| `film_id` | FK to `films.id` |
| `showtime` | `YYYY-MM-DD HH:MM:00` |
| `location` | Venue name (e.g. `"Cineteca Madrid"`, `"Princesa"`) |
| `url_tickets` | Direct ticket URL |
| `url_info` | Cinema page URL for the film |
| `version` | *(optional)* Audio version, e.g. `"VOSE"`, `"VE"`, `"dubbed"` |
| `special` | *(optional)* Special-session keyword — see `SPECIAL_SESSIONS.md` |

A unique index on `(film_id, showtime, location)` prevents duplicate sessions.

The schema also defines a `film_enrichment_queue` table and `user_preferences` table used by background enrichment and the frontend auth/recommender features respectively.

## Frontend (`web/`)

Next.js app deployed to Vercel. Reads from Supabase via `@supabase/supabase-js` (publishable key, RLS-restricted).

- Search by title or director (accent-insensitive)
- Filter by date, theater, year range, language version, special sessions
- Sort by Letterboxd rating
- Click a session for ticket links + Google Calendar integration
- Filter state persisted in URL (e.g. `?special=1`)
- Dark theme, fully responsive
- Optional Letterboxd-aware affinity scoring for signed-in users

Run locally:

```bash
cd web
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY
npm install
npm run dev    # → http://localhost:3000
```

## Project structure

```
main.py                  CLI entry point
cli.py                   Argument parsing
theaters.py              Scraper registry and dispatch
rate.py                  Letterboxd matching + metadata (Selenium)
tmdb.py                  TMDB API integration
seo.py                   SEO injection for the legacy docs/ static page
json_io.py               Helpers for the legacy docs/screenings.json
commands/                CLI command handlers
  scrape.py
  match.py
  merge.py               Upsert into Supabase + metadata fetch
  status.py              Coverage report from Supabase
  archive.py             (legacy: still uses screenings.json)
  seo.py
  new_cinema.py
fetch_films/             One scraper per cinema (see `theaters.py` registry)
supabase/
  schema.sql             Database schema (run in Supabase SQL Editor)
  migrations/            Schema migrations
  functions/             Edge functions
scripts/                 One-off + maintenance scripts (uploads, backfills, recommender experiments)
web/                     Next.js frontend (deployed to Vercel)
docs/                    Legacy static GitHub Pages site — redirects to madridfilmcalendar.com
old_screenings/          Archived historical sessions (legacy JSON)
tests/
  fixtures/              Saved HTML for offline scraper tests
  test_*.py              Per-cinema unit tests
```

## Running tests

```bash
pytest
```

Scraper tests use saved HTML fixtures so they run offline without hitting live websites.

## Disclaimer

This project relies on web scraping and automated Letterboxd search. Matching may occasionally be wrong (e.g., linking to the wrong film). If you spot a mistake, please open an issue or PR.
