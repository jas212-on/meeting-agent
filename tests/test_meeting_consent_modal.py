import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from tests.conftest import enter_meet_url


class TestMeetingConsentModalUI:
    """UI test suite for Meeting Recording & Audio Consent Modal."""

    def test_tc01_join_button_opens_consent_modal(self, dashboard_page):
        """TC_CONSENT_01: Verify clicking 'Join & Record' displays the consent modal with audio/screen permissions."""
        driver = dashboard_page
        valid_url = "https://meet.google.com/abc-defg-hij"
        enter_meet_url(driver, valid_url)

        join_btn = driver.find_element(By.ID, "join-btn")
        assert join_btn.is_enabled(), "Expected Join button to be enabled for valid link"
        join_btn.click()

        wait = WebDriverWait(driver, 5)
        modal_overlay = wait.until(
            EC.visibility_of_element_located((By.ID, "consent-modal-overlay"))
        )
        assert modal_overlay.is_displayed(), "Expected consent modal overlay to be displayed"

        # Check title and permissions
        modal_title = driver.find_element(By.ID, "consent-modal-title")
        assert "Meeting Recording Consent" in modal_title.text

        # Check room url preview
        url_preview = driver.find_element(By.CLASS_NAME, "consent-url-value")
        assert valid_url in url_preview.text

        # Verify buttons present
        allow_btn = driver.find_element(By.ID, "consent-allow-btn")
        cancel_btn = driver.find_element(By.ID, "consent-cancel-btn")
        assert allow_btn.is_displayed()
        assert cancel_btn.is_displayed()

        # Close via close button to leave clean
        close_btn = driver.find_element(By.ID, "consent-modal-close")
        close_btn.click()
        time.sleep(0.3)

    def test_tc02_cancel_consent_modal_aborts_meeting_join(self, dashboard_page):
        """TC_CONSENT_02: Verify clicking 'Don't Allow' closes the modal and does NOT start the bot."""
        driver = dashboard_page
        valid_url = "https://meet.google.com/xyz-qwer-tyu"
        enter_meet_url(driver, valid_url)

        join_btn = driver.find_element(By.ID, "join-btn")
        join_btn.click()

        wait = WebDriverWait(driver, 5)
        cancel_btn = wait.until(
            EC.element_to_be_clickable((By.ID, "consent-cancel-btn"))
        )
        cancel_btn.click()

        # Wait for modal overlay to disappear
        wait.until(EC.invisibility_of_element_located((By.ID, "consent-modal-overlay")))

        # Verify bot did NOT join: Join button is still visible and enabled
        time.sleep(0.5)
        join_btn_after = driver.find_element(By.ID, "join-btn")
        assert join_btn_after.is_displayed(), "Join button should still be visible because user declined consent"

        # Verify leave button is NOT present
        leave_buttons = driver.find_elements(By.ID, "leave-btn")
        assert len(leave_buttons) == 0, "Leave button should not exist as meeting was aborted"

    def test_tc03_allow_consent_modal_starts_meeting(self, dashboard_page):
        """TC_CONSENT_03: Verify clicking 'Allow & Join Meeting' grants consent and joins call."""
        driver = dashboard_page
        valid_url = "https://meet.google.com/eng-sync-k9x"
        enter_meet_url(driver, valid_url)

        join_btn = driver.find_element(By.ID, "join-btn")
        join_btn.click()

        wait = WebDriverWait(driver, 5)
        allow_btn = wait.until(
            EC.element_to_be_clickable((By.ID, "consent-allow-btn"))
        )
        allow_btn.click()

        # Modal should close
        wait.until(EC.invisibility_of_element_located((By.ID, "consent-modal-overlay")))

        # The bot should start connecting/running and show leave button
        leave_btn = wait.until(
            EC.visibility_of_element_located((By.ID, "leave-btn"))
        )
        assert leave_btn.is_displayed(), "Meeting should start and display leave button after granting consent"

        # Cleanup: click leave button to finish session
        leave_btn.click()
        time.sleep(1)
