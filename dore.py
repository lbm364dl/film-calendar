import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from dateutil.rrule import rrule, DAILY
from urllib.parse import urljoin

FILMOTECA = "https://entradasfilmoteca.gob.es"
DORE = "Cine doré"


def get_film_dates(dates_text):
    days = re.findall("\d{2}/\d{2}/\d{4}", dates_text)
    hours = re.findall("\d{2}:\d{2}", dates_text)
    return [
        datetime.strptime(f"{day} {hour}", "%d/%m/%Y %H:%M").strftime("%Y-%m-%d %H:%M")
        for day, hour in zip(days, hours)
    ]


def fetch_films_from_date_range(start_date, end_date):
    films = []
    for day in rrule(DAILY, dtstart=start_date, until=end_date):
        print(f"Checking day {day.date()}...")
        url = f"https://entradasfilmoteca.gob.es/Busqueda.aspx?fecha={day.date()}"
        films += fetch_films(url)

    return films


def fetch_films(url):
    print(f"Fetching films from url {url}")
    soup = BeautifulSoup(requests.get(url).text, features="html.parser")
    films = [
        urljoin(FILMOTECA, film["href"].replace("ListaSesiones", "FichaPelicula"))
        for film in soup.findAll("a", string="Comprar")
    ]
    films_info = []
    for film_url in films:
        soup = BeautifulSoup(requests.get(film_url).text, features="html.parser")
        film_details = soup.find(id="textoFicha").h2
        film_dates = get_film_dates(soup.find(id="lateralFicha").text)

        if not film_details.b:
            films_info.append({
                "theater": DORE,
                "title": soup.h1.text.strip(),
                "director": None,
                "year": None,
                "theater_film_link": film_url,
                "dates": film_dates,
            })
            continue

        film_title = film_details.b.text
        rest = film_details.text.replace(film_title, "").strip("\n,() ")
        film_title = film_title.strip("\n,() ")

        rest = re.match(r"(.*), (\d{4})", rest)
        if rest:
            director, year = rest.groups()
        # Probably title name for a special session
        else:
            director, year = None, None

        films_info.append({
            "theater": DORE,
            "title": film_title,
            "director": director,
            "year": year,
            "theater_film_link": film_url,
            "dates": film_dates,
        })
        print(f"\tFetched film {films_info[-1]['title']}")

    return films_info
