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

    return parser.parse_args(args=(sys.argv[1:] or ["--help"]))
