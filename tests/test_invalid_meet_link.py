import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

REQUIRED_ERROR_MESSAGE = (
    "Please enter a valid Google Meet link (format: https://meet.google.com/xxx-xxxx-xxx)"
)


def enter_meet_url(driver, url_text: str):
    """Helper to clear and enter a URL into the meeting URL input field."""
    input_elem = driver.find_element(By.ID, "meeting-url")
    input_elem.send_keys(Keys.CONTROL + "a")
    input_elem.send_keys(Keys.BACKSPACE)
    if url_text:
        input_elem.send_keys(url_text)
    time.sleep(0.3)


class TestInvalidMeetLinkUI:
    """UI test suite verifying invalid URL inputs and defect detection."""

    def test_tc01_invalid_external_platform_link(self, dashboard_page):
        """TC_INVALID_01: Enters an external platform link (Zoom) instead of Google Meet."""
        driver = dashboard_page
        url = "https://zoom.us/j/1234567890"
        enter_meet_url(driver, url)

        # 1. Assert required error message appears
        wait = WebDriverWait(driver, 5)
        error_elem = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "field-hint-error"))
        )
        assert REQUIRED_ERROR_MESSAGE in error_elem.text

        # 2. Assert Join button is disabled
        join_btn = driver.find_element(By.ID, "join-btn")
        assert not join_btn.is_enabled(), "Join button should be disabled for Zoom URL"

    def test_tc02_invalid_meet_link_without_https(self, dashboard_page):
        """TC_INVALID_02 (Defect Test Case / FAIL):
        Enters a Google Meet URL without 'https://' prefix (e.g. meet.google.com/abc-defg-hij).
        Expected: Application should auto-format or accept standard meet links without scheme.
        Actual: Application regex strictly demands 'https://' and rejects it, causing this test to FAIL.
        """
        driver = dashboard_page
        url = "meet.google.com/abc-defg-hij"
        enter_meet_url(driver, url)

        # Expected: No error displayed
        error_elems = driver.find_elements(By.CLASS_NAME, "field-hint-error")
        displayed = [e.text for e in error_elems if e.is_displayed()]
        assert len(displayed) == 0, (
            f"Expected link without https:// to be accepted, but got error: {displayed}"
        )

        # Expected: Join button enabled
        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_enabled(), (
            "Join button should be enabled for meet.google.com/abc-defg-hij"
        )

    def test_tc03_invalid_plain_text_format(self, dashboard_page):
        """TC_INVALID_03: Enters plain arbitrary text that is not a valid URL."""
        driver = dashboard_page
        url = "not-a-google-meet-link"
        enter_meet_url(driver, url)

        wait = WebDriverWait(driver, 5)
        error_elem = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "field-hint-error"))
        )
        assert REQUIRED_ERROR_MESSAGE in error_elem.text

        join_btn = driver.find_element(By.ID, "join-btn")
        assert not join_btn.is_enabled(), "Join button should be disabled for plain text"
