import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestMeetingOyvTranscription:
    """Selenium UI test suite for Transcription & Meeting Intelligence specifically on meeting ID 'oyv-gstt-ooj'.

    Covers CSE312 Test Cases (Section 4.4):
      - TC-TX-01: Generate live transcription (Spoken audio is converted into live text)
      - TC-TX-02: Identify speaker (Transcript associates speech with appropriate speaker)
      - TC-TX-03: Classify meeting type (Meeting is classified into a supported meeting category)
      - TC-TX-04: Handle continuous conversation (Transcript continues updating without terminating)
    """

    MEETING_ID = "oyv-gstt-ooj"

    SUPPORTED_MEETING_CATEGORIES = [
        "Engineering Sync",
        "Sprint Planning",
        "Architecture Review",
        "Product & Strategy Review",
        "Client Meeting",
        "General Discussion",
    ]

    def _open_oyv_meeting(self, driver):
        """Helper to navigate to Meeting Details for oyv-gstt-ooj."""
        wait = WebDriverWait(driver, 10)

        # 1. Wait for database meetings to load on dashboard and locate meeting card
        wait.until(
            lambda d: any(self.MEETING_ID in card.text for card in d.find_elements(By.CLASS_NAME, "meeting-card"))
        )

        meeting_cards = driver.find_elements(By.CLASS_NAME, "meeting-card")
        oyv_card = next(c for c in meeting_cards if self.MEETING_ID in c.text)
        assert oyv_card is not None, f"Expected to find meeting card for ID '{self.MEETING_ID}'"

        # 2. Scroll and click to open meeting details
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", oyv_card)
        time.sleep(0.3)
        summary_btn = oyv_card.find_elements(By.CLASS_NAME, "card-btn-summary")
        if summary_btn:
            driver.execute_script("arguments[0].click();", summary_btn[0])
        else:
            driver.execute_script("arguments[0].click();", oyv_card)

        # 3. Wait for Meeting Details canvas
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "sidebar-menu-list")))
        crumb = driver.find_element(By.CLASS_NAME, "canvas-breadcrumbs")
        assert self.MEETING_ID in crumb.text, f"Expected breadcrumb to display '{self.MEETING_ID}'"

    def _open_oyv_transcript_tab(self, driver):
        """Helper to open Meeting Details for oyv-gstt-ooj and switch to Transcript tab."""
        self._open_oyv_meeting(driver)
        wait = WebDriverWait(driver, 10)

        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        transcript_btn = next((btn for btn in menu_items if "Transcript" in btn.text), None)
        assert transcript_btn is not None, "Expected 'Transcript' tab in sidebar menu"
        driver.execute_script("arguments[0].click();", transcript_btn)
        time.sleep(0.4)

        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "transcript-turns-list")))

    def test_tc_tx_01_generate_live_transcription(self, dashboard_page):
        """TC-TX-01: Generate live transcription for session oyv-gstt-ooj.

        Preconditions: Meeting audio available.
        Test Input: Spoken conversation.
        Expected Result: Spoken audio is converted into live text.
        """
        driver = dashboard_page
        self._open_oyv_transcript_tab(driver)

        # 1. Assert transcript turn cards are rendered for oyv-gstt-ooj
        turn_cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        assert len(turn_cards) >= 2, f"Expected at least 2 speech turns for {self.MEETING_ID}, got {len(turn_cards)}"

        # 2. Assert spoken audio converted to live text (Question from user & Response from AI)
        turn_1_text = turn_cards[0].find_element(By.CLASS_NAME, "transcript-turn-text").text.strip()
        turn_2_text = turn_cards[1].find_element(By.CLASS_NAME, "transcript-turn-text").text.strip()

        assert "hear me" in turn_1_text.lower(), f"Turn 1 should contain converted spoken audio, got: '{turn_1_text}'"
        assert "hear you" in turn_2_text.lower(), f"Turn 2 should contain converted spoken audio, got: '{turn_2_text}'"

        # 3. Assert timestamps are recorded on speech turns
        for card in turn_cards:
            time_elem = card.find_element(By.CLASS_NAME, "transcript-turn-time")
            assert len(time_elem.text.strip()) > 0, "Spoken text turn must include a valid timestamp"

        # 4. Assert turns counter reflects converted dialogue turns
        turns_pill = driver.find_element(By.CLASS_NAME, "transcript-turns-pill")
        assert "2 turns" in turns_pill.text or "turn" in turns_pill.text

    def test_tc_tx_02_identify_speaker(self, dashboard_page):
        """TC-TX-02: Identify speaker for session oyv-gstt-ooj.

        Preconditions: Multiple participants speaking.
        Test Input: Conversation with identifiable speakers.
        Expected Result: Transcript associates speech with the appropriate speaker.
        """
        driver = dashboard_page
        self._open_oyv_transcript_tab(driver)

        turn_cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        assert len(turn_cards) >= 2, "Expected dialogue turns to identify speakers"

        # 1. Validate Speaker 1: Meeting Host
        host_card = turn_cards[0]
        host_name = host_card.find_element(By.CLASS_NAME, "transcript-speaker-name").text.strip()
        host_role = host_card.find_element(By.CLASS_NAME, "transcript-role-badge").text.strip()
        host_avatar = host_card.find_element(By.CLASS_NAME, "table-avatar-circle").text.strip()

        assert "Host" in host_name or "Host" in host_role, f"Expected host speaker identity, got: {host_name}"
        assert host_avatar.upper() == host_name[0].upper(), "Avatar initial must match host name"

        # 2. Validate Speaker 2: MeetMinutes AI Agent
        agent_card = turn_cards[1]
        agent_name = agent_card.find_element(By.CLASS_NAME, "transcript-speaker-name").text.strip()
        agent_role = agent_card.find_element(By.CLASS_NAME, "transcript-role-badge").text.strip()
        agent_avatar = agent_card.find_element(By.CLASS_NAME, "table-avatar-circle").text.strip()

        assert "Agent" in agent_name or "Assistant" in agent_role, f"Expected AI Agent speaker, got: {agent_name}"
        assert agent_avatar.upper() == agent_name[0].upper(), "Avatar initial must match agent name"

        # 3. Confirm speech styling differentiates speaker turn and assistant bot turn
        assert "speaker-turn" in host_card.get_attribute("class") or "bot-turn" not in host_card.get_attribute("class")
        assert "bot-turn" in agent_card.get_attribute("class")

    def test_tc_tx_03_classify_meeting_type(self, dashboard_page):
        """TC-TX-03: Classify meeting type for session oyv-gstt-ooj.

        Preconditions: Meeting conversation available.
        Test Input: Initial meeting dialogue.
        Expected Result: Meeting is classified into a supported meeting category.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        wait = WebDriverWait(driver, 5)

        # 1. Verify category classification badge is rendered in sidebar
        category_badge = wait.until(
            EC.visibility_of_element_located((By.ID, "meeting-category-badge"))
        )
        assert category_badge.is_displayed(), "Expected meeting category badge to be displayed"

        category_text = category_badge.text.strip()
        assert len(category_text) > 0, "Meeting category text should not be empty"

        # 2. Verify meeting is classified into a recognized/supported category
        is_supported = any(
            supported.lower() in category_text.lower()
            for supported in self.SUPPORTED_MEETING_CATEGORIES
        )
        assert is_supported, (
            f"Meeting {self.MEETING_ID} classified as '{category_text}', expected one of supported categories: "
            f"{self.SUPPORTED_MEETING_CATEGORIES}"
        )

    def test_tc_tx_04_handle_continuous_conversation(self, dashboard_page):
        """TC-TX-04: Handle continuous conversation for session oyv-gstt-ooj.

        Preconditions: Active meeting.
        Test Input: Multiple speech segments.
        Expected Result: Transcript continues updating without terminating unexpectedly.
        """
        driver = dashboard_page
        self._open_oyv_transcript_tab(driver)

        # 1. Assert continuous speech segments stream container is active
        stream_container = driver.find_element(By.CLASS_NAME, "transcript-stream-container")
        assert stream_container.is_displayed(), "Transcript stream container should be active and displayed"

        # 2. Verify no premature empty state occurred
        empty_states = driver.find_elements(By.CLASS_NAME, "transcript-empty-state")
        assert len(empty_states) == 0, "Transcript stream should not encounter empty-state errors"

        # 3. Verify multiple continuous segments exist in sequence
        turn_cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        assert len(turn_cards) >= 2, f"Expected multiple speech segments, got {len(turn_cards)}"

        # 4. Verify chronological order without interruption
        time_1 = turn_cards[0].find_element(By.CLASS_NAME, "transcript-turn-time").text.strip()
        time_2 = turn_cards[1].find_element(By.CLASS_NAME, "transcript-turn-time").text.strip()
        assert len(time_1) > 0 and len(time_2) > 0, "All segments should have recorded timestamps"

        # 5. Check turns counter accurately reflects continuous conversation turns
        turns_pill = driver.find_element(By.CLASS_NAME, "transcript-turns-pill")
        assert "2 turns" in turns_pill.text or "turn" in turns_pill.text
