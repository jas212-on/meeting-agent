import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestResponsiveViewportsUI:
    """Selenium UI test suite for responsive layout and viewport adaptability (Mobile, Tablet, Desktop)."""

    def test_tc01_mobile_viewport_interactive_controls(self, dashboard_page):
        """TC_RESP_01: Verify core interactive controls remain visible and functional on mobile viewport (375x812)."""
        driver = dashboard_page
        driver.set_window_size(375, 812)
        time.sleep(0.5)

        # Core meeting input and join button must be visible
        url_input = driver.find_element(By.ID, "meeting-url")
        assert url_input.is_displayed(), "Expected meeting-url input to remain visible on mobile screen"

        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_displayed(), "Expected join button to remain visible on mobile screen"

        # Theme toggle should be rendered
        theme_btn = driver.find_element(By.CLASS_NAME, "theme-toggle-btn")
        assert theme_btn.is_displayed(), "Expected theme toggle button to be visible on mobile screen"

    def test_tc02_tablet_viewport_interactive_controls(self, dashboard_page):
        """TC_RESP_02: Verify tablet viewport (768x1024) adapts layout cleanly without element clipping."""
        driver = dashboard_page
        driver.set_window_size(768, 1024)
        time.sleep(0.5)

        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_displayed(), "Expected Join button to remain visible on tablet screen"

        url_input = driver.find_element(By.ID, "meeting-url")
        assert url_input.is_displayed(), "Expected URL input to remain visible on tablet screen"

    def test_tc03_desktop_viewport_full_layout(self, dashboard_page):
        """TC_RESP_03: Verify desktop viewport (1440x900) displays full header navigation bar and actions."""
        driver = dashboard_page
        driver.set_window_size(1440, 900)
        time.sleep(0.5)

        nav_actions = driver.find_element(By.CLASS_NAME, "nav-actions")
        assert nav_actions.is_displayed(), "Expected desktop nav-actions header block to be displayed"

        nav_bar = driver.find_element(By.CLASS_NAME, "nav-center-tabs")
        assert nav_bar.is_displayed(), "Expected desktop nav-center-tabs to be displayed"
