import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestGroupWorkspaceUI:
    """Selenium UI test suite for Team Collaboration & Workspace features."""

    def test_tc01_unauthenticated_create_triggers_auth_prompt(self, dashboard_page):
        """TC_GROUP_UI_01: Verify clicking 'New Workspace' as guest triggers authentication modal."""
        driver = dashboard_page

        # Scroll to group section
        create_btn = driver.find_element(By.CLASS_NAME, "btn-create-group")
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", create_btn)
        time.sleep(0.3)
        create_btn.click()

        wait = WebDriverWait(driver, 5)
        # Should prompt with auth modal card
        auth_card = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "modal-card"))
        )
        assert auth_card.is_displayed(), "Expected authentication modal to appear for unauthenticated guest"

        # Close auth modal to clean up
        close_btn = driver.find_elements(By.CLASS_NAME, "modal-close")
        if close_btn:
            driver.execute_script("arguments[0].click();", close_btn[0])

    def test_tc02_authenticated_opens_create_modal(self, driver, frontend_url, auth_token):
        """TC_GROUP_UI_02: Verify an authenticated user can open the Create Workspace modal."""
        # Inject auth token into localStorage and reload
        driver.get(frontend_url)
        driver.execute_script(f"localStorage.setItem('auth_token', '{auth_token}');")
        driver.refresh()

        wait = WebDriverWait(driver, 10)
        wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))

        create_btn = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "btn-create-group")))
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", create_btn)
        time.sleep(0.3)
        create_btn.click()

        # Modal should open with #group-name-input
        name_input = wait.until(EC.visibility_of_element_located((By.ID, "group-name-input")))
        assert name_input.is_displayed(), "Expected #group-name-input to be displayed in Create Workspace modal"

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "modal-close-btn")
        close_btn.click()
        time.sleep(0.3)

    def test_tc03_workspace_filter_tabs(self, dashboard_page):
        """TC_GROUP_UI_03: Verify switching between workspace filter tabs updates active tab state."""
        driver = dashboard_page
        tabs = driver.find_elements(By.CLASS_NAME, "groups-tab-btn")
        assert len(tabs) >= 3, "Expected at least 3 tabs ('All', 'My Workspaces', 'Member')"

        # Click the second tab (My Workspaces)
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", tabs[1])
        tabs[1].click()
        time.sleep(0.2)
        assert "active" in tabs[1].get_attribute("class"), "Expected second tab to be active after clicking"

        # Click back to the first tab (All Workspaces)
        tabs[0].click()
        time.sleep(0.2)
        assert "active" in tabs[0].get_attribute("class"), "Expected first tab to return to active state"

    def test_tc04_workspace_search_input_filtering(self, dashboard_page):
        """TC_GROUP_UI_04: Verify typing into the workspace search box updates input value without errors."""
        driver = dashboard_page
        search_input = driver.find_element(By.CLASS_NAME, "groups-search-input")

        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", search_input)
        search_input.clear()
        search_input.send_keys("Sprint Review")
        time.sleep(0.3)

        assert search_input.get_attribute("value") == "Sprint Review"
        clear_btn = driver.find_elements(By.CLASS_NAME, "search-clear")
        if clear_btn:
            clear_btn[0].click()
            time.sleep(0.2)
            assert search_input.get_attribute("value") == ""
