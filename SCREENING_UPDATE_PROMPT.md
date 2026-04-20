# Screening Update Workflow — Agent Prompt

**You (Claude) are reading this as your instructions.** When the user says something like "do a screening update pass" or "follow `SCREENING_UPDATE_PROMPT.md`", load this file and operate from it. Treat everything below as a prompt addressed to you — not a document for the user to copy. The user runs the CLI steps; you handle analysis and, when told, CSV edits.

## Companion docs you must keep in mind

- `SPECIAL_SESSIONS.md` — canonical list of special-session keywords, classification signals, and how the `special` column flows through match/merge.
- `README.md` — pipeline overview, CSV/JSON schemas, supported theaters and their update cadence (weekly vs. monthly).
- `THEATER_QUIRKS.md` — per-theater publication cadence, re-scrape timing, and known systemic scraper quirks. Read this before Stage 1b so you don't re-flag known patterns (e.g. Verdi closing on Tuesdays).

## Pipeline overview

```
scrape (user) → analyze scraped (you) → match (user) → analyze matched (you)
             → tag specials (you edit CSV) → merge (user) → optional post-merge audit (you)
```

The user runs `python main.py scrape | match | merge`. You analyze intermediate CSVs and edit them only when explicitly told to.

---

## Stage 1 — Scraped CSV review

The user shares one or more `<theater>-scraped.csv` files. Do two things:

### 1a. Per-row concerns

Flag rows with:
- Missing **both** director and year (strong special-session signal).
- Suspicious titles: event prefixes (`Ciclo de`, `Conversa:`, `Presenta:`, `Sesión de cortometrajes`, `Palmarés`, `Masterclass`, `Mesa redonda`, `Coloquio`), numbered series (`#N`, `Sesión I.`), titles that look like talks/showcases.
- Titles joining two works with `+` (could be double feature OR shorts program).
- Director field matching the title subject (artist-talk pattern).
- `Varios autores` / `VV.AA.` directors.
- **Title issues that will trip up matching** (high priority — call these out so the user can fix before `match`):
  - Bilingual titles: Spanish title followed by English (or vice versa) in parentheses/brackets, e.g. `Incontrolable [I swear]`, `Uyariy (Escuchar)`, `El hombre elefante (The Elephant Man)`. Match on Letterboxd will likely fail against the combined string — one title needs to be stripped or the user should manually pick which to search.
  - Suffixes describing format/event, not the film: `- 70mm`, `(10º Aniversario)`, `(Cine con piano en directo)`, `(Desde el Royal Ballet...)`, `- Teatro alla Scala`.
  - Truncated titles (e.g. ends mid-word, cut-off at a fixed character count).
  - Encoding glitches / mojibake.
- Data-quality issues: duplicate rows, malformed `dates`, dates outside the requested range.
- Anything else that looks off — use judgment; this list isn't exhaustive.
- **Punctuation and casing differences across theaters for the same film are NOT worth flagging** (e.g. `Super Mario Galaxy: La película` vs `Super Mario Galaxy. La Película`, `Altas capacidades` vs `Altas Capacidades`). Matching normalizes these; merge dedupes via Letterboxd URL.

Output: concise list grouped by category. Don't classify special types yet — that's Stage 2.

### 1b. Coverage / completeness check

Cross-reference against the theaters in `README.md`:

- Flag theaters **entirely absent** from the CSV that *could* be expected for the date range and `--period`/`--fetch-from` the user used. **Don't assume absence = scraper failure** — common reasons a theater is missing:
  - The user excluded it via `--fetch-from` (only some theaters were targeted).
  - It's already up-to-date in Supabase from a prior scrape and the user only re-scraped the theaters that needed new data.
  - The scraper actually failed silently.
  Just list which weekly theaters are missing and ask the user to confirm which case applies, rather than declaring a failure.
- For each present theater, **always compute sessions-per-day, not just first/last date**. A theater that "covers Mon–Sun" can still be 70% missing if Wed–Sun only has 1–3 sessions per day. The expected pattern of a fully-published commercial week is roughly flat (within a factor of ~2x) across all open days. Use the count breakdown as the actual completeness signal:
  - For each theater, list sessions/day and look for a **cliff** — e.g. `Mon 16, Tue 14, Wed 4, Thu 5, Fri 1, Sat 3` is a Tuesday cliff; the theater is only fully published through Tuesday and the rest are pre-announced specials/events. Flag the cliff day as the last fully-published day.
  - The absolute "low" threshold is theater-dependent: Cinesa/Yelmo run hundreds of sessions/day so a drop from 500 → 80 is a cliff; Cine Paz/Verdi run ~15–25/day so a drop from 20 → 3 is a cliff. Use the prior days as the baseline.
  - A late date with 1–2 sessions is **not** evidence of publication — it's almost certainly a pre-announced special/event/preview. Don't treat it as "covered".
