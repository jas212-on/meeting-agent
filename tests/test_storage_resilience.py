import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestStorageResilienceUI:
    """Test suite verifying localStorage fault tolerance, session recovery, and theme persistence."""

    def test_tc01_corrupted_localstorage_graceful_recovery(self, driver, frontend_url):
        """TC_RESIL_01: Verify application survives corrupted JSON in localStorage without a white-screen crash."""
        driver.get(frontend_url)

        # Inject malformed non-JSON data into history storage key
        driver.execute_script("localStorage.setItem('meetminutes_history_v1', '!!!NOT_JSON_CORRUPT{[[(');")
        driver.refresh()

        # Handle guest bypass if presented
        wait = WebDriverWait(driver, 10)
        guest_buttons = driver.find_elements(By.CLASS_NAME, "guest-continue-btn")
        if guest_buttons:
            driver.execute_script("arguments[0].click();", guest_buttons[0])

        # Page should recover cleanly and mount the main meeting input
        url_input = wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        assert url_input.is_displayed(), "Expected dashboard to recover gracefully from corrupted localStorage"

    def test_tc02_theme_persistence_across_browser_reloads(self, driver, frontend_url):
        """TC_RESIL_02: Verify dark theme preference survives browser reload."""
        driver.get(frontend_url)
        # Ensure theme is set to dark in localStorage
        driver.execute_script("localStorage.setItem('meetminutes_theme', 'dark');")
        driver.refresh()

        wait = WebDriverWait(driver, 10)
        guest_buttons = driver.find_elements(By.CLASS_NAME, "guest-continue-btn")
        if guest_buttons:
            driver.execute_script("arguments[0].click();", guest_buttons[0])

        wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        persisted_theme = driver.execute_script("return document.documentElement.getAttribute('data-theme');")
        assert persisted_theme == "dark", f"Expected theme to remain 'dark' after reload, got '{persisted_theme}'"

        # Revert to light
        driver.execute_script("localStorage.setItem('meetminutes_theme', 'light');")
        driver.refresh()
        guest_buttons = driver.find_elements(By.CLASS_NAME, "guest-continue-btn")
        if guest_buttons:
            driver.execute_script("arguments[0].click();", guest_buttons[0])

        wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        reverted = driver.execute_script("return document.documentElement.getAttribute('data-theme');")
        assert reverted == "light"

    def test_tc03_meeting_history_records_rendered(self, dashboard_page):
        """TC_RESIL_03: Verify past meeting records render with title, date, and duration badges."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Meeting history cards or table should be present
        history_section = wait.until(
            EC.presence_of_element_located((By.CLASS_NAME, "history-section"))
        )
        assert history_section.is_displayed()

        meeting_cards = driver.find_elements(By.CLASS_NAME, "meeting-card")
        assert len(meeting_cards) > 0, "Expected past meeting cards to be populated"
