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

def find_letterboxd_url(title: str, year: str | None) -> str | None:
    """Search Letterboxd for a film and return its URL.
    
    Args:
        title: Film title to search for
        year: Film year (optional, improves accuracy)
    
    Returns:
        Letterboxd URL if found, None otherwise
    """
    search = title
    if year and not pd.isna(year):
        # Convert to int to avoid "2019.0" format
        search += f" year:{int(float(year))}"
    
    url = urljoin(LETTERBOXD_SEARCH, quote_plus(search))
    print(f"Searching: {url}")

    browser = webdriver.Chrome()
    try:
        browser.get(url)
        delay = 3  # seconds

        soup = _wait_and_fetch_soup(browser, delay, '//ul[contains(@class, "results")]')
        if not soup:
            return None

        film_span = soup.find("span", class_="film-title-wrapper")
        if not film_span:
            return None

        film_relative_url = film_span.a["href"]
        film_url = urljoin(LETTERBOXD, film_relative_url)
        print(f"  → Found: {film_url}")
        return film_url
    finally:
        browser.quit()


def _match_row(row) -> pd.Series:
    """Apply function for matching a single film row."""
    url = find_letterboxd_url(row["title"], row.get("year"))
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
    for idx in to_match.index:
        row = result.loc[idx]
        url = find_letterboxd_url(row["title"], row.get("year"))
        result.at[idx, "letterboxd_url"] = url
    
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
