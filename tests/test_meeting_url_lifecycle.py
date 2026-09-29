import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from tests.conftest import enter_meet_url


class TestMeetingUrlLifecycleUI:
    """Selenium UI test suite for Google Meet URL input validation and button states."""

    def test_tc01_join_button_disabled_when_empty_or_invalid(self, dashboard_page):
        """TC_MEET_UI_01: Verify 'Join & Record' button is disabled when URL input is empty or invalid."""
        driver = dashboard_page
        url_input = driver.find_element(By.ID, "meeting-url")
        join_btn = driver.find_element(By.ID, "join-btn")

        # 1. Initially empty -> button must be disabled
        enter_meet_url(driver, "")
        assert not join_btn.is_enabled(), "Expected 'Join & Record' button to be disabled when input is empty"

        # 2. Enter invalid URL -> button remains disabled
        enter_meet_url(driver, "https://invalid-platform.com/meeting-123")
        assert not join_btn.is_enabled(), "Expected 'Join & Record' button to be disabled for invalid URL"

    def test_tc02_join_button_enabled_on_valid_meet_link(self, dashboard_page):
        """TC_MEET_UI_02: Verify 'Join & Record' button is enabled when a valid Google Meet link is entered."""
        driver = dashboard_page
        url_input = driver.find_element(By.ID, "meeting-url")
        join_btn = driver.find_element(By.ID, "join-btn")

        valid_url = "https://meet.google.com/abc-defg-hij"
        enter_meet_url(driver, valid_url)

        # Button should be enabled and no error hint displayed
        assert join_btn.is_enabled(), "Expected 'Join & Record' button to be enabled for valid Meet URL"

        error_hints = driver.find_elements(By.CLASS_NAME, "field-hint-error")
        visible_errors = [e.text for e in error_hints if e.is_displayed()]
        assert len(visible_errors) == 0, f"Expected no error hint for valid URL, but found: {visible_errors}"

    def test_tc03_error_hint_displayed_on_unsupported_platform(self, dashboard_page):
        """TC_MEET_UI_03: Verify error hint is displayed when a non-Google video platform link is entered."""
        driver = dashboard_page
        unsupported_url = "https://zoom.us/j/9876543210"
        enter_meet_url(driver, unsupported_url)

        wait = WebDriverWait(driver, 5)
        error_elem = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "field-hint-error"))
        )
        assert "Please enter a valid Google Meet link" in error_elem.text

    def test_tc04_input_clear_button_resets_url_and_state(self, dashboard_page):
        """TC_MEET_UI_04: Verify clicking the clear button ('X') clears the text and resets error state."""
        driver = dashboard_page
        enter_meet_url(driver, "https://meet.google.com/test-room-123")

        clear_btn = driver.find_element(By.CLASS_NAME, "input-clear-btn")
        clear_btn.click()
        time.sleep(0.3)

        url_input = driver.find_element(By.ID, "meeting-url")
        assert url_input.get_attribute("value") == "", "Expected meeting URL input to be empty after clearing"

        join_btn = driver.find_element(By.ID, "join-btn")
        assert not join_btn.is_enabled(), "Expected join button to return to disabled state"
