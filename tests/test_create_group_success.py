import time
import pytest
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestCreateGroupSuccess:
    """Browser and API verification suite for successful group creation scenarios.
    Supports both headless execution and interactive visual testing via:
        pytest tests/test_create_group_success.py -v --headed
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

    def test_tc01_standard_group_with_name_and_description(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_SUCC_01: Verify creating a workspace with name and description in browser and via API."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        ts = int(time.time() * 1000)
        group_name = f"Product Design Team {ts}"
        group_desc = "Weekly design critiques and roadmap reviews"

        name_input.clear()
        name_input.send_keys(group_name)
        time.sleep(0.4)

        desc_input = driver.find_element(By.ID, "group-desc-input")
        desc_input.clear()
        desc_input.send_keys(group_desc)
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert submit_btn.is_enabled(), "Submit button should be enabled with valid name"
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", submit_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", submit_btn)

        # Wait for the group card to appear on the page
        created_card = wait.until(
            EC.visibility_of_element_located((By.XPATH, f"//*[contains(text(), '{group_name}')]"))
        )
        assert created_card.is_displayed(), f"Expected newly created group '{group_name}' to appear on the dashboard"
        time.sleep(1.0)

        # API verification
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": f"API {group_name}", "description": group_desc},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is True
        assert data.get("message") == "Group created successfully"

    def test_tc02_group_with_name_only(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_SUCC_02: Verify creating a workspace providing only a name (optional description omitted)."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        ts = int(time.time() * 1000)
        group_name = f"Backend Engineering {ts}"

        name_input.clear()
        name_input.send_keys(group_name)
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert submit_btn.is_enabled(), "Submit button should be enabled"
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", submit_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", submit_btn)

        created_card = wait.until(
            EC.visibility_of_element_located((By.XPATH, f"//*[contains(text(), '{group_name}')]"))
        )
        assert created_card.is_displayed(), f"Expected newly created group '{group_name}' to appear"
        time.sleep(1.0)

        # API verification
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": f"API {group_name}", "description": ""},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 201
        assert res.json().get("success") is True

    def test_tc03_group_minimum_allowed_name_length(self, driver, frontend_url, backend_url, auth_token):
        """TC_GROUP_SUCC_03: Verify creating a workspace with minimum required name length (2 characters)."""
        wait, name_input = self._open_create_group_modal(driver, frontend_url, auth_token)

        ts = int(time.time() * 1000)
        group_name = f"Q{str(ts)[-1]}"  # Exactly 2 characters

        name_input.clear()
        name_input.send_keys(group_name)
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "btn-modal-submit")
        assert submit_btn.is_enabled(), "Submit button should be enabled for 2-char name"
        driver.execute_script("arguments[0].scrollIntoView({behavior: 'instant', block: 'center'});", submit_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", submit_btn)

        created_card = wait.until(
            EC.visibility_of_element_located((By.XPATH, f"//*[contains(text(), '{group_name}')]"))
        )
        assert created_card.is_displayed(), f"Expected 2-char group '{group_name}' to appear"
        time.sleep(1.0)

        # API verification
        res = requests.post(
            f"{backend_url}/api/groups",
            json={"name": f"A{str(ts)[-1]}", "description": "Minimum length group"},
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 201
        assert res.json().get("success") is True
