"""Small utility functions for Letterboxd integration."""

import json
import re

from bs4 import BeautifulSoup
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


def parse_ld_json(soup):
    """Extract and parse LD+JSON data from a BeautifulSoup page."""
    for script in soup.find_all("script", type="application/ld+json"):
        if script.string:
            try:
                cleaned = script.string.strip()
                if "CDATA" in cleaned:
                    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL).strip()
                return json.loads(cleaned)
            except (json.JSONDecodeError, ValueError):
                continue
    return {}


def wait_and_fetch_text(browser, delay, xpath):
    """Wait for element and return its text content."""
    soup = wait_and_fetch_soup(browser, delay, xpath)
    return soup.text if soup else None


def wait_and_fetch_soup(browser, delay, xpath):
    """Wait for element and return BeautifulSoup of its innerHTML."""
    try:
        element = WebDriverWait(browser, delay).until(
            EC.presence_of_element_located((By.XPATH, xpath))
        )
        return BeautifulSoup(element.get_attribute("innerHTML"), features="html.parser")
    except TimeoutException:
        return None
