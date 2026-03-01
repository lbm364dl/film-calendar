# Madrid Film Calendar

A tool that scrapes film screenings from independent cinemas in Madrid, matches them to [Letterboxd](https://letterboxd.com), fetches ratings, and publishes a browsable website.

**[→ See the live site](https://lbm364dl.github.io/film-calendar/)**

## Supported cinemas

| Cinema | Scraping method | Update period |
|---|---|---|
| [Cineteca Madrid](https://www.cinetecamadrid.com) | requests + BeautifulSoup | Monthly |
| [Cine Doré / Filmoteca Española](https://entradasfilmoteca.sacatuentrada.es) | requests + BeautifulSoup (paginated) | Monthly |
| [Círculo de Bellas Artes](https://www.circulobellasartes.com) | requests + BeautifulSoup | Weekly |
| [Cines Renoir](https://www.cinesrenoir.com) (Princesa, Retiro, Plaza de España) | Selenium | Weekly |
| [Golem Madrid](https://www.golem.es/golem/golem-madrid) | requests + BeautifulSoup | Weekly |
| [Sala Berlanga](https://salaberlanga.com) | Selenium | Monthly |
| [Cines Embajadores](https://cinesembajadores.es) | requests + BeautifulSoup | Weekly |
| [Cine Paz](https://www.cinepazmadrid.es) | requests + BeautifulSoup | Weekly |
| [Cines Verdi](https://madrid.cines-verdi.com) | requests + BeautifulSoup | Weekly |
| [Sala Equis](https://salaequis.es) | requests + BeautifulSoup + Selenium | Monthly |

## How it works

The pipeline has four steps, each a CLI subcommand:

```
scrape → match → merge → docs/screenings.json → static website
```

1. **Scrape** — Fetches screening listings from cinema websites for a date range.
2. **Match** — Searches Letterboxd (via Selenium) to find the URL for each film.
3. **Merge** — Consolidates new data into the master `docs/screenings.json`, deduplicating sessions and automatically fetching Letterboxd metadata (rating, viewer count, short URL, TMDB URL), then enriching with TMDB API metadata (genres, countries, languages, titles).
4. **Archive** — Moves past sessions from the live database into historical JSON files.

The website (hosted on GitHub Pages from `docs/`) reads `screenings.json` and renders a filterable, searchable interface.

## Website features

- Search by title or director (accent-insensitive)
- Filter by date, theater, and year range (dual slider)
- Sorted by Letterboxd rating
- Click any session for ticket links and Google Calendar integration
- Filter state persisted in URL
- Dark theme, fully responsive

## Setup

```bash
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt
```

**Note:** The `match` and `merge` steps, as well as scraping Renoir, Sala Berlanga, and Sala Equis, require a working Selenium/ChromeDriver setup.

### TMDB API key setup

Create a local `.env` file in the project root:

```bash
TMDB_API_KEY=your_tmdb_read_access_token
```

The app loads `.env` automatically via `python-dotenv`.

## CLI usage

```bash
python main.py <command> [options]
```

### `scrape` — Fetch films from cinemas

```bash
# Scrape all cinemas for a date range
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31

# Scrape specific cinemas
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31 \
    --fetch-from dore --fetch-from cineteca

# Scrape all weekly-update cinemas
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-08 --period weekly

# Custom output path
python main.py scrape --start-date 2026-03-01 --end-date 2026-03-31 --output mar_raw.csv
```

Available `--fetch-from` values: `dore`, `cineteca`, `circulo-bellas-artes`, `renoir`, `golem`, `sala-berlanga`, `embajadores`, `cine-paz`, `verdi`, `sala-equis`.

### `match` — Find Letterboxd URLs

```bash
python main.py match --input films_raw.csv

# Skip already-matched films (incremental)
python main.py match --input films_raw.csv --skip-existing

# Use master JSON as cache to avoid re-searching known films
python main.py match --input films_raw.csv --cache docs/screenings.json
```

### `merge` — Merge into master JSON

```bash
# Merge into docs/screenings.json (default source of truth)
# Automatically fetches Letterboxd metadata for new films
python main.py merge --input films_matched.csv

# Merge into a different source file
python main.py merge --input films_matched.csv --source my_master.json

# Re-fetch Letterboxd metadata for ALL films in the master JSON
python main.py merge --input films_matched.csv --backfill
```

### `archive` — Move past sessions to a historical file

```bash
# Archive February sessions
python main.py archive --start-date 2026-02-01 --end-date 2026-02-28 \
    --output old_screenings/2026-02.json

# Preview what would happen without writing
python main.py archive --start-date 2026-02-01 --end-date 2026-02-28 \
    --output old_screenings/2026-02.json --dry-run
```

## Project structure

```
main.py                  CLI entry point (scrape/match/merge/archive)
cli.py                   Argument parsing
theaters.py              Scraper registry and dispatch
rate.py                  Letterboxd matching and metadata (Selenium)
tmdb.py                  TMDB API integration (genres, countries, titles)
fetch_films/
  base.py                BaseCinemaScraper ABC + data models
  cineteca.py            Cineteca Madrid scraper
  circulo_bellas_artes.py Círculo de Bellas Artes scraper
  dore.py                Cine Doré scraper
  renoir.py              Cines Renoir scraper (Selenium)
  golem.py               Golem Madrid scraper
  sala_berlanga.py       Sala Berlanga scraper (Selenium)
  embajadores.py         Cines Embajadores scraper
  cine_paz.py            Cine Paz scraper
  verdi.py               Cines Verdi scraper
  sala_equis.py          Sala Equis scraper (partial Selenium)
docs/
  index.html             Website
  app.js                 Frontend logic (filters, rendering, calendar)
  style.css              Styles
  screenings.json        Master data (source of truth)
old_screenings/          Archived historical sessions
tests/
  fixtures/              Saved HTML for offline testing
  test_*.py              Per-cinema unit tests
```

## JSON format

The master `docs/screenings.json` is movie-centric (one object per film):

| Field | Description |
|---|---|
| `title` | Film title |
| `director` | Director name |
| `year` | Release year |
| `dates` | Array of session objects (see below) |
| `letterboxd_url` | Letterboxd film page URL |
| `letterboxd_rating` | Average rating (0–5) |
| `letterboxd_viewers` | Number of Letterboxd viewers |
| `letterboxd_short_url` | Short Letterboxd URL (boxd.it) |
| `genres` | Array of genres |
| `country` | Array of production countries |
| `primary_language` | Array of primary languages |
| `spoken_languages` | Array of spoken languages |
| `runtime_minutes` | Runtime in minutes from TMDB |
| `tmdb_url` | The Movie Database URL |
| `title_original` | Original-language title |
| `title_en` | English title |
| `title_es` | Spanish title |

Each session object in `dates`:

| Field | Description |
|---|---|
| `timestamp` | Screening date/time, e.g. `"2026-03-15 20:30"` |
| `location` | Venue name (e.g. `"Cineteca Madrid"`, `"Princesa"`) |
| `url_tickets` | Direct ticket purchase URL |
| `url_info` | Cinema page URL for the film |
| `version` | *(optional)* Audio version, e.g. `"VOSE"`, `"VE"` |

## Running tests

```bash
pytest
```

Tests use saved HTML fixtures so they run offline without hitting live websites.

## Disclaimer

This project relies on web scraping and automated Letterboxd search. Matching may occasionally be wrong (e.g., linking to the wrong film). If you spot a mistake, please open an issue or PR.
