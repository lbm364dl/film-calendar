"""Letterboxd matching and rating functions."""

import json
import re
import unicodedata

import pandas as pd
import requests as http_requests
from bs4 import BeautifulSoup
from urllib.parse import quote, urljoin

import undetected_chromedriver as uc
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

LETTERBOXD = "https://letterboxd.com"
LETTERBOXD_SEARCH = f"{LETTERBOXD}/search/films/"

REQUESTS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


# =============================================================================
# Helpers
# =============================================================================

def _get_chrome_major_version():
    """Detect the installed Chrome major version."""
    import subprocess
    for cmd in ["google-chrome --version", "google-chrome-stable --version",
                "chromium --version", "chromium-browser --version"]:
        try:
            out = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            import re as _re
            m = _re.search(r"(\d+)\.", out)
            if m:
                return int(m.group(1))
        except Exception:
            continue
    return None


def _create_browser():
    """Create a Chrome browser that bypasses Cloudflare bot detection."""
    options = uc.ChromeOptions()
    options.add_argument("--no-first-run")
    options.add_argument("--no-service-autorun")
    options.add_argument("--password-store=basic")
    version = _get_chrome_major_version()
    browser = uc.Chrome(options=options, version_main=version)
    return browser


def _dismiss_cookie_consent(browser, timeout=5):
    """Try to dismiss any cookie consent banner on the page."""
    selectors = [
        # Common cookie consent buttons
        "button.js-cookie-consent",
        "[data-cookie-consent='accept']",
        "button[class*='cookie']" ,
        ".cc-btn.cc-allow",
        ".fc-cta-consent",
        "button.accept-cookies",
        "#onetrust-accept-btn-handler",
        # Generic: any button containing the word 'Accept' in a consent-like context
        ".consent button",
        ".cookie-banner button",
    ]
    for sel in selectors:
        try:
            btn = WebDriverWait(browser, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
            )
            btn.click()
            print("  → Dismissed cookie consent")
            return True
        except (TimeoutException, Exception):
            continue

    # Fallback: look for any button with 'accept' text
    try:
        buttons = browser.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            text = btn.text.strip().lower()
            if text in ("accept", "accept all", "accept cookies", "agree", "ok", "i agree"):
                btn.click()
                print(f"  → Dismissed consent via button: '{btn.text.strip()}'")
                return True
    except Exception:
        pass

    return False

def viewers_to_int(viewers):
    """Convert viewer count string (e.g., '1.5K', '2M') to int."""
    if not viewers:
        return None
    elif viewers[-1] == "K":
        return int(float(viewers[:-1]) * 10**3)
    elif viewers[-1] == "M":
        return int(float(viewers[:-1]) * 10**6)
    else:
        return int(viewers)


def _parse_ld_json(soup):
    """Extract and parse LD+JSON data from a BeautifulSoup page."""
    for script in soup.find_all("script", type="application/ld+json"):
        if script.string:
            try:
                cleaned = script.string.strip()
                # Remove CDATA wrappers
                if "CDATA" in cleaned:
                    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL).strip()
                return json.loads(cleaned)
            except (json.JSONDecodeError, ValueError):
                continue
    return {}


def _wait_and_fetch_text(browser, delay, xpath):
    """Wait for element and return its text content."""
    soup = _wait_and_fetch_soup(browser, delay, xpath)
    return soup.text if soup else None


def _wait_and_fetch_soup(browser, delay, xpath):
    """Wait for element and return BeautifulSoup of its innerHTML."""
    try:
        element = WebDriverWait(browser, delay).until(
            EC.presence_of_element_located((By.XPATH, xpath))
        )
        return BeautifulSoup(element.get_attribute("innerHTML"), features="html.parser")
    except TimeoutException:
        return None


# =============================================================================
# FETCH LETTERBOXD INFO: Get all metadata from a Letterboxd film page
# =============================================================================

