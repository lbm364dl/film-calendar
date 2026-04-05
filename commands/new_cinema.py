"""New-cinema command: generate boilerplate for a new cinema scraper."""

from cli import generate_cinema_boilerplate


def run_new_cinema(args):
    """Execute the new-cinema command."""
    generate_cinema_boilerplate(args.key, args.name, args.url)
