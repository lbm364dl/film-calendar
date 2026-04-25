"""Lint command - check for broken URLs in non-past screenings."""

import os
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import httpx
import cloudscraper
from dotenv import load_dotenv

# Suppress urllib3/chardet version mismatch warning from cloudscraper's requests dep
warnings.filterwarnings("ignore", category=Warning, module="requests")

load_dotenv()

# Strategy: try httpx first (HTTP/2 + verify=False).
#   - Fixes SSL handshake failures for sites like Verdi and Sala Berlanga whose TLS
#     config is incompatible with Python's OpenSSL stack.
# If httpx returns 403, fall back to cloudscraper with an explicit chrome/windows
# browser config — the default create_scraper() doesn't bypass Cloudflare on
# Yelmo/Cinesa, but an explicit browser dict does.
HEADERS = {"User-Agent": "curl/7.81.0", "Accept": "*/*"}
TIMEOUT = 15
WORKERS = 10

_httpx_client = httpx.Client(http2=True, verify=False, timeout=TIMEOUT, headers=HEADERS)
_cs_client = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "windows", "mobile": False}
)


def _init_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: Set SUPABASE_URL and SUPABASE_SECRET_KEY environment variables.")
        sys.exit(1)
    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        print("Error: Install supabase-py:  pip install supabase")
        sys.exit(1)


def _fetch_screenings(supabase, start_str, end_str):
    """Fetch non-past screenings with their film title, url_tickets, url_info."""
    BATCH = 1000
    results = []
    offset = 0
    query = (
        supabase.table("screenings")
        .select("id, showtime, location, url_tickets, url_info, films(title)")
        .gte("showtime", start_str)
    )
    if end_str:
        query = query.lte("showtime", end_str)
    while True:
        batch = query.range(offset, offset + BATCH - 1).execute()
        if not batch.data:
            break
        results.extend(batch.data)
        if len(batch.data) < BATCH:
            break
        offset += BATCH
    return results


def _check_url(url):
    """Return (url, status_code_or_error_str).

    Tries httpx first (HTTP/2, no SSL verify) to handle sites with TLS configs
    that fail Python's OpenSSL (Verdi, Sala Berlanga).  If that yields a 403,
    falls back to cloudscraper to bypass anti-bot protection (Cinesa, Yelmo).
    """
    try:
        r = _httpx_client.get(url, follow_redirects=True)
        status = r.status_code
    except Exception as e:
        return url, str(e)

    if status == 403:
        try:
            # Don't pass HEADERS here — cloudscraper generates its own browser UA
            # based on the browser config; overriding it with a curl UA causes 403.
            r2 = _cs_client.get(url, timeout=TIMEOUT, allow_redirects=True)
            return url, r2.status_code
        except Exception as e:
            return url, str(e)

    return url, status


def run_lint(args):
    supabase = _init_supabase()

    now = datetime.now()
    start_str = args.start_date.strftime("%Y-%m-%dT%H:%M:%S") if args.start_date else now.strftime("%Y-%m-%dT%H:%M:%S")
    end_str = args.end_date.strftime("%Y-%m-%dT23:59:59") if args.end_date else None

    from_label = start_str[:16].replace("T", " ")
    to_label = f" to {end_str[:10]}" if end_str else " onwards"
    print(f"Fetching screenings from {from_label}{to_label}...")
    screenings = _fetch_screenings(supabase, start_str, end_str)
    print(f"Found {len(screenings)} screenings.\n")

    # Collect unique URLs, tracking which screenings reference each
    url_to_screenings: dict[str, list[dict]] = {}
    for s in screenings:
        title = (s.get("films") or {}).get("title", "Unknown")
        info = {"title": title, "showtime": s["showtime"], "location": s["location"]}
        for field in ("url_tickets", "url_info"):
            url = s.get(field, "")
            if url:
                url_to_screenings.setdefault(url, []).append({**info, "field": field})

    if not url_to_screenings:
        print("No URLs to check.")
        return

    print(f"Checking {len(url_to_screenings)} unique URLs ({WORKERS} parallel)...")

    broken: list[tuple[str, int | str, list[dict]]] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(_check_url, url): url for url in url_to_screenings}
        done = 0
        for future in as_completed(futures):
            done += 1
            url, status = future.result()
            if status != 200:
                broken.append((url, status, url_to_screenings[url]))
            print(f"  [{done}/{len(url_to_screenings)}] {status}  {url[:80]}", end="\r")

    print()  # clear the progress line

    if not broken:
        print("✓ All URLs returned 200.")
        return

    def _print_refs(refs):
        seen = set()
        for r in refs:
            key = (r["title"], r["showtime"], r["location"])
            if key not in seen:
                seen.add(key)
                print(f"    → {r['title']}  {r['showtime'][:16]}  {r['location']}  ({r['field']})")

    print(f"\n✗ {len(broken)} broken URL(s):\n")
    for url, status, refs in sorted(broken, key=lambda x: str(x[1])):
        print(f"  [{status}] {url}")
        _print_refs(refs)
        print()
