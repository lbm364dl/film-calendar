"""Main entry point for film-calendar."""

from cli import parse_args
from commands import run_scrape, run_match, run_merge, run_archive, run_new_cinema


if __name__ == "__main__":
    args = parse_args()

    if args.command == "scrape":
        run_scrape(args)
    elif args.command == "match":
        run_match(args)
    elif args.command == "merge":
        run_merge(args)
    elif args.command == "archive":
        run_archive(args)
    elif args.command == "new-cinema":
        run_new_cinema(args)
