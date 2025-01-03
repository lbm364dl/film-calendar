Script to fetch movies from Spanish theaters and generate a CSV with their screening dates and Letterboxd link and rating to make the process of choosing a movie to watch easier. Still work in progress.

# I only want to see the film calendar

You can check the `calendar` directory and look for the CSV of the month you are interested in. Github can show you the CSV in a pretty way, and if you want to make more complicated manipulations you may consider just downloading the CSV and using your desired tool like Excel or code.

# I want to run the tool myself

The tool uses scraping, so be careful with how much you use it. You can read the rest of the README for more details.

## Prerequisites

It is highly recommended to use a virtual environment. After cloning this repository, from its root directory do the following steps, only the first time:

Linux:
```
python3 -m venv env
source env/bin/activate
python -m pip install -r requirements.txt
```

Windows:
```
python3 -m venv env
env\Scripts\activate
python -m pip install -r requirements.txt
```

On next uses you don't need to repeat all the steps. You only have to activate the environment (refer to second line of previous commands).

## Command line usage

There is a command line tool to run the program.

You can run `python main.py --help` to see the following description:

```
usage: main.py [-h] [--start-date START_DATE] [--end-date END_DATE] [--update-csv UPDATE_CSV] [--fetch-from {dore,cineteca}]

Fetch screening films in theaters between two given dates

options:
  -h, --help            show this help message and exit
  --start-date START_DATE
                        Date from which to start the search. Format YYYY-mm-dd (year-month-day).
  --end-date END_DATE   Date from which to end the search. Format YYYY-mm-dd (year-month-day).
  --update-csv UPDATE_CSV
                        Path of CSV file that already contains films, to add new ones in the same file, removing duplicates.
  --fetch-from {dore,cineteca}
                        Key names of specific theaters you want to fetch films from. For more than one theater, add this option for each one, e.g., --fetch-from dore --fetch-from cineteca
```

To fetch films into a single CSV called for e.g. January 2025, you would run:
```
python main.py --start-date 2025-01-01 --end-date 2025-01-31
```

By default you will get an output CSV called `films_with_letterboxd_url.csv`, which will also contain a link to the film on Letterboxd if found, along with film rating and members.
If you also specify a CSV file path via the `--update-csv` option, the newly fetched films will be added to this file instead of creating a new one. When a given film already exists in the file (which is checked based on the value of `theater_film_link`), this one is kept, ignoring the newly fetched one. This is to favour potentially wrong output data that could have been manually fixed and should be kept that way.

## Supported theaters checklist

- [x] Cine Doré
- [x] Cineteca Matadero
- [ ] Cines Golem Madrid
- [ ] Cines Renoir Madrid (Princesa, Plaza de España, Retiro)
- [ ] Cines Verdi Madrid
- [ ] Sala Berlanga
- [ ] Cines Embajadores
- [ ] Cine Paz Madrid
