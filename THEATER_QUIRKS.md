# Theater scraping quirks

Running notes on when each theater publishes its weekly schedule and which day(s) to re-scrape. Update as new patterns emerge.

## Re-scrape cadence

For a weekly pass (Fri→Thu), the initial Friday scrape often does **not** yet include the full week for several theaters. Plan re-scrapes:

| Theater | Pattern | Re-scrape |
|---|---|---|
| **Renoir** | Fri update commits Fri–Tue only; Wed/Thu added mid-week. | Re-scrape around **Wednesday**. |
| **Cinesa** | Same pattern — Fri–Tue on Fri update, Wed/Thu added later. | Re-scrape around **Wednesday**. |
| **Yelmo** | Same pattern. | Re-scrape around **Wednesday**. |
| **Cine Paz** | Fri–Tue mostly complete on Fri update; Wed premieres often posted late. | Re-scrape around **Wednesday**. |
| **Embajadores** | Only appears to publish up to **Tuesday** on the Fri update; Tue itself can be partial. | Re-scrape from **Tuesday** onward. |
| **Golem** | Uploads the full 7-day week on Friday. | No re-scrape needed. |
| **Verdi** | Publishes full week on Friday **except Tuesdays, which are a dark day** (closed). ⚠️ Always double-check before assuming a Tuesday gap is a scrape miss — may just be closure. | No re-scrape needed, but flag Tue gaps for confirmation. |
| **Círculo de Bellas Artes** | Publishes on a **Monday–Sunday** week cycle, out of phase with every other theater. | Scrape separately with its own Mon–Sun date range — don't bundle into the Fri–Thu weekly pass. |

## Known systemic quirks (all scrapers)

- **`year` column is empty across all rows** from golem, renoir, embajadores, cine-paz, verdi, cinesa, yelmo. Match must rely on title + director only.
- Title casing/punctuation varies across theaters for the same film (e.g. `Super Mario Galaxy: La película` vs `Super Mario Galaxy. La Película`). Merge dedupes via Letterboxd URL — spot-check post-merge.
- Director name variants across theaters for the same film (e.g. `Júlia De Paz Solvas` / `Júlia de Paz Solvas` / `Júlia de Paz`). Normal.