def fetch_letterboxd_info(url: str, browser=None) -> dict:
    """Fetch Letterboxd-specific info from a film page.

    Phase 1 (requests, fast): rating, short_url, tmdb_url
    Phase 2 (Selenium, if browser provided): viewer_count

    Additional metadata (genres, countries, languages, titles) is now
    fetched from the TMDB API directly — see tmdb.py.

    Args:
        url: Letterboxd film URL
        browser: Optional Selenium WebDriver instance for dynamic content

    Returns:
        Dict with Letterboxd-specific metadata fields
    """
    result = {
        "letterboxd_rating": None,
        "letterboxd_viewers": None,
        "letterboxd_short_url": None,
        "tmdb_url": None,
    }

    if not url or (isinstance(url, float) and pd.isna(url)):
        return result

    url = url.rstrip("/") + "/"

    # ── Phase 1: Static HTML (requests) ───────────────────────────────────
    try:
        resp = http_requests.get(url, headers=REQUESTS_HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Rating from twitter:data2 meta  ("4.53 out of 5")
        meta = soup.find("meta", attrs={"name": "twitter:data2"})
        if meta:
            match = re.search(r"([\d.]+)\s+out of", meta.get("content", ""))
            if match:
                result["letterboxd_rating"] = float(match.group(1))

        # Short URL from share input
        short_url_input = soup.find("input", id=re.compile(r"url-field-film-"))
        if short_url_input:
            result["letterboxd_short_url"] = short_url_input.get("value")

        # TMDB URL from body data attributes
        body = soup.find("body")
        if body:
            tmdb_id = body.get("data-tmdb-id")
            tmdb_type = body.get("data-tmdb-type", "movie")
            if tmdb_id:
                result["tmdb_url"] = f"https://www.themoviedb.org/{tmdb_type}/{tmdb_id}/"

    except Exception as e:
        print(f"  Phase 1 (requests) error for {url}: {e}")

    # ── Phase 2: Dynamic content (Selenium) ───────────────────────────────
    if browser:
        try:
            browser.get(url)
            delay = 8

            # Wait for page to load past any Cloudflare challenge
            import time
            time.sleep(2)

            # Wait for the stats section to render
            try:
                WebDriverWait(browser, delay).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, "div.production-statistic.-watches, a.display-rating")
                    )
                )
            except TimeoutException:
                pass

            page_source = browser.page_source
            soup2 = BeautifulSoup(page_source, "html.parser")

            # Viewer count from aria-label on watches div
            watches_div = soup2.select_one("div.production-statistic.-watches")
            if watches_div:
                aria = watches_div.get("aria-label", "")
                match = re.search(r"Watched by ([\d,]+)", aria.replace("\xa0", " "))
                if match:
                    result["letterboxd_viewers"] = int(match.group(1).replace(",", ""))

            # Rating from rendered page (backup if Phase 1 missed it)
            if result["letterboxd_rating"] is None:
                rating_el = soup2.find("a", class_="display-rating")
                if rating_el:
                    try:
                        result["letterboxd_rating"] = float(rating_el.text.strip())
                    except ValueError:
                        pass

        except Exception as e:
            print(f"  Phase 2 (Selenium) error for {url}: {e}")

    return result


def fetch_letterboxd_info_batch(urls: list[str], use_selenium: bool = True) -> list[dict]:
    """Fetch info for multiple Letterboxd URLs efficiently.

    Opens a single browser session (Selenium) for all URLs.
    """
    results = []
    browser = None

    if use_selenium:
        try:
            browser = _create_browser()
            # Warm up: navigate to Letterboxd and handle consent/challenge
            if urls:
                print("  Warming up browser on Letterboxd...")
                browser.get(LETTERBOXD)
                import time; time.sleep(3)  # Let Cloudflare challenge resolve
                _dismiss_cookie_consent(browser, timeout=3)
                time.sleep(1)
        except Exception as e:
            print(f"  Failed to start Chrome: {e}. Falling back to requests-only mode.")
            browser = None

    try:
        for i, url in enumerate(urls):
            print(f"  [{i+1}/{len(urls)}] Fetching: {url}")
            info = fetch_letterboxd_info(url, browser=browser)
            results.append(info)
    finally:
        if browser:
            browser.quit()

    return results


# Legacy wrapper for backward compatibility
def fetch_letterboxd_rating(url: str) -> dict:
    """Fetch rating and viewer count from a Letterboxd film page.

    Legacy wrapper around fetch_letterboxd_info.
    """
    info = fetch_letterboxd_info(url)
    return {
        "letterboxd_rating": info["letterboxd_rating"],
        "letterboxd_viewers": info["letterboxd_viewers"],
    }


# =============================================================================
# MATCH STEP: Find Letterboxd URL for a film
# =============================================================================

def slugify_director(director: str) -> str:
    """Slugify director name for Letterboxd search."""
    if not director:
        return ""
    normalized = unicodedata.normalize("NFKD", director).encode("ascii", "ignore").decode("utf-8")
    return normalized.lower().replace(" ", "-")


