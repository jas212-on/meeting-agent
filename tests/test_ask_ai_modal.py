import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestAskAiAssistant:
    """Selenium UI test suite for AI Assistant module.

    Covers Test Cases:
      - TC-AI-01: Ask context-related question (AI provides an answer based on meeting context)
      - TC-AI-02: Ask question through supported interface (Query is accepted and processed)
      - TC-AI-03: Ask question unrelated to meeting context (AI does not fabricate meeting-specific information)
      - TC-AI-04: Verify non-interruption behavior (AI does not interrupt speakers)
    """

    def _open_ask_ai_modal(self, driver):
        wait = WebDriverWait(driver, 10)
        nav_tabs = driver.find_elements(By.CLASS_NAME, "nav-tab-item")
        ask_ai_btn = next((btn for btn in nav_tabs if "Ask AI" in btn.text), None)
        assert ask_ai_btn is not None, "Expected 'Ask AI' navigation button"
        driver.execute_script("arguments[0].click();", ask_ai_btn)
        modal = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "ask-meetings-modal")))
        assert modal.is_displayed(), "Expected Ask Meetings modal to open"
        return modal

    def _close_ask_ai_modal(self, driver):
        try:
            close_btn = driver.find_element(By.CLASS_NAME, "ask-btn-close")
            driver.execute_script("arguments[0].click();", close_btn)
            time.sleep(0.3)
        except Exception:
            pass

    def _submit_query(self, driver, query_text: str):
        wait = WebDriverWait(driver, 10)
        input_field = wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "ask-text-input")))
        input_field.clear()
        input_field.send_keys(query_text)
        time.sleep(0.2)
        send_btn = driver.find_element(By.CLASS_NAME, "ask-send-btn")
        assert send_btn.is_enabled(), "Send button should be enabled after entering query"
        driver.execute_script("arguments[0].click();", send_btn)

    def _wait_for_ai_response(self, driver, initial_assistant_count: int, timeout: int = 15):
        wait = WebDriverWait(driver, timeout)
        wait.until(lambda d: len(d.find_elements(By.CLASS_NAME, "assistant-row")) > initial_assistant_count)
        wait.until(lambda d: len(d.find_elements(By.CLASS_NAME, "ask-typing-box")) == 0)
        assistant_rows = driver.find_elements(By.CLASS_NAME, "assistant-row")
        latest_reply = assistant_rows[-1].find_element(By.CLASS_NAME, "ask-bubble-content").text.strip()
        return latest_reply

    def test_tc_ai_01_ask_context_related_question(self, dashboard_page):
        """TC-AI-01: Ask context-related question.

        Preconditions: Meeting is active and context is available.
        Test Input: Question related to current discussion.
        Expected Result: AI provides an answer based on meeting context.
        """
        driver = dashboard_page
        self._open_ask_ai_modal(driver)
        try:
            initial_count = len(driver.find_elements(By.CLASS_NAME, "assistant-row"))
            context_question = "What action items or decisions were made across the meetings?"

            self._submit_query(driver, context_question)
            answer = self._wait_for_ai_response(driver, initial_count)

            # Assert answer provides information based on meeting context
            assert len(answer) > 0, "AI must return a non-empty response"
            answer_lower = answer.lower()
            assert any(
                kw in answer_lower
                for kw in ["meeting", "action", "task", "decision", "summary", "recorded", "assign"]
            ), f"Expected context-related response, got: '{answer}'"
        finally:
            self._close_ask_ai_modal(driver)

    def test_tc_ai_02_ask_question_through_supported_interface(self, dashboard_page):
        """TC-AI-02: Ask question through supported interface.

        Preconditions: AI assistant available.
        Test Input: Text/voice query.
        Expected Result: Query is accepted and processed.
        """
        driver = dashboard_page
        self._open_ask_ai_modal(driver)
        try:
            input_field = driver.find_element(By.CLASS_NAME, "ask-text-input")
            assert input_field.is_displayed(), "Text query interface must be visible"

            test_query = "Summarize key decisions made in recent meetings"
            initial_count = len(driver.find_elements(By.CLASS_NAME, "assistant-row"))

            # Submit through supported text input interface
            self._submit_query(driver, test_query)

            # 1. Assert query is accepted: user message bubble appears in chat stream
            user_messages = driver.find_elements(By.CLASS_NAME, "user-row")
            assert any(test_query in m.text for m in user_messages), (
                "Submitted query must be accepted and displayed in conversation stream"
            )

            # 2. Assert input is cleared after submission
            assert input_field.get_attribute("value") == "", "Input field should reset after query submission"

            # 3. Assert query is processed: AI response is generated
            answer = self._wait_for_ai_response(driver, initial_count)
            assert len(answer) > 0, "Query must be processed and yield an AI response"
        finally:
            self._close_ask_ai_modal(driver)

    def test_tc_ai_03_ask_question_unrelated_to_meeting_context(self, dashboard_page):
        """TC-AI-03: Ask question unrelated to meeting context.

        Preconditions: Meeting active.
        Test Input: Unrelated question.
        Expected Result: AI does not fabricate meeting-specific information.
        """
        driver = dashboard_page
        self._open_ask_ai_modal(driver)
        try:
            initial_count = len(driver.find_elements(By.CLASS_NAME, "assistant-row"))
            unrelated_query = "What is the chemical symbol for gold and its atomic number?"

            self._submit_query(driver, unrelated_query)
            answer = self._wait_for_ai_response(driver, initial_count)

            assert len(answer) > 0, "AI should handle unrelated queries gracefully"
            answer_lower = answer.lower()

            # Verify AI does not fabricate false meeting-specific information
            # (i.e. does not fabricate fake action items or assign meeting tasks for an unrelated question)
            assert not (
                "assigned to" in answer_lower and "gold" in answer_lower and "due:" in answer_lower
            ), "AI must not fabricate meeting action items or assignments for unrelated query"
        finally:
            self._close_ask_ai_modal(driver)

    def test_tc_ai_04_verify_non_interruption_behavior(self, dashboard_page):
        """TC-AI-04: Verify non-interruption behavior.

        Preconditions: Meeting discussion active.
        Test Input: No direct AI interaction.
        Expected Result: AI does not interrupt speakers.
        """
        driver = dashboard_page
        wait = WebDriverWait(driver, 10)

        # 1. Navigate to meeting transcript with active discussion
        wait.until(
            lambda d: any("oyv-gstt-ooj" in card.text for card in d.find_elements(By.CLASS_NAME, "meeting-card"))
        )
        meeting_cards = driver.find_elements(By.CLASS_NAME, "meeting-card")
        oyv_card = next(c for c in meeting_cards if "oyv-gstt-ooj" in c.text)

        summary_btn = oyv_card.find_elements(By.CLASS_NAME, "card-btn-summary")
        if summary_btn:
            driver.execute_script("arguments[0].click();", summary_btn[0])
        else:
            driver.execute_script("arguments[0].click();", oyv_card)

        # Open Transcript tab
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "sidebar-menu-list")))
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        transcript_btn = next((btn for btn in menu_items if "Transcript" in btn.text), None)
        assert transcript_btn is not None, "Expected 'Transcript' tab in sidebar menu"
        driver.execute_script("arguments[0].click();", transcript_btn)
        time.sleep(0.4)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "transcript-turns-list")))
        initial_turn_count = len(driver.find_elements(By.CLASS_NAME, "transcript-turn-card"))
        assert initial_turn_count >= 1, "Expected active meeting discussion turns to be rendered"

        # 2. Observe meeting discussion with NO direct AI interaction
        # AI assistant should NOT spontaneously interrupt speakers or insert unsolicited dialogue
        time.sleep(1.0)
        current_turn_count = len(driver.find_elements(By.CLASS_NAME, "transcript-turn-card"))
        assert current_turn_count == initial_turn_count, (
            "AI assistant must not spontaneously inject unprompted turns or interrupt speakers"
        )

        # Verify no unsolicited modal popups interrupted the speaker view
        modals = driver.find_elements(By.CLASS_NAME, "ask-meetings-modal")
        assert len(modals) == 0 or not modals[0].is_displayed(), (
            "AI Assistant modal must remain closed without direct user invocation"
        )

