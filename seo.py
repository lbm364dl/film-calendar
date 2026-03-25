"""Build-time SEO injection for film-calendar.

Reads screenings.json and injects into index.html:
  1. ScreeningEvent + MovieTheater JSON-LD structured data
  2. Crawlable <noscript> plain-text film listings

Also updates sitemap.xml with today's date.
"""

import json
import re
from datetime import date, datetime
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "docs"
SCREENINGS_PATH = DOCS_DIR / "screenings.json"
INDEX_PATH = DOCS_DIR / "index.html"
SITEMAP_PATH = DOCS_DIR / "sitemap.xml"

# Maximum number of ScreeningEvent entries to inject (avoid bloating HTML)
MAX_SCREENING_EVENTS = 200

# Cinema addresses in Madrid for structured data
CINEMA_ADDRESSES = {
    "Cineteca Madrid": {
        "streetAddress": "Plaza de Legazpi, 8",
        "postalCode": "28045",
        "url": "https://www.cinetecamadrid.com",
    },
    "Cine Doré": {
        "streetAddress": "Calle de Santa Isabel, 3",
        "postalCode": "28012",
        "url": "https://www.culturaydeporte.gob.es/cultura/areas/cine/mc/fe/portada.html",
    },
    "Sala Berlanga": {
        "streetAddress": "Calle de Andrés Mellado, 53",
        "postalCode": "28015",
        "url": "https://www.berlanga.com",
    },
    "Sala Equis": {
        "streetAddress": "Calle del Duque de Alba, 4",
        "postalCode": "28012",
        "url": "https://www.salaequis.es",
    },
    "Cines Embajadores": {
        "streetAddress": "Glorieta del General Maroto, 2",
        "postalCode": "28012",
        "url": "https://www.cinesembajadores.es",
    },
    "Cine Paz": {
        "streetAddress": "Calle de Fuencarral, 125",
        "postalCode": "28010",
        "url": "https://www.cinepazmadrid.es",
    },
    "Cines Renoir": {
        "streetAddress": "Calle de Martín de los Heros, 12",
        "postalCode": "28008",
        "url": "https://www.cinesrenoir.com",
    },
    "Golem": {
        "streetAddress": "Calle de Martín de los Heros, 14",
        "postalCode": "28008",
        "url": "https://golem.es",
    },
    "Verdi": {
        "streetAddress": "Calle de Bravo Murillo, 28",
        "postalCode": "28015",
        "url": "https://www.cines-verdi.com",
    },
    "Cine Estudio": {
        "streetAddress": "Calle del Pintor Rosales, 34",
        "postalCode": "28008",
        "url": "https://www.circulobellasartes.com",
    },
}


def load_screenings() -> list[dict]:
    """Load screenings from the JSON file."""
    with open(SCREENINGS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_movie_theater(location: str) -> dict:
    """Build a MovieTheater schema object for a cinema."""
    theater = {
        "@type": "MovieTheater",
        "name": location,
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Madrid",
            "addressCountry": "ES",
        },
    }
    info = CINEMA_ADDRESSES.get(location)
    if info:
        theater["address"]["streetAddress"] = info["streetAddress"]
        theater["address"]["postalCode"] = info["postalCode"]
        if info.get("url"):
            theater["url"] = info["url"]
    return theater


def build_screening_events(films: list[dict]) -> list[dict]:
    """Build ScreeningEvent JSON-LD objects from film data.

    Only includes future screenings, capped at MAX_SCREENING_EVENTS.
    """
    today_str = date.today().isoformat()
    events = []

    for film in films:
        title = film.get("title", "Unknown")
        director = film.get("director")
        year = film.get("year")
        runtime = film.get("runtime_minutes")
        # Build the Movie object
        work = {"@type": "Movie", "name": title}
        if director:
            work["director"] = {"@type": "Person", "name": director}
        if year:
            work["dateCreated"] = str(year)
        if runtime:
            work["duration"] = f"PT{runtime}M"

        for session in film.get("dates", []):
            timestamp = session.get("timestamp", "")
            location = session.get("location", "")

            # Only include future sessions
            if timestamp[:10] < today_str:
                continue

            # Build ISO 8601 datetime
            iso_date = timestamp.replace(" ", "T")

            event = {
                "@type": "ScreeningEvent",
                "name": title,
                "startDate": iso_date,
                "eventStatus": "https://schema.org/EventScheduled",
                "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                "location": build_movie_theater(location),
                "workPresented": work,
            }

            # Add ticket offer if available
            url_tickets = session.get("url_tickets")
            if url_tickets:
                event["offers"] = {
                    "@type": "Offer",
                    "url": url_tickets,
                    "availability": "https://schema.org/InStock",
                }

            # Add version info as subtitle language hint
            version = session.get("version", "")
            if "VOSE" in version.upper():
                event["subtitleLanguage"] = "es"

            events.append(event)

            if len(events) >= MAX_SCREENING_EVENTS:
                return events

    return events


def build_theater_schemas(films: list[dict]) -> list[dict]:
    """Build MovieTheater JSON-LD objects for all cinemas referenced in screenings."""
    locations = set()
    for film in films:
        for session in film.get("dates", []):
            loc = session.get("location", "")
            if loc:
                locations.add(loc)

    return [build_movie_theater(loc) for loc in sorted(locations)]