def _search_with_browser(browser, title: str, year: int | str | None = None, director: str | None = None) -> tuple[str | None, int | None]:
    """Helper to perform a single search with an open browser."""
    search = " ".join(
        title.replace(".", " ").replace("/", "").split()
    )

    if year:
        search += f" year:{year}"
    elif director:
        if not director.startswith("director:"):
            search += f" director:{director}"
        else:
            search += f" {director}"

    url = urljoin(LETTERBOXD_SEARCH, quote(search, safe=""))
    print(f"Searching: {url}")

    try:
        browser.get(url)
        delay = 3

        soup = _wait_and_fetch_soup(browser, delay, '//ul[contains(@class, "results")]')
        if not soup:
            return None, None

        film_span = soup.find("span", class_="film-title-wrapper")
        if not film_span:
            return None, None

        film_relative_url = film_span.a["href"]
        film_url = urljoin(LETTERBOXD, film_relative_url)

        found_year = None
        for metadata in film_span.find_all("small", class_="metadata"):
            text = metadata.text.strip()
            if text and text.isdigit():
                try:
                    found_year = int(text)
                    break
                except ValueError:
                    continue

        print(f"  → Found: {film_url} (Year: {found_year})")
        return film_url, found_year
    except Exception as e:
        print(f"  → Error during search: {e}")
        return None, None


def find_letterboxd_url(title: str, year: str | float | int | None, director: str | None = None) -> tuple[str | None, int | None]:
    """Search Letterboxd for a film and return its URL and Year."""
    strategies = []

    if year and not pd.isna(year):
        try:
            target_year = int(float(year))
            strategies.append({"year": target_year})
        except ValueError:
            pass

    if director and not pd.isna(director):
        directors = [d.strip() for d in director.split(",")]
        for d in directors:
            slug = slugify_director(d)
            if slug:
                strategies.append({"director": slug})

    strategies.append({})

    browser = _create_browser()
    try:
        for params in strategies:
            p_year = params.get("year")
            p_director = params.get("director")

            print(f"Trying search for '{title}' with params={params}...")
            found_url, found_year = _search_with_browser(browser, title, year=p_year, director=p_director)
            if found_url:
                return found_url, found_year

        print("  → Not found after all attempts.")
        return None, None
    finally:
        browser.quit()


def _match_row(row) -> pd.Series:
    """Apply function for matching a single film row."""
    url, _ = find_letterboxd_url(row["title"], row.get("year"), row.get("director"))
    return pd.Series({"letterboxd_url": url})


def match_films(df: pd.DataFrame, skip_existing: bool = False, url_cache: dict = None) -> pd.DataFrame:
    """Add letterboxd_url column to DataFrame by searching for each film."""
    result = df.copy()

    if "letterboxd_url" not in result.columns:
        result["letterboxd_url"] = None

    if skip_existing:
        mask = result["letterboxd_url"].isna()
        to_match = result[mask]
        print(f"Matching {len(to_match)} new films (skipping {len(result) - len(to_match)} already matched)")
    else:
        to_match = result
        print(f"Matching {len(to_match)} films")

    for idx in to_match.index:
        row = result.loc[idx]

        cached_url = None
        if url_cache:
            link = row.get("theater_film_link")
            if link and link in url_cache:
                cached_url = url_cache[link]
                print(f"  → Found in cache: {cached_url} (for {link})")

        if cached_url:
            result.at[idx, "letterboxd_url"] = cached_url
        else:
            url, found_year = find_letterboxd_url(row["title"], row.get("year"), row.get("director"))
            result.at[idx, "letterboxd_url"] = url

            if pd.isna(row.get("year")) and found_year:
                result.at[idx, "year"] = found_year

    if "year" in result.columns:
        result["year"] = result["year"].astype("Int64")

    return result


# =============================================================================
# RATE STEP: Fetch all Letterboxd info for matched films
# =============================================================================

def rate_films(df: pd.DataFrame) -> pd.DataFrame:
    """Fetch Letterboxd-specific metadata for films that have a letterboxd_url.

    Adds columns: letterboxd_rating, letterboxd_viewers, letterboxd_short_url, tmdb_url
    """
    result = df.copy()

    if "letterboxd_url" not in result.columns:
        raise ValueError("DataFrame must have 'letterboxd_url' column. Run 'match' step first.")

    new_cols = [
        "letterboxd_rating", "letterboxd_viewers", "letterboxd_short_url", "tmdb_url",
    ]
    for col in new_cols:
        if col not in result.columns:
            result[col] = None

    has_url = result["letterboxd_url"].notna()
    urls_to_fetch = result.loc[has_url, "letterboxd_url"].tolist()
    indices = result[has_url].index.tolist()

    print(f"Fetching Letterboxd info for {len(urls_to_fetch)} films...")

    infos = fetch_letterboxd_info_batch(urls_to_fetch, use_selenium=True)

    for idx, info in zip(indices, infos):
        for key in new_cols:
            if info.get(key) is not None:
                result.at[idx, key] = info[key]

    result["letterboxd_rating"] = pd.to_numeric(result["letterboxd_rating"], errors="coerce")

    return result
