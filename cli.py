import sys
import argparse
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch screening films in theaters between two given dates",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--start-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d"),
        help="Date from which to start the search. Format YYYY-mm-dd (year-month-day).",
    )
    parser.add_argument(
        "--end-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d"),
        help="Date from which to end the search. Format YYYY-mm-dd (year-month-day).",
    )
    parser.add_argument(
        "--update-csv",
        type=str,
        help="Path of CSV file that already contains films, to add new ones in the same file, removing duplicates.",
    )
    parser.add_argument(
        "--fetch-from",
        type=str,
        action="append",
        choices=["dore", "cineteca"],
        default=[],
        help="Key names of specific theaters you want to fetch films from. For more than one theater, add this option for each one, e.g., --fetch-from dore --fetch-from cineteca",
    )

    return parser.parse_args(args=(sys.argv[1:] or ["--help"]))
