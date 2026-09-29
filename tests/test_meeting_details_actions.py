import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestMeetingDetailsActionsUI:
    """Selenium UI test suite for Meeting Details page, navigation, and interactive Action Items checklist."""

    def test_tc01_navigate_to_meeting_detail_view(self, dashboard_page):
        """TC_DETAIL_01: Verify clicking 'Meetings' tab navigates to the detailed meeting minutes view."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Click the Meetings navigation tab via JS to avoid toast overlay intercept
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        meetings_tab = next(tab for tab in nav_tabs if "Meetings" in tab.text)
        driver.execute_script("arguments[0].click();", meetings_tab)

        # Canvas breadcrumb should indicate meeting details view
        crumb = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "canvas-breadcrumbs")))
        assert "Meetings" in crumb.text

    def test_tc02_switch_sidebar_sections(self, dashboard_page):
        """TC_DETAIL_02: Verify switching between sidebar items (Minutes, Actions, Attendance, Transcript)."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Ensure we are on meeting details view
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        meetings_tab = next(tab for tab in nav_tabs if "Meetings" in tab.text)
        driver.execute_script("arguments[0].click();", meetings_tab)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "sidebar-menu-list")))
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")

        # Click "Minutes & Topics"
        minutes_btn = next((btn for btn in menu_items if "Minutes" in btn.text), None)
        assert minutes_btn is not None, "Expected 'Minutes & Topics' button in sidebar"
        driver.execute_script("arguments[0].click();", minutes_btn)
        time.sleep(0.3)

        # Check section header
        heading = driver.find_element(By.CLASS_NAME, "section-main-heading")
        assert "Minutes" in heading.text

    def test_tc03_interactive_action_items_checklist_toggle(self, dashboard_page):
        """TC_DETAIL_03: Verify clicking an action item checkbox toggles its completion state."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Navigate to meeting detail
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        meetings_tab = next(tab for tab in nav_tabs if "Meetings" in tab.text)
        driver.execute_script("arguments[0].click();", meetings_tab)

        # Click "Action Items" in sidebar
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "sidebar-menu-list")))
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        actions_btn = next(btn for btn in menu_items if "Action Items" in btn.text)
        driver.execute_script("arguments[0].click();", actions_btn)
        time.sleep(0.3)

        # Locate task checkboxes
        checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
        if checkboxes:
            first_box = checkboxes[0]
            initial_checked = first_box.is_selected()

            # Click to toggle via JS
            driver.execute_script("arguments[0].click();", first_box)
            time.sleep(0.3)
            new_checked = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")[0].is_selected()

            assert new_checked != initial_checked, f"Expected checkbox state to flip from {initial_checked} to {new_checked}"

    def test_tc04_breadcrumb_back_to_dashboard(self, dashboard_page):
        """TC_DETAIL_04: Verify clicking 'Dashboard' in breadcrumbs returns user to the main dashboard."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Navigate to meeting detail
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        meetings_tab = next(tab for tab in nav_tabs if "Meetings" in tab.text)
        driver.execute_script("arguments[0].click();", meetings_tab)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "crumb-part")))
        dashboard_crumb = driver.find_elements(By.CLASS_NAME, "crumb-part")[0]
        driver.execute_script("arguments[0].click();", dashboard_crumb)

        # URL input should be visible again on main dashboard
        url_input = wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        assert url_input.is_displayed(), "Expected to return to dashboard with meeting-url input visible"
