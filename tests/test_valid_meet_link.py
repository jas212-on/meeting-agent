import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys


def enter_meet_url(driver, url_text: str):
    """Helper to clear and enter a URL into the meeting URL input field."""
    input_elem = driver.find_element(By.ID, "meeting-url")
    input_elem.send_keys(Keys.CONTROL + "a")
    input_elem.send_keys(Keys.BACKSPACE)
    if url_text:
        input_elem.send_keys(url_text)
    time.sleep(0.3)


class TestValidMeetLinkUI:
    """UI test suite verifying 3 distinct valid Google Meet URL formats."""

    def test_tc01_standard_lowercase_meet_link(self, dashboard_page):
        """TC_VALID_01: Enters a standard 3-4-3 lowercase Google Meet link."""
        driver = dashboard_page
        url = "https://meet.google.com/abc-defg-hij"
        enter_meet_url(driver, url)

        # 1. Assert no error message is displayed
        error_elems = driver.find_elements(By.CLASS_NAME, "field-hint-error")
        displayed = [e.text for e in error_elems if e.is_displayed()]
        assert len(displayed) == 0, f"Expected no error for '{url}', got: {displayed}"

        # 2. Assert Join button is enabled
        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_enabled(), "Join button should be enabled"

    def test_tc02_alphanumeric_code_meet_link(self, dashboard_page):
        """TC_VALID_02: Enters a valid Google Meet link with alphanumeric characters."""
        driver = dashboard_page
        url = "https://meet.google.com/eng-sync-k9x"
        enter_meet_url(driver, url)

        # 1. Assert no error message is displayed
        error_elems = driver.find_elements(By.CLASS_NAME, "field-hint-error")
        displayed = [e.text for e in error_elems if e.is_displayed()]
        assert len(displayed) == 0, f"Expected no error for '{url}', got: {displayed}"

        # 2. Assert Join button is enabled
        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_enabled(), "Join button should be enabled"

    def test_tc03_meet_link_with_query_parameters(self, dashboard_page):
        """TC_VALID_03: Enters a valid Google Meet link with query parameters."""
        driver = dashboard_page
        url = "https://meet.google.com/xyz-qwer-tyu?authuser=0"
        enter_meet_url(driver, url)

        # 1. Assert no error message is displayed
        error_elems = driver.find_elements(By.CLASS_NAME, "field-hint-error")
        displayed = [e.text for e in error_elems if e.is_displayed()]
        assert len(displayed) == 0, f"Expected no error for '{url}', got: {displayed}"

        # 2. Assert Join button is enabled
        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_enabled(), "Join button should be enabled"
