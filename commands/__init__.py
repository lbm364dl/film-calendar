"""CLI command handlers for film-calendar.

Imports are deferred to avoid loading heavy dependencies (Selenium, pandas)
until the specific command is actually invoked.
"""


def run_scrape(args):
    from .scrape import run_scrape as _run
    _run(args)


def run_match(args):
    from .match import run_match as _run
    _run(args)


def run_merge(args):
    from .merge import run_merge as _run
    _run(args)


def run_archive(args):
    from .archive import run_archive as _run
    _run(args)


def run_new_cinema(args):
    from .new_cinema import run_new_cinema as _run
    _run(args)


def run_status(args):
    from .status import run_status as _run
    _run(args)


def run_seo(args):
    from .seo import run_seo as _run
    _run(args)
