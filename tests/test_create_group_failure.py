import time
import pytest
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestCreateGroupFailure:
    """Browser and API verification suite for group creation rejection/failure scenarios.
    Supports both headless execution and interactive visual testing via:
        pytest tests/test_create_group_failure.py -v --headed
    """

    def _open_create_group_modal(self, driver, frontend_url, auth_token):
        """Helper to authenticate and open the Create Workspace modal in browser."""
        driver.get(frontend_url)
        driver.execute_script(f"""
            localStorage.setItem('auth_token', '{auth_token}');
            localStorage.setItem('user_profile', JSON.stringify({{'id': 'test_user', 'name': 'Test User', 'email': 'test@meetminutes.ai'}}));
        """)
        driver.refresh()

        wait = WebDriverWait(driver, 10)
        wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        time.sleep(0.5)

        create_btn = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "btn-create-group")))
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", create_btn)
        time.sleep(0.4)
        create_btn.click()

        name_input = wait.until(EC.visibility_of_element_located((By.ID, "group-name-input")))
        time.sleep(0.4)
        return wait, name_input

    def test_tc01_unsuccessful_empty_group_name(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_FAIL_01: Verify empty group name is prevented by disabled UI submit and rejected with 400 by API."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        # Clear name and add description
        name_input.clear()
        desc_input = driver.find_element(By.ID, "group-desc-input")
        desc_input.clear()
        desc_input.send_keys("Group with empty name")
        time.sleep(0.5)

        # In the browser UI, the submit button must be disabled
        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert not submit_btn.is_enabled(), "Submit button must be disabled when group name is empty"
        time.sleep(0.8)

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "modal-close-btn")
        close_btn.click()
        time.sleep(0.3)

        # API-level assertion: direct empty POST returns 400 Bad Request
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": "", "description": "Group with empty name"},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"

    def test_tc02_unsuccessful_single_character_name(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_FAIL_02: Submitting a 1-character name (<2) shows error alert in browser and returns 400 from API."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        # Enter single character name
        name_input.clear()
        name_input.send_keys("X")
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert submit_btn.is_enabled(), "Submit button is enabled for single character input"
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", submit_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(0.8)

        # Error banner should be rendered in UI
        error_alert = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-alert-error")))
        assert error_alert.is_displayed(), "Expected .form-alert-error to appear in Create Workspace modal"
        assert "at least 2 characters" in error_alert.text.lower()
        time.sleep(1.0)

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "modal-close-btn")
        close_btn.click()
        time.sleep(0.3)

        # API-level assertion
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": "X", "description": "Group name below minimum length"},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"

    def test_tc03_unsuccessful_whitespace_only_name(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_FAIL_03: Whitespace-only name keeps UI submit disabled and returns 400 from API."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        # Enter whitespace-only name
        name_input.clear()
        name_input.send_keys("     ")
        time.sleep(0.5)

        # UI submit button must remain disabled
        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert not submit_btn.is_enabled(), "Submit button must be disabled when group name contains only whitespace"
        time.sleep(0.8)

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "modal-close-btn")
        close_btn.click()
        time.sleep(0.3)

        # API-level assertion
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": "     ", "description": "Group with whitespace-only name"},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is False
        assert data.get("error") == "Group name is required and must be at least 2 characters long"
