import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestKeyboardAccessibilityUI:
    """Selenium UI test suite for keyboard navigation, keypress events, and accessibility semantics."""

    def test_tc01_enter_key_triggers_url_input_validation(self, dashboard_page):
        """TC_A11Y_01: Verify pressing ENTER in the meeting URL input triggers validation immediately."""
        driver = dashboard_page
        url_input = driver.find_element(By.ID, "meeting-url")

        url_input.clear()
        url_input.send_keys("https://unsupported-platform.com/test-room")
        url_input.send_keys(Keys.ENTER)
        time.sleep(0.3)

        wait = WebDriverWait(driver, 5)
        error_hint = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "field-hint-error"))
        )
        assert error_hint.is_displayed(), "Expected error hint to trigger upon pressing Enter on invalid link"

    def test_tc02_tab_key_moves_focus_through_interactive_elements(self, dashboard_page):
        """TC_A11Y_02: Verify Tab key sequentially advances focus to interactive controls."""
        driver = dashboard_page
        url_input = driver.find_element(By.ID, "meeting-url")

        # Focus the input field
        url_input.click()
        initial_active = driver.switch_to.active_element

        # Press Tab
        initial_active.send_keys(Keys.TAB)
        time.sleep(0.2)

        new_active = driver.switch_to.active_element
        assert new_active != initial_active, "Expected active focused element to advance after Tab press"

    def test_tc03_modal_dialog_accessibility_semantics(self, dashboard_page):
        """TC_A11Y_03: Verify modal elements possess proper accessibility semantics (role=dialog, aria-modal=true)."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Open Ask AI modal
        ask_ai_btn = next(btn for btn in driver.find_elements(By.CLASS_NAME, "nav-tab-item") if "Ask AI" in btn.text)
        driver.execute_script("arguments[0].click();", ask_ai_btn)

        modal = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))

        assert modal.get_attribute("role") == "dialog", "Expected modal to have role='dialog'"
        assert modal.get_attribute("aria-modal") == "true", "Expected modal to have aria-modal='true'"

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
        driver.execute_script("arguments[0].click();", close_btn)
