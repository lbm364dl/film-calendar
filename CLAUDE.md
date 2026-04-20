# Project: Madrid Film Calendar

Scrapes Madrid cinema screenings → matches to Letterboxd → merges into **Supabase** (Postgres) → Next.js frontend in `web/` deployed to Vercel reads from Supabase live. See `README.md` for the full overview and `MIGRATION.md` for Supabase/Vercel setup.

## Legacy surfaces to know about

- `docs/screenings.json` is **legacy data**. `merge` does not touch it. It is still read/written by two commands only: `archive` and `seo`. The live data is the Supabase tables `films` + `screenings` (schema in `supabase/schema.sql`).
- `docs/index.html` is a legacy static page that redirects browsers to `madridfilmcalendar.com`; it exists purely as a crawlable SEO surface. The active frontend is `web/` (Next.js on Vercel).

## Pipeline (current)

```
scrape (user)  → <theater>-scraped.csv
analyze (you)  → flag rows + coverage gaps
match (user)   → <theater>-matched.csv  (Selenium → Letterboxd URLs)
analyze (you)  → flag false positives + classify specials
tag (you)      → edit `special` column in matched CSV when confirmed
merge (user)   → upserts films + screenings into Supabase
                 (also fetches Letterboxd + TMDB metadata for new films)
audit (you)    → optional, query Supabase
```

CLI entry: `python main.py {scrape|match|merge|archive|status|seo|new-cinema}`. Merge target is Supabase (`commands/merge.py:_upsert_to_supabase`). `status` shows per-theater coverage from Supabase.

## Screening update workflow (most common task)

When the user says "upload new sessions", "do a screening update", "phase 1", "stage 1", or shares a `*-scraped.csv` / `*-matched.csv`:

1. **Load these three docs first** (operating manual — don't improvise):
   - `SCREENING_UPDATE_PROMPT.md` — stage-by-stage instructions addressed to you. Treat it as your prompt.
   - `SPECIAL_SESSIONS.md` — special-session keywords + how the `special` column flows through match/merge.
   - `THEATER_QUIRKS.md` — per-theater publication cadence + known scraper quirks. Read before flagging coverage gaps.

2. Then follow the stages:
   - Stage 1 — analyze scraped CSV (per-row concerns + coverage check).
   - Stage 2 — analyze matched CSV (false-positive matches + special-session classification).
   - Stage 3 — edit the matched CSV's `special` column when told (mind the LF line-endings warning in the prompt doc).
   - Stage 4 — optional post-merge audit. Targets **Supabase**, not screenings.json. Use either:
     - `python main.py status` for per-theater session counts, or
     - the `mcp__plugin_supabase_supabase__*` MCP tools (`execute_sql`, `list_tables`) if you need ad-hoc queries.
     - Note: `SCREENING_UPDATE_PROMPT.md` Stage 4 still mentions `docs/screenings.json` as a possible target — ignore that, Supabase is the only target now.

## Hard rules

- Never edit `<theater>-scraped.csv`. Only `<theater>-matched.csv`, and only in Stage 3.
- CSV edits must preserve Unix LF line endings (see Stage 3 warning in `SCREENING_UPDATE_PROMPT.md`).
- The user runs `scrape | match | merge`. You never run those — only analyze and (when told) edit the matched CSV.
- Wait at each stage handoff. Don't jump ahead.
- Be terse — lists over prose.
