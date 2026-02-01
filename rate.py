"""Letterboxd matching and rating functions."""

import pandas as pd
from urllib.parse import quote_plus, urljoin
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

LETTERBOXD = "https://letterboxd.com"
LETTERBOXD_SEARCH = f"{LETTERBOXD}/search/films/"


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
# MATCH STEP: Find Letterboxd URL for a film
# =============================================================================

import unicodedata

def slugify_director(director: str) -> str:
    """Slugify director name for Letterboxd search (e.g. 'François Ozon' -> 'francois-ozon')."""
    if not director:
        return ""
    # Normalize to ASCII
    normalized = unicodedata.normalize("NFKD", director).encode("ascii", "ignore").decode("utf-8")
    return normalized.lower().replace(" ", "-")


def _search_with_browser(browser, title: str, year: int | str | None = None, director: str | None = None) -> tuple[str | None, int | None]:
    """Helper to perform a single search with an open browser."""
    search = title.strip()
    
    if year:
        search += f" year:{year}"
    elif director:
        if not director.startswith("director:"):
             search += f" director:{director}"
        else:
             search += f" {director}"

    url = urljoin(LETTERBOXD_SEARCH, quote_plus(search))
    print(f"Searching: {url}")

    try:
        browser.get(url)
        delay = 3  # seconds

        soup = _wait_and_fetch_soup(browser, delay, '//ul[contains(@class, "results")]')
        if not soup:
            return None, None

        film_span = soup.find("span", class_="film-title-wrapper")
        if not film_span:
            return None, None

        film_relative_url = film_span.a["href"]
        film_url = urljoin(LETTERBOXD, film_relative_url)
        
        # Extract year from metadata
        # There might be multiple small.metadata, some empty.
        # Structure: <span class="film-title-wrapper"><a>Title <small class="metadata"></small></a> <small class="metadata"><a>YEAR</a></small></span>
        # Or sometimes just text in metadata.
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
    """Search Letterboxd for a film and return its URL and Year.
    
    Strategies:
    1. Title + Exact Year (if year exists)
    2. Title + Director (if director exists, try for each director)
    3. Title Only (Fallback)
    
    Args:
        title: Film title
        year: Film year (optional)
        director: Director name(s) (optional)
        
    Returns:
        tuple: (url, found_year) or (None, None)
    """
    
    strategies = []
    
    # Strategy 1: Year based
    if year and not pd.isna(year):
        try:
            target_year = int(float(year))
            strategies.append({"year": target_year})
        except ValueError:
            pass

    # Strategy 3: Director based
    if director and not pd.isna(director):
        # Split by comma in case of multiple directors
        directors = [d.strip() for d in director.split(",")]
        for d in directors:
            slug = slugify_director(d)
            if slug:
                strategies.append({"director": slug})
    
    # Strategy 4: Fallback
    strategies.append({}) # No extra params, just title
        
    browser = webdriver.Chrome()
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


def match_films(df: pd.DataFrame, skip_existing: bool = False) -> pd.DataFrame:
    """Add letterboxd_url column to DataFrame by searching for each film.
    
    Args:
        df: DataFrame with 'title' and optionally 'year' columns
        skip_existing: If True, skip rows that already have a letterboxd_url
    
    Returns:
        DataFrame with 'letterboxd_url' column added
    """
    result = df.copy()
    
    # Initialize letterboxd_url column if not present
    if "letterboxd_url" not in result.columns:
        result["letterboxd_url"] = None
    
    # Determine which rows to process
    if skip_existing:
        mask = result["letterboxd_url"].isna()
        to_match = result[mask]
        print(f"Matching {len(to_match)} new films (skipping {len(result) - len(to_match)} already matched)")
    else:
        to_match = result
        print(f"Matching {len(to_match)} films")
    
    # Match each film
    # Match each film
    for idx in to_match.index:
        row = result.loc[idx]
        url, found_year = find_letterboxd_url(row["title"], row.get("year"), row.get("director"))
        result.at[idx, "letterboxd_url"] = url
        
        # Backfill year if missing and found
        if pd.isna(row.get("year")) and found_year:
            result.at[idx, "year"] = found_year

    # Ensure year is integer type (nullable Int64 handles NaNs)
    if "year" in result.columns:
        result["year"] = result["year"].astype("Int64")
    
    return result


# =============================================================================
# RATE STEP: Fetch rating from Letterboxd URL
# =============================================================================

def fetch_letterboxd_rating(url: str) -> dict:
    """Fetch rating and viewer count from a Letterboxd film page.
    
    Args:
        url: Letterboxd film URL
    
    Returns:
        Dict with 'letterboxd_rating' and 'letterboxd_viewers'
    """
    if not url or pd.isna(url):
        return {"letterboxd_rating": None, "letterboxd_viewers": None}
    
    print(f"Rating: {url}")
    browser = webdriver.Chrome()
    try:
        browser.get(url)
        delay = 3

        watches = _wait_and_fetch_text(
            browser, delay, '//li[contains(@class, "filmstat-watches")]'
        )
        avg_rating = _wait_and_fetch_text(
            browser, delay, '//a[contains(@class, "display-rating")]'
        )

        return {
            "letterboxd_rating": avg_rating,
            "letterboxd_viewers": viewers_to_int(watches),
        }
    finally:
        browser.quit()


def rate_films(df: pd.DataFrame) -> pd.DataFrame:
    """Fetch ratings for films that have a letterboxd_url.
    
    Args:
        df: DataFrame with 'letterboxd_url' column
    
    Returns:
        DataFrame with 'letterboxd_rating' and 'letterboxd_viewers' columns added
    """
    result = df.copy()
    
    if "letterboxd_url" not in result.columns:
        raise ValueError("DataFrame must have 'letterboxd_url' column. Run 'match' step first.")
    
    # Initialize rating columns
    result["letterboxd_rating"] = None
    result["letterboxd_viewers"] = None
    
    # Fetch ratings for each film with a URL
    has_url = result["letterboxd_url"].notna()
    print(f"Fetching ratings for {has_url.sum()} films with Letterboxd URLs")
    
    for idx in result[has_url].index:
        url = result.at[idx, "letterboxd_url"]
        ratings = fetch_letterboxd_rating(url)
        result.at[idx, "letterboxd_rating"] = ratings["letterboxd_rating"]
        result.at[idx, "letterboxd_viewers"] = ratings["letterboxd_viewers"]
    
    # Convert rating to numeric
    result["letterboxd_rating"] = pd.to_numeric(result["letterboxd_rating"], errors="coerce")
    
    return result
