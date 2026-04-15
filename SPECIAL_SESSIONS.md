# Special Sessions Guide

## What are special sessions?

In this project, a "special session" is any screening/event at a cinema that is **not a standard movie screening**. These are events that happen at movie theaters but don't correspond to a single, identifiable film that could be matched on Letterboxd or TMDB.

Each session in the data has an optional `special` field that is either `null` (regular screening) or a short keyword string indicating the type of special session.

## Special session types (keywords)

| Keyword | Description | Examples |
|---------|-------------|----------|
| `conference` | Talks, lectures, Q&As, conversations, masterclasses | "CIMA Conversa: Clara Roquet", "Ciclo de conferencias: Breve historia del blockbuster" |
| `shorts` | Short film program sessions (curated collections of short films) | "Sesión de cortometrajes I - Flamenco García Lorca" |
| `festival` | Festival award screenings, festival program sessions | "Sesión I. Palmarés y Menciones Especiales LA MIRADA TABÚ XII EDICIÓN 2025" |
| `event` | Special events, presentations, artist showcases, DJ sets, parties | "Sala Equis Presenta: Vhz", "Fromzero #6", "Fermín Jiménez Landa, ida y vuelta" |
| `compilation` | Compilations of archival footage, newsreels, or miscellaneous clips | "Las letras en el NO-DO", "Vistas y trucos en el cine de los orígenes" |
| `opera` | Opera broadcasts or recordings screened at theaters | (none in current data) |
| `ballet` | Ballet broadcasts or recordings | (none in current data) |
| `theater` | Theater/play broadcasts or recordings | (none in current data) |
| `concert` | Music concerts or music-focused events | "BTS World Tour Arirang Live Viewing", "La magia K-POP" |
| `live_music` | A regular film (often silent) accompanied by live musicians playing during the screening | "El Héroe Del Río Con Música En Directo" (Keaton w/ live music), "El estudiante novato (Cine con piano en directo)" |
| `double_session` | A single long screening split across two sessions with an intermission, or a double-feature intentionally programmed as one extended event | "Kill Bill: The Whole Bloody Affair - 70mm" |

## How to identify special sessions in scraped data

Use this prompt (or a version of it) when asking an AI to classify sessions from scraped CSV data:

---

### Prompt for AI classification

> I have a CSV of scraped cinema sessions. Each row has: theater, title, theater_film_link, dates, director, year.
>
> For each row, determine if it is a **regular movie screening** or a **special session**. A regular screening is a standard showing of a single identifiable film. A special session is anything else.
>
> **Signals that a session is special (not a regular movie):**
>
> 1. **Title contains event-type prefixes or keywords:**
>    - "Ciclo de conferencias:", "Conversa:", "Presenta:", "Sesión de cortometrajes", "Palmarés", "Masterclass", "Mesa redonda", "Coloquio"
>    - Numbered recurring events like "Fromzero #6", "Sesión I.", "Sesión II."
>
> 2. **Missing both director AND year** — regular films almost always have at least one of these. Missing both is a strong signal of a non-film event.
>
> 3. **Director field matches the title subject** — e.g., title "Fermín Jiménez Landa, ida y vuelta" with director "Fermín Jiménez Landa" suggests an artist talk, not a film directed by that person.
>
> 4. **Director is "Varios/as autores/as", "VV.AA.", "Varios autores"** — multiple unspecified authors suggests a compilation or curated program, not a standard film. **However**, this alone is not definitive: some legitimate film compilations or omnibus films also have multiple directors.
>
> 5. **Title contains "+" joining two works** — e.g., "Circo + Notes on the Circus". This indicates a double feature of short films or a curated program. **However**, some legitimate double features of full-length films exist (e.g., "Calle sin salida + Tierra de España"), so use judgment.
>
> **Things that are NOT special sessions (these are regular films):**
> - A film with its original title in parentheses: "El hombre elefante (The Elephant Man)" — regular film, just has bilingual title
> - A film with an extended Spanish title: "La cosa. El enigma de otro mundo" — regular film with full localized title
> - A double feature of two identifiable full-length films — these are regular screenings (both films should be separate entries ideally)
> - A film missing only year OR only director but not both — likely a real film with incomplete metadata
>
> For each special session, classify it with one of these keywords:
> - `conference` — talks, lectures, Q&As, conversations, masterclasses
> - `shorts` — short film program sessions
> - `festival` — festival award screenings or festival program sessions
> - `event` — special events, presentations, showcases, DJ sets, numbered recurring series
> - `compilation` — compilations of archival footage, newsreels, or miscellaneous clips
> - `opera`, `ballet`, `theater`, `concert` — live arts broadcasts/recordings
>
> Output a list of rows that are special, with the row number, title, and suggested keyword.

---

## How the special field works in the data pipeline

### In the scraped CSV (top-level column)

`special` is a **top-level CSV column**, not buried inside the `dates` dicts. This makes it easy to read, verify, and edit:

```csv
theater,title,theater_film_link,dates,director,year,special
Cineteca Madrid,Cuentos de la luna pálida,...,[...],Kenji Mizoguchi,1953,
Cineteca Madrid,Ciclo de conferencias: Breve historia del blockbuster,...,[...],"Elisa McCausland, Diego Salgado",,conference
Sala Equis,Fromzero #6,...,[...],,,,event
```

Empty/blank `special` column = regular movie screening. A keyword value = special session.

### Match step (skips special sessions)

`match_films()` in `rate.py` automatically skips rows where the `special` column is set. This avoids wasting time searching Letterboxd for conferences, short film programs, etc.

### Merge step (propagates to session dicts)

`run_merge()` in `main.py` reads the top-level `special` column and injects it into every session dict for that row. So `screenings.json` ends up with:

```json
{
    "title": "Ciclo de conferencias: Breve historia del blockbuster",
    "dates": [
        {
            "timestamp": "2026-04-07 18:30",
            "location": "Cineteca Madrid",
            "url_tickets": "...",
            "url_info": "...",
            "special": "conference"
        }
    ]
}
```

### In the UI

- Sessions with a `special` field display a gold badge with the translated type label
- A "Special sessions" filter button in the toolbar toggles visibility to show only films with special sessions
- The filter state is persisted in the URL as `?special=1`
