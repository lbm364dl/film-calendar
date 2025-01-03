import pandas as pd
from urllib.parse import quote_plus, urljoin
from bs4 import BeautifulSoup

from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException

browser = webdriver.Chrome()

df = pd.read_csv("films.csv")
df = df[~df["title"].isna()]
df["year"] = df["year"].astype("Int64")
LETTERBOXD = "https://letterboxd.com"
LETTERBOXD_SEARCH = f"{LETTERBOXD}/search/films/"


def viewers_to_int(viewers):
    if not viewers:
        return None
    elif viewers[-1] == "K":
        return int(float(viewers[:-1]) * 10**3)
    elif viewers[-1] == "M":
        return int(float(viewers[:-1]) * 10**6)
    else:
        return int(viewers)


def wait_and_fetch_text(browser, delay, xpath):
    soup = wait_and_fetch_soup(browser, delay, xpath)
    return soup.text if soup else None


def wait_and_fetch_soup(browser, delay, xpath):
    try:
        watches = WebDriverWait(browser, delay).until(
            EC.presence_of_element_located((
                By.XPATH,
                xpath,
            ))
        )
        return BeautifulSoup(watches.get_attribute("innerHTML"), features="html.parser")
    except TimeoutException:
        return None


def create_url(s):
    search = s["title"]
    if not pd.isna(s["year"]):
        search += f" year:{s['year']}"
    url = urljoin(LETTERBOXD_SEARCH, quote_plus(search))
    print(f"Searching Letterboxd URL {url}...")

    browser.get(url)
    delay = 3  # seconds

    soup = wait_and_fetch_soup(browser, delay, '//ul[contains(@class, "results")]')
    if not soup:
        return pd.Series({
            "letterboxd_url": None,
            "letterboxd_rating": None,
            "letterboxd_viewers": None,
        })

    film_span = soup.find("span", class_="film-title-wrapper")
    if not film_span:
        return pd.Series({
            "letterboxd_url": None,
            "letterboxd_rating": None,
            "letterboxd_viewers": None,
        })

    film_relative_url = film_span.a["href"]
    film_url = urljoin(LETTERBOXD, film_relative_url)
    print(f"Found film url {film_url}")

    browser.get(film_url)

    watches = wait_and_fetch_text(
        browser, delay, '//li[contains(@class, "filmstat-watches")]'
    )
    avg_rating = wait_and_fetch_text(
        browser, delay, '//a[contains(@class, "display-rating")]'
    )

    return pd.Series({
        "letterboxd_url": film_url,
        "letterboxd_rating": avg_rating,
        "letterboxd_viewers": viewers_to_int(watches),
    })


df[["letterboxd_url", "letterboxd_rating", "letterboxd_viewers"]] = df[
    ["title", "year"]
].apply(create_url, axis=1)

df = df.sort_values(by="letterboxd_rating", ascending=False)

df.to_csv("films_with_letterboxd_url.csv", index=False)