- Flag **date gaps inside the published window**: e.g. a theater has Mon, Tue, Thu but nothing Wed.
- Note any quirks that recur across runs (e.g. "Sala Equis tends to upload the full week late") — if you spot a new quirk, mention it so the user can decide whether to re-scrape later or update `THEATER_QUIRKS.md`.

Output a per-theater table like:

```
| Theater       | Last fully published | Notes                                  |
|---------------|----------------------|----------------------------------------|
| Cine Paz      | Tue 04-21            | Wed onward 1–5/day (cliff). Re-scrape. |
| Embajadores   | Thu 04-23            | Fri onward 1–5/day (cliff).            |
```

The user uses this section to decide which theaters/dates need a re-scrape before moving on.

---

## Stage 2 — Matched CSV + match logs review

The user shares `<theater>-matched.csv` plus stdout/stderr from `python main.py match`. Do two passes.

### Pass A — False-positive Letterboxd matches

Flag suspicious matches. Signals:
- Year mismatch between scraped row and Letterboxd film (especially > 2 years off).
- Director mismatch.
- Generic/short title that could match many films ("Amor", "Casa").
- Matched film is a documentary/short while scraped looks like a feature, or vice versa.
- Country/language implausible for the cinema's program.
- Match-log warnings (low confidence, fallback search, multiple candidates).

Per flagged row: `row | scraped title | matched URL | why it looks wrong | suggested action` (manual URL, blank it, mark special).

### Pass B — Special-session classification

For rows with no match, or where the correct outcome is "no match", decide whether each is a **special session**. Use keywords from `SPECIAL_SESSIONS.md`.

A row can have a **legitimate Letterboxd URL and still be special** (e.g. a film + Q&A → `conference` or `event` depending on framing). Flag those too.

**New keywords are allowed.** If none of the existing keywords (`conference`, `shorts`, `festival`, `event`, `compilation`, `opera`, `ballet`, `theater`, `concert`) fit, propose a new short lowercase keyword and explain why. The user will decide whether to adopt it; if adopted, update `SPECIAL_SESSIONS.md` when told.

Output: `row | title | suggested keyword | one-line reason`. Mark new keywords clearly (e.g. `workshop (NEW)`).

---

## Stage 3 — Apply special tags (only when told)

When the user confirms, edit `<theater>-matched.csv` to set the `special` column on the agreed rows. Preserve all other fields verbatim (quoting, order, whitespace). Report back the exact rows you changed.

**⚠️ Line endings:** the project uses Unix LF line endings. Python's `csv.writer` defaults to writing `\r\n` and will pollute the whole file with `^M` (CR) characters when you round-trip a CSV. To avoid this either (a) set `lineterminator='\n'` on the writer, (b) strip `\r` after writing, or (c) edit the CSV in place with `Edit` instead of rewriting it through `csv.DictWriter`. Verify with `od -c file.csv | head` or `grep -c $'\r' file.csv` before reporting the edit as done.

---

## Stage 4 (optional) — Post-merge audit

After the user runs `merge`, if asked, spot-check **Supabase** (the only merge target — `docs/screenings.json` is legacy and not written by `merge`). Use either:
- `python main.py status` for per-theater session counts + last-session date, or
- the `mcp__plugin_supabase_supabase__*` MCP tools (`execute_sql`, `list_tables`) for ad-hoc queries.

Things to check:
- `screenings.special` populated on the rows you tagged in Stage 3.
- New films have Letterboxd + TMDB metadata populated on the `films` row.
- No duplicate sessions for `(film_id, showtime, location)` (the unique index should prevent this — flag any apparent duplicates as a bug).
- Counts roughly match what the matched CSV implied.

---

## Ground rules

- Be terse. Lists over prose.
- Wait at each stage handoff. Don't jump ahead.
- Never run `match`, `merge`, or `scrape` yourself — the user does.
- Never edit the scraped CSV. Only the matched CSV, and only in Stage 3.
- When uncertain about a classification, say so rather than guessing — the user decides.
- If a CSV is very large, sample sensibly and say what you skipped.
