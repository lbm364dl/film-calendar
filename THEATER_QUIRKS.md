# Theater scraping quirks

Running notes on when each theater publishes its weekly schedule and which day(s) to re-scrape. Update as new patterns emerge.

## Re-scrape cadence

For a weekly pass (Fri→Thu), the initial Friday scrape often does **not** yet include the full week for several theaters. Plan re-scrapes:

> **How to detect partial publication**: don't trust the date *range*. Look at **sessions per day**. A theater that shows dates running through Sunday but with only 1–3 sessions on Wed–Sun (vs 15–20 earlier in the week) is partially published — the late dates are pre-announced specials/previews, not the full schedule. The cliff day = the last fully-published day. See `SCREENING_UPDATE_PROMPT.md` Stage 1b for the full check.

| Theater | Pattern | Re-scrape |
|---|---|---|
| **Renoir** | Fri update commits Fri–Tue only; Wed/Thu added mid-week. | Re-scrape around **Wednesday**. |
| **Cinesa** | Same pattern — Fri–Tue on Fri update, Wed/Thu added later. | Re-scrape around **Wednesday**. |
| **Yelmo** | Same pattern. | Re-scrape around **Wednesday**. |
| **Cine Paz** | Fri–Tue mostly complete on Fri update; Wed premieres often posted late. | Re-scrape around **Wednesday**. |
| **Embajadores** | Only appears to publish up to **Tuesday** on the Fri update; Tue itself can be partial. | Re-scrape from **Tuesday** onward. |
| **Golem** | Uploads the full 7-day week on Friday. | No re-scrape needed. |
| **Verdi** | Publishes Mon–Thu reliably; **Fri–Sun appears late in the week** (was previously misdiagnosed as "Tuesdays are a dark day" — that was a scraper bug, Verdi *does* program Tuesdays). | Re-scrape **Wed–Thu** to pick up Fri–Sun. |
| **Círculo de Bellas Artes** | Publishes on a **Monday–Sunday** week cycle, out of phase with every other theater. | Scrape separately with its own Mon–Sun date range — don't bundle into the Fri–Thu weekly pass. |

### Monday-scrape observations

For a scrape run on **Monday**, this is what was observed as fully-published. Use these as the expected cliff day when reviewing a Monday scrape; anything further is almost certainly partial and needs a mid-week re-scrape (typically Wed or Thu).

| Theater | Last fully-published day on Mon scrape | Re-scrape |
|---|---|---|
| **Cine Paz** | Tue | Mid-week (Wed+) |
| **Cines Embajadores** | Thu | Thu/Fri |
| **Cines Verdi** | Thu | Thu/Fri |
| **Cines Yelmo** | Tue | Mid-week (Wed+) |
| **Cinesa** | Tue (Wed/Thu already at ~½ baseline, Fri+ absent) | Mid-week (Wed+) |
| **Renoir** | Tue | Mid-week (Wed+) |
| **Golem** | Thu | Thu/Fri |
| **Círculo de Bellas Artes** | Sun (full Mon–Sun on its own cycle) | None |

### Tuesday-scrape observations

For a scrape run on **Tuesday** (concrete sample: Tue 2026-04-21, range 04-21 → 04-30).

| Theater | Last fully-published day on Tue scrape | Re-scrape |
|---|---|---|
| **Cine Paz** | Wed of next week (through end of 9-day window) | None within window |
| **Cines Renoir** | Wed of next week (through end of 9-day window) | None within window |
| **Cines Yelmo** | Wed of next week (next-Thu drops to ~½ baseline) | Thu to pick up next-Thu |
| **Cinesa** | Tue (Wed/Thu already ~½ baseline, Fri+ absent) | Wed+ |
| **Cines Embajadores** | Thu (Fri+ drops to 1–5/day) | Fri/Sat |
| **Cines Verdi** | Thu (Fri+ drops to 0–2/day) | Fri/Sat |

## Known systemic quirks (all scrapers)

- **`year` column is empty across all rows** from golem, renoir, embajadores, cine-paz, verdi, cinesa, yelmo. Match must rely on title + director only.
- Title casing/punctuation varies across theaters for the same film (e.g. `Super Mario Galaxy: La película` vs `Super Mario Galaxy. La Película`). Merge dedupes via Letterboxd URL — spot-check post-merge.
- Director name variants across theaters for the same film (e.g. `Júlia De Paz Solvas` / `Júlia de Paz Solvas` / `Júlia de Paz`). Normal.
