# Candidate cinemas (Madrid) - not yet implemented

Researched 2026-03-25. Excludes cinemas already implemented or in progress (Cinesa, Yelmo).

## Worth considering

### Conde Duque Morasol
- **Website:** https://condeduquemorasol.com/
- **Type:** Mixed mainstream + VOSE, regular + luxury rooms
- **Scraping method:** POST to `ws.pro` endpoint with a `ws-data` token extracted from the cartelera page. Returns JSON with HTML body per date. No Selenium needed (requests + BS4).
- **Concerns:**
  - No director or year available on any page (neither cartelera nor film detail pages)
  - Requires extracting a `ws-data` token dynamically from `input.chg-fch[ws-data]`
  - Session labels include `(VOSE)` and `(*6)` for Sala 6 (luxury screen)
- **Volume:** ~7 films/day
- **Verdict:** Moderate effort, missing metadata is the main downside.

### Cines Callao
- **Website:** https://cinescallao.es/cartelera-de-cine/
- **Type:** 2-screen commercial, mainstream only, **no VOSE**
- **Scraping method:** WordPress/Divi, all server-side HTML. Showtimes in structured plain text ("Jueves 19/03 16:00, 18:10"). requests + BS4.
- **Concerns:**
  - Divi uses generic positional CSS classes (not semantic), so parsing relies on text patterns
  - Only Spanish-dubbed mainstream films
- **Verdict:** Easy to implement but low value — no VOSE, pure mainstream.

### Capitol Gran Via
- **Website:** https://www.capitolgranvia.com/en/cine/
- **Type:** 3 halls, cinema + theater, mostly mainstream
- **Scraping method:** Two-step: listing page has titles but no times; detail pages (`/en/cartelera/{slug}/`) have server-side rendered times with `data-tabs="YYYYMMDD"` and ticket links to `capitol.admit-one.eu`. requests + BS4.
- **Concerns:**
  - Need to scrape listing page then each detail page individually
  - Mostly mainstream dubbed films
- **Verdict:** Moderate effort, low priority content.

## Harder to implement

### Palacio de la Prensa
- **Website:** https://palaciodelaprensa.com/
- **Type:** 3 rooms + Sala 0, historic Gran Via cinema, **all films in VOSE**
- **Scraping method:** Pure JavaScript SPA powered by Janto platform (`cdn.janto.es`). The HTML body is just `<div id="web5">`. **Selenium required.**
- **Concerns:**
  - Zero server-side content
  - Janto API (`apiw5.janto.es`) exists but the events endpoint returns 500 errors without proper auth headers set by the JS bundle
  - Reverse-engineering the API is non-trivial
- **Verdict:** High value (all VOSE on Gran Via) but significant technical effort. Best candidate for a Selenium-based scraper if expanding coverage is a priority.

### Pequeño Cine Estudio
- **Website:** https://www.pcineestudio.es/
- **Type:** Single-screen classic/arthouse, Madrid's oldest VO cinema (since 1977)
- **Scraping method:** Wix-hosted SPA with `isSEO: false` (no server-side rendering). **Selenium required.**
- **Concerns:**
  - Obfuscated CSS class names (e.g. `.cwL6XW`, `.sNF2R0`) that change across deployments
  - Wix sites are notoriously fragile to scrape — selectors break frequently
- **Verdict:** Interesting content but high maintenance burden. Not recommended unless there's no alternative data source.

## Not worth the effort

### Casa de América (Cine Iberia)
- **Website:** https://www.casamerica.es/cine
- **Type:** Cultural institution, Latin American cinema programming
- **Scraping method:** Drupal, fully server-side HTML. Easy technically.
- **Concerns:**
  - Only ~1 film per month
  - Showtimes embedded in free-form prose text, not structured fields
- **Verdict:** Too low volume to justify a scraper.

## Seasonal / summer only
- **Cibeles de Cine** (https://www.cibelesdecine.com/) — summer open-air, mk2-operated
- **Autocine Madrid RACE** (https://autocines.com/) — drive-in, year-round but weather-dependent
- **La Estival** (https://www.laestival.com/) — summer, Plaza de España
- **Fescinal** — summer, Parque de la Bombilla
- **CinePlaza de verano** — summer, Matadero Madrid (run by Cineteca)
