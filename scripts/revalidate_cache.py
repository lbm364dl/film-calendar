#!/usr/bin/env python3
"""Revalidate the Next.js screenings cache by POSTing to /api/screenings."""

import os
import sys
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv

load_dotenv()


def main():
    site_url = os.environ.get("SITE_URL")
    if not site_url:
        print("SITE_URL not set.")
        print("Run manually: curl -X POST https://www.madridfilmcalendar.com/api/screenings?secret=$REVALIDATE_SECRET")
        sys.exit(1)

    endpoint = urljoin(site_url.rstrip("/") + "/", "api/screenings")
    secret = os.environ.get("REVALIDATE_SECRET")
    params = {"secret": secret} if secret else None

    print(f"Revalidating cache at {endpoint} ...")
    try:
        resp = requests.post(endpoint, params=params, timeout=30, allow_redirects=True)
        if resp.ok:
            print(f"✓ Cache revalidated ({resp.json()})")
        else:
            print(f"Error: {resp.status_code}: {resp.text[:200]}")
            sys.exit(1)
    except requests.RequestException as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
