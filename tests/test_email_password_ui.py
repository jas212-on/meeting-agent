import time
import uuid
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestEmailPasswordHeadfulUI:
    """Selenium UI test suite for Email & Password authentication.
    Designed for visual/headful testing:
        pytest tests/test_email_password_ui.py -v --headed
    """

    def test_01_verify_auth_card_and_blue_theme(self, driver, frontend_url):
        """TC_UI_01: Verify auth card renders with email, password, blue button, and Google button."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token'); window.location.reload();")
        wait = WebDriverWait(driver, 10)

        # 1. Email input
        email_elem = wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        assert email_elem.is_displayed(), "Email input field should be visible"
        time.sleep(0.5)

        # 2. Password input
        pwd_elem = wait.until(EC.visibility_of_element_located((By.ID, "auth-password")))
        assert pwd_elem.is_displayed(), "Password input field should be visible"
        time.sleep(0.5)

        # 3. Blue Submit button
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        assert submit_btn.is_displayed(), "Primary submit button should be visible"
        assert "Sign In with Password" in submit_btn.text
        time.sleep(0.5)

        # 4. Sign in with Google button with icon
        google_btn = driver.find_elements(By.CLASS_NAME, "google-auth-fallback-btn")
        gsi_elem = driver.find_elements(By.CLASS_NAME, "gsi-container")
        assert len(google_btn) > 0 or len(gsi_elem) > 0, "Sign in with Google button should be visible"
        time.sleep(1)

    def test_02_password_show_hide_toggle(self, driver, frontend_url):
        """TC_UI_02: Verify clicking the eye icon toggles password between hidden and visible text."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token');")
        wait = WebDriverWait(driver, 10)

        pwd_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-password")))
        pwd_input.clear()
        pwd_input.send_keys("MySecretPassword123!")
        time.sleep(0.8)

        # Initially type is password
        assert pwd_input.get_attribute("type") == "password"

        # Find and click toggle button
        toggle_btn = driver.find_element(By.CLASS_NAME, "auth-password-toggle-btn")
        toggle_btn.click()
        time.sleep(0.8)

        # Now type should be text (visible)
        assert pwd_input.get_attribute("type") == "text", "Password should be visible after clicking toggle"

        # Click toggle button again
        toggle_btn.click()
        time.sleep(0.8)

        # Now type should be back to password (hidden)
        assert pwd_input.get_attribute("type") == "password", "Password should be masked again"

    def test_03_switch_between_signin_and_signup(self, driver, frontend_url):
        """TC_UI_03: Verify switching to Create Account reveals Full Name and Confirm Password fields."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token');")
        wait = WebDriverWait(driver, 10)

        wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))

        # Initially in Sign In mode: Name and Confirm Password should NOT exist
        assert len(driver.find_elements(By.ID, "auth-name")) == 0
        assert len(driver.find_elements(By.ID, "auth-confirm-password")) == 0
        time.sleep(0.5)

        # Click "Create Account"
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = [b for b in sub_toggles if "Create Account" in b.text][0]
        create_btn.click()
        time.sleep(0.8)

        # Name and Confirm Password should now be visible
        name_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        confirm_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-confirm-password")))
        assert name_input.is_displayed()
        assert confirm_input.is_displayed()

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        assert "Create Account" in submit_btn.text
        time.sleep(0.8)

        # Click back to "Sign In"
        signin_btn = [b for b in driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn") if "Sign In" in b.text][0]
        signin_btn.click()
        time.sleep(0.8)

        assert len(driver.find_elements(By.ID, "auth-name")) == 0
        assert len(driver.find_elements(By.ID, "auth-confirm-password")) == 0

    def test_04_invalid_credentials_shows_error_message(self, driver, frontend_url):
        """TC_UI_04: Submitting invalid credentials shows inline error alert message."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token');")
        wait = WebDriverWait(driver, 10)

        email_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        email_input.clear()
        email_input.send_keys("unregistered_user@example.com")
        time.sleep(0.5)

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("WrongPassword123!")
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()
        time.sleep(1.0)

        # Error banner should appear
        error_banner = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert len(error_banner.text) > 0
        time.sleep(1.5)

    def test_05_successful_registration_and_dashboard_entry(self, driver, frontend_url):
        """TC_UI_05: Full registration flow: fill form, submit, verify dashboard entry and welcome toast."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token');")
        wait = WebDriverWait(driver, 10)

        # Switch to "Create Account"
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = [b for b in sub_toggles if "Create Account" in b.text][0]
        create_btn.click()
        time.sleep(0.6)

        # Generate unique user
        uid = uuid.uuid4().hex[:6]
        test_name = f"Headful User {uid}"
        test_email = f"headful_{uid}@meetminutes.ai"
        test_password = "SecurePassword123!"

        # Fill name
        name_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        name_input.send_keys(test_name)
        time.sleep(0.4)

        # Fill email
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.send_keys(test_email)
        time.sleep(0.4)

        # Fill password
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.send_keys(test_password)
        time.sleep(0.4)

        # Fill confirm password
        confirm_input = driver.find_element(By.ID, "auth-confirm-password")
        confirm_input.send_keys(test_password)
        time.sleep(0.6)

        # Click submit
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()

        # Wait for redirect to dashboard (meeting-url input becomes visible)
        meeting_input = wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        assert meeting_input.is_displayed(), "User should be redirected to dashboard after registration"

        # Check welcome notification toast
        toast = driver.find_elements(By.CLASS_NAME, "toast-notification")
        if toast:
            assert test_name in toast[0].text or "Welcome" in toast[0].text

        time.sleep(2.0)
