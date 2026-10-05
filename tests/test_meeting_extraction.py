import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestMeetingOyvExtraction:
    """Selenium UI test suite for Decision & Action Item Extraction specifically on meeting link 'oyv-gstt-ooj'.

    Covers CSE312 Test Cases (Section 4.6 Decision & Action Item Extraction Testing):
      - TC-EXT-01: Detect meeting decision (Decision is extracted from transcript containing explicit decision)
      - TC-EXT-02: Detect action item (Action item is extracted from transcript statement assigning a task)
      - TC-EXT-03: Identify assignee (Correct assignee is associated with the action item)
      - TC-EXT-04: Identify deadline (Explicit deadline is extracted and associated with the action item)
    """

    MEETING_ID = "oyv-gstt-ooj"
    MEETING_URL = "https://meet.google.com/oyv-gstt-ooj"

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

        # 3. Scroll and click to open meeting details
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

    def _switch_sidebar_tab(self, driver, tab_name: str):
        """Helper to switch between sidebar tabs (Minutes, Action Items, Attendance, Transcript)."""
        wait = WebDriverWait(driver, 10)
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        tab_btn = next((btn for btn in menu_items if tab_name.lower() in btn.text.lower()), None)
        assert tab_btn is not None, f"Expected '{tab_name}' tab in sidebar menu"
        driver.execute_script("arguments[0].click();", tab_btn)
        time.sleep(0.4)

    def test_tc_ext_01_detect_meeting_decision(self, dashboard_page):
        """TC-EXT-01: Detect meeting decision for meeting oyv-gstt-ooj.

        Preconditions: Meeting transcript available.
        Test Input: Transcript containing an explicit decision.
        Expected Result: Decision is extracted successfully.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # 1. Verify transcript contains an explicit decision
        self._switch_sidebar_tab(driver, "Transcript")
        turn_cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        assert len(turn_cards) >= 1, "Transcript turns must be present"

        transcript_text = " ".join([card.text for card in turn_cards])
        assert "decided" in transcript_text.lower() or "deploy" in transcript_text.lower(), (
            "Transcript should contain discussion with an explicit decision"
        )

        # 2. Switch to Overview & Stats tab to verify extracted decision
        self._switch_sidebar_tab(driver, "Overview")

        wait = WebDriverWait(driver, 5)
        wait.until(lambda d: any("Key Decisions" in p.text for p in d.find_elements(By.CLASS_NAME, "white-panel-card")))

        # Locate Key Decisions panel
        panels = driver.find_elements(By.CLASS_NAME, "white-panel-card")
        decisions_panel = next((p for p in panels if "Key Decisions" in p.text), None)
        assert decisions_panel is not None, "Expected 'Key Decisions' panel in meeting overview"

        # Verify extracted decision content
        panel_text = decisions_panel.text
        assert "No explicit key decisions logged" not in panel_text, "Decisions panel must not be empty"
        assert "deploy" in panel_text.lower() or "friday" in panel_text.lower(), (
            f"Expected extracted decision in panel, got: '{panel_text}'"
        )

    def test_tc_ext_02_detect_action_item(self, dashboard_page):
        """TC-EXT-02: Detect action item for meeting oyv-gstt-ooj.

        Preconditions: Meeting transcript available.
        Test Input: Statement assigning a task.
        Expected Result: Action item is extracted successfully.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # 1. Verify transcript contains a task statement
        self._switch_sidebar_tab(driver, "Transcript")
        turn_cards = driver.find_elements(By.CLASS_NAME, "transcript-turn-card")
        transcript_text = " ".join([card.text for card in turn_cards])
        assert "audit" in transcript_text.lower() or "report" in transcript_text.lower(), (
            "Transcript should contain task assignment statement"
        )

        # 2. Switch to Action Items tab
        self._switch_sidebar_tab(driver, "Action Items")

        wait = WebDriverWait(driver, 5)
        heading = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "section-main-heading")))
        assert "Action Items" in heading.text

        # 3. Assert action item is extracted and rendered
        action_cards = driver.find_elements(By.CSS_SELECTOR, "div[style*='cursor: pointer']")
        task_elements = [c for c in action_cards if "audit" in c.text.lower() or "security" in c.text.lower()]
        assert len(task_elements) > 0, "Expected extracted action item for security audit"

        task_text = task_elements[0].text
        assert "security audit" in task_text.lower(), f"Action item must contain task description, got: '{task_text}'"

    def test_tc_ext_03_identify_assignee(self, dashboard_page):
        """TC-EXT-03: Identify assignee for meeting oyv-gstt-ooj.

        Preconditions: Action item contains responsible person.
        Test Input: Assigned task.
        Expected Result: Correct assignee is associated with the action.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)
        self._switch_sidebar_tab(driver, "Action Items")

        wait = WebDriverWait(driver, 5)
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "section-main-heading")))

        # Locate action item details
        action_cards = driver.find_elements(By.CSS_SELECTOR, "div[style*='cursor: pointer']")
        task_elements = [c for c in action_cards if "audit" in c.text.lower() or "jason" in c.text.lower()]
        assert len(task_elements) > 0, "Expected action item card"

        card_text = task_elements[0].text

        # Assert correct assignee is identified and associated
        assert "Assignee:" in card_text, "Action item must display Assignee field"
        assert "Jason Bobby" in card_text, f"Expected assignee 'Jason Bobby', got: '{card_text}'"
        assert "Unassigned" not in card_text, "Assignee should not be 'Unassigned'"

    def test_tc_ext_04_identify_deadline(self, dashboard_page):
        """TC-EXT-04: Identify deadline for meeting oyv-gstt-ooj.

        Preconditions: Action item contains deadline.
        Test Input: Assigned task with deadline.
        Expected Result: Explicit deadline is extracted successfully.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)
        self._switch_sidebar_tab(driver, "Action Items")

        wait = WebDriverWait(driver, 5)
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "section-main-heading")))

        # Locate action item details
        action_cards = driver.find_elements(By.CSS_SELECTOR, "div[style*='cursor: pointer']")
        task_elements = [c for c in action_cards if "audit" in c.text.lower() or "due" in c.text.lower()]
        assert len(task_elements) > 0, "Expected action item card"

        card_text = task_elements[0].text

        # Assert explicit deadline is extracted and displayed
        assert "Due:" in card_text or "due" in card_text.lower(), "Action item must display due date/deadline"
        assert "Tomorrow" in card_text or "5 PM" in card_text, (
            f"Expected explicit deadline 'Tomorrow 5 PM' in action item, got: '{card_text}'"
        )
