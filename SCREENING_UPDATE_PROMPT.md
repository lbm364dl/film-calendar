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
- For each **weekly-update** theater in the scraped range, check whether its session count looks plausible for the number of weeks covered. One or two sessions across a full week is suspicious for a commercial weekly-premiere venue (Renoir, Golem, Embajadores, Cine Paz, Verdi, Círculo de Bellas Artes).
- Flag theaters **entirely absent** from the CSV that should be present for the date range and `--period`/`--fetch-from` the user used.
- Flag **date gaps**: e.g. a theater has sessions for Mon–Wed but nothing Thu–Sun.
- Note any quirks that recur across runs (e.g. "Sala Equis tends to upload the full week late", "Verdi often only lists the opening weekend until mid-week") — if you spot a new quirk, mention it so the user can decide whether to re-scrape later.

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

After the user runs `merge`, if asked, spot-check Supabase (or `docs/screenings.json` if that's the target):
- Special tags propagated to session dicts.
- New films have Letterboxd metadata populated.
- No duplicate sessions for `(film, timestamp, location)`.
- Counts roughly match what the matched CSV implied.

---

## Ground rules

- Be terse. Lists over prose.
- Wait at each stage handoff. Don't jump ahead.
- Never run `match`, `merge`, or `scrape` yourself — the user does.
- Never edit the scraped CSV. Only the matched CSV, and only in Stage 3.
- When uncertain about a classification, say so rather than guessing — the user decides.
- If a CSV is very large, sample sensibly and say what you skipped.
