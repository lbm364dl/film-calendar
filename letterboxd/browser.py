"""Chrome browser management for bypassing Cloudflare bot detection."""

import undetected_chromedriver as uc
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException


def _get_chrome_major_version():
    """Detect the installed Chrome major version."""
    import subprocess
    import re
    for cmd in ["google-chrome --version", "google-chrome-stable --version",
                "chromium --version", "chromium-browser --version"]:
        try:
            out = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            m = re.search(r"(\d+)\.", out)
            if m:
                return int(m.group(1))
        except Exception:
            continue
    return None


def create_browser():
    """Create a Chrome browser that bypasses Cloudflare bot detection."""
    options = uc.ChromeOptions()
    options.add_argument("--no-first-run")
    options.add_argument("--no-service-autorun")
    options.add_argument("--password-store=basic")
    version = _get_chrome_major_version()
    browser = uc.Chrome(options=options, version_main=version)
    return browser


def dismiss_cookie_consent(browser, timeout=5):
    """Try to dismiss any cookie consent banner on the page."""
    selectors = [
        "button.js-cookie-consent",
        "[data-cookie-consent='accept']",
        "button[class*='cookie']",
        ".cc-btn.cc-allow",
        ".fc-cta-consent",
        "button.accept-cookies",
        "#onetrust-accept-btn-handler",
        ".consent button",
        ".cookie-banner button",
    ]
    for sel in selectors:
        try:
            btn = WebDriverWait(browser, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
            )
            btn.click()
            print("  → Dismissed cookie consent")
            return True
        except (TimeoutException, Exception):
            continue

    # Fallback: look for any button with 'accept' text
    try:
        buttons = browser.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            text = btn.text.strip().lower()
            if text in ("accept", "accept all", "accept cookies", "agree", "ok", "i agree"):
                btn.click()
                print(f"  → Dismissed consent via button: '{btn.text.strip()}'")
                return True
    except Exception:
        pass

    return False
