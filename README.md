Script to fetch movies from Spanish theaters and generate a CSV with their screening dates and Letterboxd link and rating to make the process of choosing a movie to watch easier. Still work in progress.

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
usage: main.py [-h] [--start-date START_DATE] [--end-date END_DATE]

Fetch screening films in theaters between two given dates

options:
  -h, --help            show this help message and exit
  --start-date START_DATE
                        Date from which to start the search. Format YYYY-mm-dd (year-month-day).
  --end-date END_DATE   Date from which to end the search. Format YYYY-mm-dd (year-month-day).
```

To fetch films into a single CSV called `films.csv`, for e.g. January 2025, you would run:
```
python main.py --start-date 2025-01-01 --end-date 2025-01-31
```

After having the CSV output file, run `python rate.py` to get another CSV as output, called `films_with_letterboxd_url.csv`, which will now additionally contain a link to the film on Letterboxd if found, along with film rating and members.
TODO: Integrate both parts of the program into a single run.
