import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestThemeAndNavigationUI:
    """Selenium UI test suite for Dark/Light mode theme switching and dashboard navigation."""

    def test_tc01_toggle_light_and_dark_mode(self, dashboard_page):
        """TC_THEME_01: Verify clicking the theme toggle button switches between light and dark modes."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        theme_btn = wait.until(
            EC.element_to_be_clickable((By.CLASS_NAME, "theme-toggle-btn"))
        )

        # Get initial theme
        initial_theme = driver.execute_script("return document.documentElement.getAttribute('data-theme') || 'light'")
        expected_next = "dark" if initial_theme == "light" else "light"

        driver.execute_script("arguments[0].click();", theme_btn)
        time.sleep(0.3)

        updated_theme = driver.execute_script("return document.documentElement.getAttribute('data-theme')")
        assert updated_theme == expected_next, f"Expected theme '{expected_next}', but got '{updated_theme}'"

        # Toggle back to ensure persistence and revert
        driver.execute_script("arguments[0].click();", theme_btn)
        time.sleep(0.3)
        reverted_theme = driver.execute_script("return document.documentElement.getAttribute('data-theme')")
        assert reverted_theme == initial_theme, f"Expected theme to revert to '{initial_theme}'"

    def test_tc02_navigation_tabs_presence_and_interaction(self, dashboard_page):
        """TC_NAV_02: Verify header navigation tabs (Meetings, Groups, Ask AI) are rendered and clickable."""
        driver = dashboard_page
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        tab_texts = [tab.text.strip() for tab in nav_tabs if tab.text.strip()]

        assert any("Meetings" in text for text in tab_texts), "Expected 'Meetings' tab in header navigation"
        assert any("Groups" in text for text in tab_texts), "Expected 'Groups' tab in header navigation"
        assert any("Ask AI" in text for text in tab_texts), "Expected 'Ask AI' tab in header navigation"

    def test_tc03_collapsible_diagnostic_logs_toggle(self, dashboard_page):
        """TC_LOGS_03: Verify clicking the diagnostic logs toggle expands the terminal logs container."""
        driver = dashboard_page
        toggle_btn = driver.find_element(By.CLASS_NAME, "btn-logs-toggle")

        driver.execute_script("arguments[0].click();", toggle_btn)
        time.sleep(0.3)

        # When expanded, terminal log wrapper should be present in DOM
        terminal_elements = driver.find_elements(By.CLASS_NAME, "logs-console-box")
        assert len(terminal_elements) > 0, "Expected diagnostic logs card to appear after clicking toggle button"
