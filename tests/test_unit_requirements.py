"""Automated Test Suite for Unit Test Cases (UT-01 to UT-08).

Supports visible interactive browser execution via:
    pytest test_unit_requirements.py -v --headed

Covers:
  - UT-01: register() - Valid input -> HTTP 201 Created with JWT token
  - UT-02: register() - Password length = 5 -> HTTP 400 Bad Request
  - UT-03: login() - Unknown email -> HTTP 401 Unauthorized
  - UT-04: login() - Existing user + incorrect password -> HTTP 401 Unauthorized
  - UT-05: generateMeetingSummary() - rawTranscript = "" -> createEmptyMeetingMinutes()
  - UT-06: generateMeetingSummary() - GROQ_API_KEY absent -> createFallbackMeetingMinutes()
  - UT-07: transcribeAudioWithGroqWhisper() - Non-existent audio path -> { text: "", segments: [] }
  - UT-08: transcribeAudioWithGroqWhisper() - Audio file size < 1000 bytes -> { text: "", segments: [] }
"""

import os
import time
import subprocess
import requests
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestUnitRequirements:
    """Unit test suite verifying controller validation, auth state, and Groq intelligence services."""

    def _open_auth_view(self, driver, frontend_url):
        """Helper to navigate to unauthenticated AuthCard view in browser."""
        driver.get(frontend_url)
        driver.execute_script("localStorage.removeItem('auth_token'); localStorage.removeItem('user_profile');")
        driver.refresh()
        wait = WebDriverWait(driver, 10)
        wait.until(
            lambda d: len(d.find_elements(By.CLASS_NAME, "auth-page-container")) > 0
            or len(d.find_elements(By.ID, "auth-email")) > 0
        )
        return wait

    def test_ut_01_register_valid_input(self, driver, frontend_url, backend_url):
        """UT-01: register().
        
        Input: {"name":"Test", "email":"test@example.com", "password":"Password123!"}
        Expected: HTTP 201 Created; JWT token generated
        Status: PASS
        """
        wait = self._open_auth_view(driver, frontend_url)

        # Switch to Create Account mode in browser
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = next((b for b in sub_toggles if "Create Account" in b.text), None)
        if create_btn:
            driver.execute_script("arguments[0].click();", create_btn)
            time.sleep(0.4)

        ts = int(time.time() * 1000)
        valid_email = f"test_{ts}@example.com"
        valid_password = "Password123!"

        # UI filling
        name_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        name_input.clear()
        name_input.send_keys("Test")

        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys(valid_email)

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys(valid_password)
        time.sleep(0.5)

        # API Direct Assertion: HTTP 201 Created with JWT token
        res = requests.post(
            f"{backend_url}/api/auth/register",
            json={"name": "Test", "email": valid_email, "password": valid_password},
            headers={"Content-Type": "application/json", "x-test-suite": "true"},
            timeout=10,
        )
        assert res.status_code == 201, f"Expected 201 Created, got {res.status_code}: {res.text}"
        data = res.json()
        assert data.get("success") is True
        assert len(data.get("token", "")) > 0, "JWT token must be generated"
        assert data.get("user", {}).get("email") == valid_email
        print(f"\n[UT-01] Valid registration returned HTTP 201 and valid JWT token for {valid_email}")

    def test_ut_02_register_password_length_short(self, driver, frontend_url, backend_url):
        """UT-02: register().
        
        Input: password length = 5 ("12345")
        Expected: HTTP 400 Bad Request with password-length validation error
        Status: PASS
        """
        wait = self._open_auth_view(driver, frontend_url)

        # Switch to Create Account mode in browser
        sub_toggles = driver.find_elements(By.CLASS_NAME, "auth-sub-toggle-btn")
        create_btn = next((b for b in sub_toggles if "Create Account" in b.text), None)
        if create_btn:
            driver.execute_script("arguments[0].click();", create_btn)
            time.sleep(0.4)

        ts = int(time.time() * 1000)
        test_email = f"short_pwd_{ts}@example.com"

        name_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-name")))
        name_input.clear()
        name_input.send_keys("Short Pwd User")

        email_input = driver.find_element(By.ID, "auth-email")
        email_input.clear()
        email_input.send_keys(test_email)

        # Enter password with length = 5
        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("12345")
        time.sleep(0.5)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(0.8)

        # Verify browser validation banner
        error_banner = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "at least 6 characters" in error_banner.text.lower()
        time.sleep(0.6)

        # API Direct Assertion: HTTP 400 Bad Request
        res = requests.post(
            f"{backend_url}/api/auth/register",
            json={"name": "Short Pwd User", "email": test_email, "password": "12345"},
            headers={"Content-Type": "application/json", "x-test-suite": "true"},
            timeout=5,
        )
        assert res.status_code == 400, f"Expected 400 Bad Request, got {res.status_code}"
        data = res.json()
        assert data.get("success") is False
        assert "at least 6 characters" in data.get("error", "").lower()
        print("\n[UT-02] Verified password length 5 returns HTTP 400 password-length validation error")

    def test_ut_03_login_unknown_email(self, driver, frontend_url, backend_url):
        """UT-03: login().
        
        Input: Unknown email ("unknown_user_99999@nonexistent.com")
        Expected: HTTP 401 Unauthorized with invalid email/password error
        Status: PASS
        """
        wait = self._open_auth_view(driver, frontend_url)

        unknown_email = f"unknown_{int(time.time()*1000)}@nonexistent.com"

        email_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        email_input.clear()
        email_input.send_keys(unknown_email)

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("AnyPassword123!")
        time.sleep(0.4)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(0.8)

        error_banner = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "invalid email or password" in error_banner.text.lower()
        time.sleep(0.6)

        # API Direct Assertion: HTTP 401
        res = requests.post(
            f"{backend_url}/api/auth/login",
            json={"email": unknown_email, "password": "AnyPassword123!"},
            headers={"Content-Type": "application/json", "x-test-suite": "true"},
            timeout=5,
        )
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        data = res.json()
        assert data.get("success") is False
        assert "invalid email or password" in data.get("error", "").lower()
        print("\n[UT-03] Verified unknown email returns HTTP 401 Unauthorized")

    def test_ut_04_login_incorrect_password(self, driver, frontend_url, backend_url):
        """UT-04: login().
        
        Input: Existing user ("jason@gmail.com") + incorrect password
        Expected: HTTP 401 Unauthorized with invalid email/password error
        Status: PASS
        """
        wait = self._open_auth_view(driver, frontend_url)

        email_input = wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        email_input.clear()
        email_input.send_keys("jason@gmail.com")

        pwd_input = driver.find_element(By.ID, "auth-password")
        pwd_input.clear()
        pwd_input.send_keys("mismatched_wrong_password_999")
        time.sleep(0.4)

        submit_btn = driver.find_element(By.CLASS_NAME, "auth-primary-submit-btn")
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(0.8)

        error_banner = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "form-error")))
        assert error_banner.is_displayed()
        assert "invalid email or password" in error_banner.text.lower()
        time.sleep(0.6)

        # API Direct Assertion: HTTP 401
        res = requests.post(
            f"{backend_url}/api/auth/login",
            json={"email": "jason@gmail.com", "password": "mismatched_wrong_password_999"},
            headers={"Content-Type": "application/json", "x-test-suite": "true"},
            timeout=5,
        )
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        data = res.json()
        assert data.get("success") is False
        assert "invalid email or password" in data.get("error", "").lower()
        print("\n[UT-04] Verified existing user + incorrect password returns HTTP 401 Unauthorized")

    def test_ut_05_generate_summary_empty_transcript(self, backend_url):
        """UT-05: generateMeetingSummary().
        
        Input: rawTranscript = ""
        Expected: Returns createEmptyMeetingMinutes() structured result
        Status: PASS
        """
        cmd = ["npx", "tsx", "src/scripts/test-unit-groq.ts"]
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
        result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, shell=True)
        assert result.returncode == 0, f"Unit test script failed: {result.stderr or result.stdout}"
        assert "UT-05 PASS" in result.stdout
        print("\n[UT-05] Handled short transcript boundary; returned structured empty minutes.")

    def test_ut_06_generate_summary_absent_groq_api_key(self):
        """UT-06: generateMeetingSummary().
        
        Input: Valid transcript with GROQ_API_KEY absent
        Expected: Returns createFallbackMeetingMinutes() structured result
        Status: PASS
        """
        cmd = ["npx", "tsx", "src/scripts/test-unit-groq.ts"]
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
        result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, shell=True)
        assert result.returncode == 0
        assert "UT-06 PASS" in result.stdout
        print("\n[UT-06] Notice logged; returned valid structured fallback minutes without unhandled exceptions.")

    def test_ut_07_transcribe_audio_non_existent_path(self):
        """UT-07: transcribeAudioWithGroqWhisper().
        
        Input: Non-existent audio path
        Expected: Returns { text: "", segments: [] }
        Status: PASS
        """
        cmd = ["npx", "tsx", "src/scripts/test-unit-groq.ts"]
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
        result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, shell=True)
        assert result.returncode == 0
        assert "UT-07 PASS" in result.stdout
        print("\n[UT-07] Filesystem check handled non-existent path safely; returned { text: '', segments: [] }.")

    def test_ut_08_transcribe_audio_tiny_file_size(self):
        """UT-08: transcribeAudioWithGroqWhisper().
        
        Input: Audio file size < 1000 bytes
        Expected: Returns { text: "", segments: [] }
        Status: PASS
        """
        cmd = ["npx", "tsx", "src/scripts/test-unit-groq.ts"]
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
        result = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, shell=True)
        assert result.returncode == 0
        assert "UT-08 PASS" in result.stdout
        print("\n[UT-08] File size guard (<1000 bytes) triggered; returned { text: '', segments: [] }.")
