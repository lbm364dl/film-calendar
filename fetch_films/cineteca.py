import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from dateutil.rrule import rrule, DAILY
from urllib.parse import urljoin

FILMOTECA = (
    "https://www.cinetecamadrid.com/programacion"  # ?to=2025-01-15&since=2025-01-15"
)
CINETECA = "Cineteca Madrid"
HEADERS = {"User-Agent": "Chrome/131.0.0.0"}


def get_film_dates(soup, date):
    dates = soup.find(class_="sb-sessions__items")
    days = [
        day.text.split(" ")[1]
        for day in dates.findAll("h4", class_="sb-sessions__date-day")
    ]
    hours = [
        hour.text.split(" ")[0]
        for hour in dates.findAll("li", class_="sb-sessions__date-hours-hour")
    ]
    return [
        f"{date.year:04}-{date.month:02}-{day:02} {hour}"
        for day, hour in zip(days, hours)
    ]


def fetch_films_from_date_range(start_date, end_date):
    films = []
    for day in rrule(DAILY, dtstart=start_date, until=end_date):
        print(f"Checking day {day.date()}...")
        films += fetch_films(day)

    return films


def fetch_films(day):
    url = f"https://www.cinetecamadrid.com/programacion?to={day.date()}&since={day.date()}"
    print(f"Fetching films from url {url}")
    soup = BeautifulSoup(
        requests.get(url, headers=HEADERS).text, features="html.parser"
    )
    films = [
        urljoin(FILMOTECA, film["href"].replace("ListaSesiones", "FichaPelicula"))
        for h2 in soup.findAll("h2", class_="title")
        for film in h2.findAll("a")
    ]
    films_info = []
    for film_url in films:
        soup = BeautifulSoup(
            requests.get(film_url, headers=HEADERS).text, features="html.parser"
        )
        film_dates = get_film_dates(soup, day)
        film_details = soup.find("div", class_="tit-ficha")
        film_title = film_details.find("h2", class_="title").text.strip()
        film_year = film_details.find("div", class_=re.compile(r"ano-filmacion"))
        film_year = film_year.text.strip() if film_year else None
        film_director = film_details.find("div", class_=re.compile(r"director"))
        film_director = film_director.text.strip() if film_director else None

        films_info.append({
            "theater": CINETECA,
            "title": film_title,
            "director": film_director,
            "year": film_year,
            "theater_film_link": film_url,
            "dates": film_dates,
        })
        print(f"\tFetched film {films_info[-1]['title']}")

    return films_info
