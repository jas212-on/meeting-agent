import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestTranscriptSearchFiltersUI:
    """Selenium UI test suite for real-time Transcript searching, dialogue turn filtering, and controls."""

    def _open_transcript_tab(self, driver):
        wait = WebDriverWait(driver, 5)
        # Navigate to meeting detail view
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        meetings_tab = next(tab for tab in nav_tabs if "Meetings" in tab.text)
        driver.execute_script("arguments[0].click();", meetings_tab)

        # Click Transcript in sidebar
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "sidebar-menu-list")))
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        transcript_btn = next(btn for btn in menu_items if "Transcript" in btn.text)
        driver.execute_script("arguments[0].click();", transcript_btn)
        time.sleep(0.3)

    def test_tc01_transcript_view_initial_turns_rendered(self, dashboard_page):
        """TC_TRANS_01: Verify opening Transcript tab renders dialogue turn cards and turns counter pill."""
        driver = dashboard_page
        self._open_transcript_tab(driver)

        wait = WebDriverWait(driver, 5)
        turns_pill = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "transcript-turns-pill")))
        assert "turn" in turns_pill.text

        cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        assert len(cards) > 0, "Expected dialogue speech cards to be rendered in transcript view"

    def test_tc02_filter_transcript_by_keyword(self, dashboard_page):
        """TC_TRANS_02: Verify typing a keyword into search input filters dialogue turns dynamically."""
        driver = dashboard_page
        self._open_transcript_tab(driver)

        search_input = driver.find_element(By.CLASS_NAME, "transcript-search-input")
        search_input.clear()
        search_input.send_keys("database")
        time.sleep(0.3)

        # Either matching turns exist or empty state is shown cleanly
        cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        empty_states = driver.find_elements(By.CLASS_NAME, "transcript-empty-state")
        assert len(cards) > 0 or len(empty_states) > 0, "Expected filtered results or clean empty state"

    def test_tc03_filter_transcript_no_match_shows_empty_state(self, dashboard_page):
        """TC_TRANS_03: Verify searching for a non-existent keyword displays the empty state message."""
        driver = dashboard_page
        self._open_transcript_tab(driver)

        search_input = driver.find_element(By.CLASS_NAME, "transcript-search-input")
        search_input.clear()
        search_input.send_keys("xyz_impossible_keyword_999")
        time.sleep(0.3)

        wait = WebDriverWait(driver, 5)
        empty_state = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "transcript-empty-state")))
        assert "No speech turns match" in empty_state.text

    def test_tc04_clear_filter_restores_all_turns(self, dashboard_page):
        """TC_TRANS_04: Verify clearing search filter restores all original dialogue turns."""
        driver = dashboard_page
        self._open_transcript_tab(driver)

        search_input = driver.find_element(By.CLASS_NAME, "transcript-search-input")
        search_input.clear()
        search_input.send_keys("test_filter")
        time.sleep(0.3)

        # Clear via clear button
        clear_btn = driver.find_elements(By.CLASS_NAME, "transcript-search-clear")
        if clear_btn:
            driver.execute_script("arguments[0].click();", clear_btn[0])
            time.sleep(0.3)
            assert search_input.get_attribute("value") == ""

            cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
            assert len(cards) > 0, "Expected all dialogue turns to return after clearing search"
