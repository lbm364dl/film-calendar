"""Letterboxd search and film matching."""

import unicodedata

import pandas as pd
from urllib.parse import quote, urljoin

from .browser import create_browser
from .helpers import LETTERBOXD, LETTERBOXD_SEARCH, wait_and_fetch_soup
from .fetch import fetch_letterboxd_info_batch


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

        soup = wait_and_fetch_soup(browser, delay, '//ul[contains(@class, "results")]')
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


def find_letterboxd_url(
    title: str,
    year: str | float | int | None,
    director: str | None = None,
    browser=None,
) -> tuple[str | None, int | None]:
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

    owns_browser = browser is None
    if owns_browser:
        browser = create_browser()

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
        if owns_browser and browser:
            browser.quit()


def match_films(df: pd.DataFrame, skip_existing: bool = False, url_cache: dict = None, title_cache: dict = None) -> pd.DataFrame:
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

    browser = None
    try:
        browser = create_browser()

        for idx in to_match.index:
            row = result.loc[idx]

            cached_url = None
            if url_cache:
                link = row.get("theater_film_link")
                if link and link in url_cache:
                    cached_url = url_cache[link]
                    print(f"  → Found in cache (link): {cached_url}")
            if not cached_url and title_cache:
                title = row.get("title")
                if title and title in title_cache:
                    cached_url = title_cache[title]
                    print(f"  → Found in cache (title): {cached_url} (for '{title}')")

            if cached_url:
                result.at[idx, "letterboxd_url"] = cached_url
            else:
                url, found_year = find_letterboxd_url(
                    row["title"],
                    row.get("year"),
                    row.get("director"),
                    browser=browser,
                )
                result.at[idx, "letterboxd_url"] = url

                if pd.isna(row.get("year")) and found_year:
                    result.at[idx, "year"] = found_year
    finally:
        if browser:
            browser.quit()

    if "year" in result.columns:
        result["year"] = result["year"].astype("Int64")

    return result


def rate_films(df: pd.DataFrame) -> pd.DataFrame:
    """Fetch Letterboxd-specific metadata for films that have a letterboxd_url."""
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
