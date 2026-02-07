# Madrid Film Calendar

A tool that scrapes film screenings from independent cinemas in Madrid, matches them to [Letterboxd](https://letterboxd.com), fetches ratings, and publishes a browsable website.

**[→ See the live site](https://lbm364dl.github.io/film-calendar/)**

## Supported cinemas

| Cinema | Scraping method | Update period |
|---|---|---|
| [Cineteca Madrid](https://www.cinetecamadrid.com) | requests + BeautifulSoup | Monthly |
| [Cine Doré / Filmoteca Española](https://www.cultura.gob.es/cultura/areas/cine/mc/fe/difusion/programa.html) | requests + BeautifulSoup (paginated) | Monthly |
| [Cines Renoir](https://www.cinesrenoir.com) (Princesa, Retiro, Plaza de España) | Selenium | Weekly |
| [Golem Madrid](https://golem.es/golem/golem-madrid) | requests + BeautifulSoup | Weekly |
| [Sala Berlanga](https://salaberlanga.com) | Selenium | Monthly |

## How it works

The pipeline has four steps, each a CLI subcommand:

```
scrape → match → rate → merge → docs/screenings.csv → static website
```

1. **Scrape** — Fetches screening listings from cinema websites for a date range.
2. **Match** — Searches Letterboxd (via Selenium) to find the URL for each film.
3. **Rate** — Scrapes the Letterboxd rating and viewer count for matched films.
4. **Merge** — Consolidates new data into the master `docs/screenings.csv`, deduplicating sessions and preserving manual fixes.

The website (hosted on GitHub Pages from `docs/`) reads `screenings.csv` and renders a filterable, searchable interface.

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
source env/bin/activate        # Linux/macOS
# env\Scripts\activate         # Windows
pip install -r requirements.txt
```

**Note:** The `match` and `rate` steps, as well as scraping Renoir and Sala Berlanga, require a working Selenium/ChromeDriver setup.

## CLI usage

```bash
python main.py <command> [options]
```

### `scrape` — Fetch films from cinemas

```bash
# Scrape all cinemas for a date range
python main.py scrape --start-date 2026-02-01 --end-date 2026-02-28

# Scrape specific cinemas
python main.py scrape --start-date 2026-02-01 --end-date 2026-02-28 \
    --fetch-from dore --fetch-from cineteca

# Scrape all weekly-update cinemas
python main.py scrape --start-date 2026-02-01 --end-date 2026-02-08 --period weekly

# Custom output path
python main.py scrape --start-date 2026-02-01 --end-date 2026-02-28 --output feb_raw.csv
```

### `match` — Find Letterboxd URLs

```bash
python main.py match --input films_raw.csv

# Skip already-matched films (incremental)
python main.py match --input films_raw.csv --skip-existing

# Use master CSV as cache to avoid re-searching known films
python main.py match --input films_raw.csv --cache docs/screenings.csv
```

### `rate` — Fetch Letterboxd ratings

```bash
python main.py rate --input films_matched.csv
```

### `merge` — Merge into master CSV

```bash
# Merge into docs/screenings.csv (default source of truth)
python main.py merge --input films_rated.csv

# Merge into a different source file
python main.py merge --input films_rated.csv --source my_master.csv
```

### `new-cinema` — Generate boilerplate for a new scraper

```bash
python main.py new-cinema --key embajadores --name "Cines Embajadores" --url "https://example.com"
```

This creates the scraper file, test file, and fixture directories with a working template.

## Project structure

```
main.py                  CLI entry point (scrape/match/rate/merge/new-cinema)
cli.py                   Argument parsing and boilerplate generator
theaters.py              Scraper registry and dispatch
rate.py                  Letterboxd matching and rating (Selenium)
fetch_films/
  base.py                BaseCinemaScraper ABC + data models
  cineteca.py            Cineteca Madrid scraper
  dore.py                Cine Doré scraper
  renoir.py              Cines Renoir scraper (Selenium)
  golem.py               Golem Madrid scraper
  sala_berlanga.py        Sala Berlanga scraper (Selenium)
docs/
  index.html             Website
  app.js                 Frontend logic (filters, rendering, calendar)
  style.css              Styles
  screenings.csv         Master data (source of truth)
tests/
  fixtures/              Saved HTML for offline testing
  test_*.py              Per-cinema unit tests
```

## CSV format

The master `docs/screenings.csv` is movie-centric (one row per film):

| Column | Description |
|---|---|
| `title` | Film title |
| `director` | Director name |
| `year` | Release year |
| `dates` | JSON list of session objects: `[{"timestamp", "location", "url_tickets", "url_info"}]` |
| `letterboxd_url` | Letterboxd film page URL |
| `letterboxd_rating` | Average rating (0–5) |

## Running tests

```bash
pytest
```

Tests use saved HTML fixtures so they run offline without hitting live websites.

## Disclaimer

This project relies on web scraping and automated Letterboxd search. Matching may occasionally be wrong (e.g., linking to the wrong film). If you spot a mistake, please open an issue or PR.
