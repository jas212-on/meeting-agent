import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestAskAiModalUI:
    """Selenium UI test suite for the 'Ask AI' Groq RAG knowledge assistant modal."""

    def test_tc01_open_ask_ai_modal_and_verify_header(self, dashboard_page):
        """TC_ASK_AI_01: Verify clicking 'Ask AI' opens the modal with AI badge and scope selector."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        # Click the Ask AI nav button via JS
        ask_ai_btn = next(btn for btn in driver.find_elements(By.CLASS_NAME, "nav-tab-item") if "Ask AI" in btn.text)
        driver.execute_script("arguments[0].click();", ask_ai_btn)

        modal = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))
        assert modal.is_displayed(), "Expected Ask Meetings modal to open"

        # Check title and Groq AI badge (case-insensitive)
        title_elem = driver.find_element(By.CLASS_NAME, "ask-header-title")
        assert "Ask My Meetings" in title_elem.text

        badge_elem = driver.find_element(By.CLASS_NAME, "ask-badge-ai")
        assert "GROQ AI" in badge_elem.text.upper()

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
        driver.execute_script("arguments[0].click();", close_btn)

    def test_tc02_query_input_and_send_button_reactivity(self, dashboard_page):
        """TC_ASK_AI_02: Verify send button is disabled when query is empty, and enables when text is entered."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        ask_ai_btn = next(btn for btn in driver.find_elements(By.CLASS_NAME, "nav-tab-item") if "Ask AI" in btn.text)
        driver.execute_script("arguments[0].click();", ask_ai_btn)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))

        input_field = driver.find_element(By.CLASS_NAME, "ask-text-input")
        send_btn = driver.find_element(By.CLASS_NAME, "ask-send-btn")

        # 1. Empty input -> send button disabled
        input_field.clear()
        assert not send_btn.is_enabled(), "Expected send button to be disabled for empty query input"

        # 2. Type query -> send button enabled
        input_field.send_keys("What were the major decisions regarding beta deployment?")
        assert send_btn.is_enabled(), "Expected send button to become enabled after entering text"

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
        driver.execute_script("arguments[0].click();", close_btn)

    def test_tc03_clear_conversation_history(self, dashboard_page):
        """TC_ASK_AI_03: Verify clicking the reset button clears the conversation history."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        ask_ai_btn = next(btn for btn in driver.find_elements(By.CLASS_NAME, "nav-tab-item") if "Ask AI" in btn.text)
        driver.execute_script("arguments[0].click();", ask_ai_btn)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))

        # Click the clear history button
        clear_btn = driver.find_element(By.CLASS_NAME, "ask-btn-ghost")
        driver.execute_script("arguments[0].click();", clear_btn)
        time.sleep(0.3)

        # Message container should show cleared message
        messages = driver.find_elements(By.CLASS_NAME, "ask-bubble-content")
        assert any("Chat history cleared" in m.text for m in messages), "Expected 'Chat history cleared' notification"

        # Close modal
        close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
        driver.execute_script("arguments[0].click();", close_btn)

    def test_tc04_close_modal_via_close_button(self, dashboard_page):
        """TC_ASK_AI_04: Verify clicking the 'X' button dismisses the modal cleanly."""
        driver = dashboard_page
        wait = WebDriverWait(driver, 5)

        ask_ai_btn = next(btn for btn in driver.find_elements(By.CLASS_NAME, "nav-tab-item") if "Ask AI" in btn.text)
        driver.execute_script("arguments[0].click();", ask_ai_btn)

        modal = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))
        assert modal.is_displayed()

        close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
        driver.execute_script("arguments[0].click();", close_btn)
        time.sleep(0.3)

        # Modal should be removed or invisible
        modals = driver.find_elements(By.CLASS_NAME, "ask-meetings-modal")
        assert len(modals) == 0 or not modals[0].is_displayed(), "Expected modal to be dismissed"
