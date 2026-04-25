"""Scrape command: fetch films from theaters (no Letterboxd)."""

import os
from datetime import datetime

import pandas as pd
import theaters
from dotenv import load_dotenv

load_dotenv()


def _paginate(query, columns):
    """Fetch `columns` from a paginated Supabase query.

    columns: str for a single value per row, list[str] for a tuple per row.
    Returns a set of values or tuples.
    """
    result = set()
    page_size = 1000
    page = 0
    while True:
        rows = query.range(page * page_size, (page + 1) * page_size - 1).execute()
        for row in rows.data:
            if isinstance(columns, str):
                result.add(row[columns])
            else:
                result.add(tuple(row[c] for c in columns))
        if len(rows.data) < page_size:
            break
        page += 1
    return result


def _fetch_known_urls(start_date, end_date):
    """Return (known_ticket_keys, known_info_urls) already in Supabase for the date range.

    known_ticket_keys: set of (url_tickets, "YYYY-MM-DD HH:MM") tuples.
      Uses timestamp alongside url_tickets because some theaters (e.g. Cineteca) reuse
      the same ticket URL across all sessions of a film — the URL alone is not session-specific.
    known_info_urls: set of url_info strings for rows where url_tickets is empty
      (covers theaters like Dore where url_info is already session-specific).
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return set(), set()
    try:
        from supabase import create_client
        supabase = create_client(url, key)
    except ImportError:
        return set(), set()

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d 23:59:59")

    raw_ticket_pairs = _paginate(
        supabase.table("screenings")
        .select("url_tickets, showtime")
        .neq("url_tickets", "")
        .gte("showtime", start_str)
        .lte("showtime", end_str),
        ["url_tickets", "showtime"],
    )
    known_ticket_keys = {
        (url, datetime.strptime(showtime, "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%d %H:%M"))
        for url, showtime in raw_ticket_pairs
    }

    known_info_urls = _paginate(
        supabase.table("screenings")
        .select("url_info")
        .eq("url_tickets", "")
        .neq("url_info", "")
        .gte("showtime", start_str)
        .lte("showtime", end_str),
        "url_info",
    )
    return known_ticket_keys, known_info_urls


def _filter_known_sessions(fetched_films, known_ticket_keys, known_info_urls):
    """Remove sessions already in the DB.

    For sessions with url_tickets: matches on (url_tickets, timestamp) — needed because
    some theaters (e.g. Cineteca) reuse the same ticket URL for all sessions of a film.
    For sessions with only url_info (e.g. Dore): matches on url_info alone, which is
    already session-specific for those theaters.
    Sessions with neither URL are always kept.
    Films with no remaining sessions are dropped entirely.
    """
    if not known_ticket_keys and not known_info_urls:
        return fetched_films

    filtered = []
    dropped_sessions = 0
    dropped_films = 0
    for film in fetched_films:
        dates = film.get("dates", [])
        new_dates = []
        for d in dates:
            ticket = d.get("url_tickets", "")
            info = d.get("url_info", "")
            if ticket:
                if (ticket, d["timestamp"][:16]) not in known_ticket_keys:
                    new_dates.append(d)
            elif info:
                if info not in known_info_urls:
                    new_dates.append(d)
            else:
                new_dates.append(d)
        dropped = len(dates) - len(new_dates)
        dropped_sessions += dropped
        if new_dates:
            filtered.append({**film, "dates": new_dates})
        else:
            dropped_films += 1

    if dropped_sessions:
        print(f"  Dedup: skipped {dropped_sessions} sessions already in DB ({dropped_films} films fully covered)")
    return filtered


def run_scrape(args):
    """Execute the scrape command."""
    start_date = args.start_date
    end_date = args.end_date

    if args.fetch_from:
        theaters_list = args.fetch_from
    elif args.period:
        theaters_list = theaters.get_theaters_by_period(args.period)
    else:
        theaters_list = theaters.all_theaters()
    output_csv = args.output

    fetched_films = []
    for theater in theaters_list:
        fetched_films += theaters.fetch_films(theater, start_date, end_date)

    if not args.skip_dedup:
        known_ticket_urls, known_info_urls = _fetch_known_urls(start_date, end_date)
        fetched_films = _filter_known_sessions(fetched_films, known_ticket_urls, known_info_urls)

    if not fetched_films:
        print("\n✓ No new sessions — all scraped films already in DB.")
        return

    df = (
        pd.DataFrame(fetched_films)
        .drop_duplicates("theater_film_link")
        .sort_values(by="title")
    )
    df = df[~df["title"].isna()]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    if "special" not in df.columns:
        df["special"] = None

    df.to_csv(output_csv, index=False)
    print(f"\n✓ Scraped {len(df)} films → {output_csv}")
    print(f"  Next: python main.py match --input {output_csv}")
