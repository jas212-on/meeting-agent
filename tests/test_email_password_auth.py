import time
import uuid
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestEmailPasswordBrowserAuth:
    """Browser-based test suite for Email & Password validation.
    Visually executes in the Chrome browser with --headed:
        pytest tests/test_email_password_auth.py -v --headed
    """

    @pytest.fixture(autouse=True)
    def prepare_auth_view(self, driver, frontend_url):
        """Ensures the auth screen is active by clearing any cached tokens."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token'); window.location.reload();")
        self.wait = WebDriverWait(driver, 10)
        self.wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        time.sleep(0.5)

    def test_01_password_length_too_short(self, driver):
        """Verify typing a password shorter than 6 characters shows error in browser."""
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys("test_user@meetminutes.ai")
        time.sleep(0.8)

        # Type short password (< 6 characters)
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("123")
        time.sleep(0.8)

        # Click blue sign-in button
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()
        time.sleep(1.0)

        # Error banner should appear with length requirement message
        error_banner = self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "at least 6 characters" in error_banner.text.lower()
        time.sleep(1.5)

    def test_02_invalid_email_format(self, driver):
        """Verify typing an invalid email format (e.g. missing @/domain) shows error in browser."""
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys("invalid_email_without_at")
        time.sleep(0.8)

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("ValidPassword123!")
        time.sleep(0.8)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()
        time.sleep(1.0)

        # Error banner should appear
        error_banner = self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "valid email address" in error_banner.text.lower()
        time.sleep(1.5)

    def test_03_incorrect_password(self, driver):
        """Verify typing an incorrect password shows server rejection in browser."""
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys("jason@gmail.com")
        time.sleep(0.8)

        # Type wrong password
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("987654")
        time.sleep(0.8)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()
        time.sleep(1.2)

        # Rejection banner should be displayed
        error_banner = self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert len(error_banner.text) > 0
        time.sleep(1.5)

    def test_04_create_account_mismatched_passwords(self, driver):
        """Verify entering mismatched passwords on registration shows validation error in browser."""
        # Click "Create Account"
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = [b for b in sub_toggles if "Create Account" in b.text][0]
        create_btn.click()
        time.sleep(0.8)

        # Fill name
        name_input = self.wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        name_input.send_keys("Mismatched User")
        time.sleep(0.5)

        # Fill email
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.send_keys("mismatch@meetminutes.ai")
        time.sleep(0.5)

        # Password 1
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.send_keys("Password123!")
        time.sleep(0.5)

        # Password 2 (mismatched)
        confirm_input = driver.find_element(By.ID, "auth-confirm-password")
        confirm_input.send_keys("DifferentPassword456!")
        time.sleep(0.8)

        # Click submit
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()
        time.sleep(1.0)

        # Error banner should indicate passwords do not match
        error_banner = self.wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "passwords do not match" in error_banner.text.lower()
        time.sleep(1.5)

    def test_05_valid_registration_and_dashboard_entry(self, driver):
        """Verify successful user registration visually transitions to dashboard in browser."""
        # Click "Create Account"
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = [b for b in sub_toggles if "Create Account" in b.text][0]
        create_btn.click()
        time.sleep(0.8)

        uid = uuid.uuid4().hex[:6]
        user_name = f"Headed Tester {uid}"
        user_email = f"headed_{uid}@meetminutes.ai"
        user_pwd = "SecurePassword123!"

        # Enter name
        name_input = self.wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        name_input.send_keys(user_name)
        time.sleep(0.5)

        # Enter email
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.send_keys(user_email)
        time.sleep(0.5)

        # Enter password
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.send_keys(user_pwd)
        time.sleep(0.5)

        # Enter matching confirm password
        confirm_input = driver.find_element(By.ID, "auth-confirm-password")
        confirm_input.send_keys(user_pwd)
        time.sleep(0.8)

        # Submit form
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()

        # Wait for redirect to dashboard
        meeting_input = self.wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        assert meeting_input.is_displayed(), "User should be redirected to dashboard upon successful registration"

        # Welcome notification toast should be visible
        toast = driver.find_elements(By.CLASS_NAME, "toast-notification")
        if toast:
            assert user_name in toast[0].text or "Welcome" in toast[0].text

        time.sleep(2.0)

    def test_06_valid_login_with_credentials(self, driver):
        """Verify successful user login using valid credentials (jason@gmail.com / 123456) transitions to dashboard."""
        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys("jason@gmail.com")
        time.sleep(0.8)

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("123456")
        time.sleep(0.8)

        # Click blue sign-in button
        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        submit_btn.click()

        # Wait for redirect to dashboard
        meeting_input = self.wait.until(EC.visibility_of_element_located((By.ID, "meeting-url")))
        assert meeting_input.is_displayed(), "User should be redirected to dashboard upon successful login"

        # Verify auth token is stored in localStorage
        token = driver.execute_script("return localStorage.getItem('auth_token');")
        assert token is not None and len(token) > 0, "Auth token should be stored in localStorage"

        # Verify user name in navbar or welcome toast
        user_labels = driver.find_elements(By.CLASS_NAME, "user-name-label")
        if user_labels:
            assert "jason" in user_labels[0].text.lower(), f"Expected 'Jason' in navbar, got {user_labels[0].text}"

        time.sleep(1.5)

