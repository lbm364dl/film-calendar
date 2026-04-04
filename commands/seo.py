"""SEO command - inject structured data into index.html."""


def run_seo(args):
    """Execute the seo command - inject structured data into index.html."""
    from seo import run_seo as _run_seo
    _run_seo()
