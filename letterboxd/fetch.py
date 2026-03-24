"""Fetch Letterboxd metadata from film pages."""

import re
import time

import pandas as pd
import requests as http_requests
from bs4 import BeautifulSoup
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

from .browser import create_browser, dismiss_cookie_consent
from .helpers import LETTERBOXD, REQUESTS_HEADERS


def fetch_letterboxd_info(url: str, browser=None) -> dict:
    """Fetch Letterboxd-specific info from a film page.

    Phase 1 (requests, fast): rating, short_url, tmdb_url
    Phase 2 (Selenium, if browser provided): viewer_count
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

    # Phase 1: Static HTML (requests)
    try:
        resp = http_requests.get(url, headers=REQUESTS_HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Rating from twitter:data2 meta
        meta = soup.find("meta", attrs={"name": "twitter:data2"})
        if meta:
            match = re.search(r"([\d.]+)\s+out of", meta.get("content", ""))
            if match:
                result["letterboxd_rating"] = float(match.group(1))

        # Short URL
        short_url_input = soup.find("input", id=re.compile(r"url-field-film-"))
        if short_url_input:
            result["letterboxd_short_url"] = short_url_input.get("value")

        # TMDB URL
        tmdb_link = soup.find("a", href=re.compile(r"themoviedb\.org/(movie|tv)/"))
        if tmdb_link:
            href = tmdb_link.get("href", "")
            if href:
                result["tmdb_url"] = href if href.endswith("/") else href + "/"

        if not result["tmdb_url"]:
            body = soup.find("body")
            if body:
                tmdb_id = body.get("data-tmdb-id")
                tmdb_type = body.get("data-tmdb-type", "movie")
                if tmdb_id:
                    result["tmdb_url"] = f"https://www.themoviedb.org/{tmdb_type}/{tmdb_id}/"

    except Exception as e:
        print(f"  Phase 1 (requests) error for {url}: {e}")

    # Phase 2: Dynamic content (Selenium)
    if browser:
        try:
            browser.get(url)
            time.sleep(2)

            try:
                WebDriverWait(browser, 8).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, "div.production-statistic.-watches, a.display-rating")
                    )
                )
            except TimeoutException:
                pass

            page_source = browser.page_source
            soup2 = BeautifulSoup(page_source, "html.parser")

            watches_div = soup2.select_one("div.production-statistic.-watches")
            if watches_div:
                aria = watches_div.get("aria-label", "")
                match = re.search(r"Watched by ([\d,]+)", aria.replace("\xa0", " "))
                if match:
                    result["letterboxd_viewers"] = int(match.group(1).replace(",", ""))

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


def fetch_viewers_batch(urls: list[str]):
    """Fetch only viewer counts for multiple Letterboxd URLs.

    Yields viewer counts (int) or None for each URL as they are scraped.
    """
    browser = create_browser()

    try:
        print("  Warming up browser on Letterboxd...")
        browser.get(LETTERBOXD)
        time.sleep(3)
        dismiss_cookie_consent(browser, timeout=3)

        for url in urls:
            url = url.rstrip("/") + "/"
            count = None
            try:
                browser.get(url)
                try:
                    WebDriverWait(browser, 8).until(
                        EC.presence_of_element_located(
                            (By.CSS_SELECTOR, "div.production-statistic.-watches")
                        )
                    )
                except TimeoutException:
                    pass

                soup = BeautifulSoup(browser.page_source, "html.parser")
                watches_div = soup.select_one("div.production-statistic.-watches")
                if watches_div:
                    aria = watches_div.get("aria-label", "")
                    match = re.search(r"Watched by ([\d,]+)", aria.replace("\xa0", " "))
                    if match:
                        count = int(match.group(1).replace(",", ""))
            except Exception as e:
                print(f"  Error fetching viewers for {url}: {e}")
            yield count
    finally:
        browser.quit()


def fetch_letterboxd_info_batch(urls: list[str], use_selenium: bool = True) -> list[dict]:
    """Fetch info for multiple Letterboxd URLs efficiently.

    Opens a single browser session (Selenium) for all URLs.
    """
    results = []
    browser = None

    if use_selenium:
        try:
            browser = create_browser()
            if urls:
                print("  Warming up browser on Letterboxd...")
                browser.get(LETTERBOXD)
                time.sleep(3)
                dismiss_cookie_consent(browser, timeout=3)
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


def fetch_letterboxd_rating(url: str) -> dict:
    """Legacy wrapper around fetch_letterboxd_info."""
    info = fetch_letterboxd_info(url)
    return {
        "letterboxd_rating": info["letterboxd_rating"],
        "letterboxd_viewers": info["letterboxd_viewers"],
    }