def generate_structured_data_html(films: list[dict]) -> str:
    """Generate all JSON-LD script tags to inject."""
    blocks = []

    # ScreeningEvent list
    events = build_screening_events(films)
    if events:
        screening_ld = {
            "@context": "https://schema.org",
            "@graph": events,
        }
        blocks.append(
            '    <script type="application/ld+json">\n'
            + "    "
            + json.dumps(screening_ld, ensure_ascii=False, separators=(",", ":"))
            + "\n    </script>"
        )

    # MovieTheater entries
    theaters = build_theater_schemas(films)
    if theaters:
        theater_ld = {
            "@context": "https://schema.org",
            "@graph": theaters,
        }
        blocks.append(
            '    <script type="application/ld+json">\n'
            + "    "
            + json.dumps(theater_ld, ensure_ascii=False, separators=(",", ":"))
            + "\n    </script>"
        )

    return "\n".join(blocks)


def generate_noscript_content(films: list[dict]) -> str:
    """Generate crawlable plain-text HTML for the <noscript> section."""
    today_str = date.today().isoformat()
    lines = []

    # Group sessions by date
    sessions_by_date: dict[str, list] = {}
    for film in films:
        title = film.get("title", "")
        director = film.get("director", "")
        year = film.get("year", "")
        for session in film.get("dates", []):
            ts = session.get("timestamp", "")
            if ts[:10] < today_str:
                continue
            day = ts[:10]
            time = ts[11:16] if len(ts) >= 16 else ""
            location = session.get("location", "")
            url_tickets = session.get("url_tickets")
            sessions_by_date.setdefault(day, []).append(
                (time, title, director, year, location, url_tickets)
            )

    # Sort dates and limit output
    max_days = 14
    for day in sorted(sessions_by_date.keys())[:max_days]:
        try:
            day_dt = datetime.strptime(day, "%Y-%m-%d")
            # Format in Spanish: "miércoles 25 de marzo de 2026"
            day_names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
            month_names = [
                "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
                "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
            ]
            day_label = (
                f"{day_names[day_dt.weekday()]} {day_dt.day} de "
                f"{month_names[day_dt.month]} de {day_dt.year}"
            )
        except ValueError:
            day_label = day

        lines.append(f'            <h3>{day_label}</h3>')
        lines.append("            <ul>")

        for time, title, director, year, location, url_tickets in sorted(
            sessions_by_date[day]
        ):
            film_label = f"<strong>{title}</strong>"
            if director:
                film_label += f" — {director}"
            if year:
                film_label += f" ({year})"
            entry = f"{time} · {location} · {film_label}"
            if url_tickets:
                entry = f'<a href="{url_tickets}">{entry}</a>'
            lines.append(f"            <li>{entry}</li>")

        lines.append("            </ul>")

    return "\n".join(lines)


def _replace_section(html: str, marker: str, content: str) -> str:
    """Replace content between BEGIN/END markers, or replace the plain marker.

    Supports both first-run (plain marker) and re-runs (delimited block).
    """
    begin = f"<!-- BEGIN_{marker} -->"
    end = f"<!-- END_{marker} -->"

    wrapped = f"{begin}\n{content}\n    {end}"

    # Try re-run pattern first (replace previous injection)
    pattern = re.compile(
        re.escape(begin) + r".*?" + re.escape(end),
        re.DOTALL,
    )
    if pattern.search(html):
        return pattern.sub(wrapped, html)

    # First-run: replace the plain marker comment
    plain_marker = f"<!-- {marker} -->"
    return html.replace(f"    {plain_marker}", f"    {wrapped}")


def inject_into_html(films: list[dict]) -> None:
    """Inject structured data and noscript content into index.html."""
    html = INDEX_PATH.read_text(encoding="utf-8")

    # Inject structured data
    structured_data = generate_structured_data_html(films)
    html = _replace_section(html, "SEO_STRUCTURED_DATA", structured_data)

    # Inject noscript content
    noscript_content = generate_noscript_content(films)
    html = _replace_section(html, "SEO_NOSCRIPT_CONTENT", noscript_content)

    INDEX_PATH.write_text(html, encoding="utf-8")


def update_sitemap() -> None:
    """Update sitemap.xml lastmod to today's date."""
    today = date.today().isoformat()
    sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
    sitemap = re.sub(
        r"<lastmod>[^<]+</lastmod>",
        f"<lastmod>{today}</lastmod>",
        sitemap,
    )
    SITEMAP_PATH.write_text(sitemap, encoding="utf-8")


def run_seo():
    """Main entry point for SEO injection."""
    print("Loading screenings...")
    films = load_screenings()
    print(f"  {len(films)} films loaded")

    print("Injecting structured data into index.html...")
    inject_into_html(films)

    print("Updating sitemap.xml...")
    update_sitemap()

    # Count what was generated
    events = build_screening_events(films)
    theaters = build_theater_schemas(films)
    print(f"\n✓ SEO injection complete:")
    print(f"  ScreeningEvent entries: {len(events)}")
    print(f"  MovieTheater entries: {len(theaters)}")
    print(f"  Sitemap lastmod: {date.today().isoformat()}")


if __name__ == "__main__":
    run_seo()
