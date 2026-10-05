import time
import pytest
import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestMeetingSummarizationReports:
    """Selenium UI & API test suite for Summarization & Reports module.

    Covers Test Cases:
      - TC-REP-01: Generate meeting summary (Structured summary is generated for completed meeting)
      - TC-REP-02: Verify summary contents (Summary contains relevant agenda, key decisions, and action items)
      - TC-REP-03: Store meeting report (Report is stored and associated with meeting in database)
      - TC-REP-04: Retrieve historical report (Authorized user retrieves and views historical meeting report)
      - TC-REP-05: Search historical meetings (Search/filter query returns matching historical meetings)
      - TC-REP-06: Export report as PDF (Report is successfully exported in PDF format)
    """

    MEETING_ID = "oyv-gstt-ooj"

    def _open_oyv_meeting(self, driver):
        """Helper to navigate to Meeting Details for oyv-gstt-ooj."""
        wait = WebDriverWait(driver, 10)

        wait.until(
            lambda d: any(self.MEETING_ID in card.text for card in d.find_elements(By.CLASS_NAME, "meeting-card"))
        )

        meeting_cards = driver.find_elements(By.CLASS_NAME, "meeting-card")
        oyv_card = next(c for c in meeting_cards if self.MEETING_ID in c.text)
        assert oyv_card is not None, f"Expected to find meeting card for ID '{self.MEETING_ID}'"

        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", oyv_card)
        time.sleep(0.3)
        summary_btn = oyv_card.find_elements(By.CLASS_NAME, "card-btn-summary")
        if summary_btn:
            driver.execute_script("arguments[0].click();", summary_btn[0])
        else:
            driver.execute_script("arguments[0].click();", oyv_card)

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

    def test_tc_rep_01_generate_meeting_summary(self, dashboard_page):
        """TC-REP-01: Generate meeting summary.

        Preconditions: Meeting has ended.
        Test Input: Completed meeting.
        Expected Result: Structured summary is generated.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # 1. Assert status indicates meeting has completed
        status_tags = driver.find_elements(By.CLASS_NAME, "status-pill-green")
        assert any("Completed" in s.text for s in status_tags), "Meeting status should indicate 'Completed'"

        # 2. Switch to Minutes & Topics tab
        self._switch_sidebar_tab(driver, "Minutes")

        # 3. Assert structured Executive Summary is generated
        wait = WebDriverWait(driver, 5)
        heading = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "section-main-heading")))
        assert "Minutes & Topics" in heading.text

        panels = driver.find_elements(By.CLASS_NAME, "white-panel-card")
        summary_panel = next((p for p in panels if "Executive Summary" in p.text), None)
        assert summary_panel is not None, "Expected 'Executive Summary' panel"

        summary_text = summary_panel.find_element(By.CLASS_NAME, "panel-body-p").text.strip()
        assert len(summary_text) > 20, "Structured executive summary should contain informative text"
        assert "release" in summary_text.lower() or "meeting" in summary_text.lower(), (
            f"Expected structured summary, got: '{summary_text}'"
        )

    def test_tc_rep_02_verify_summary_contents(self, dashboard_page):
        """TC-REP-02: Verify summary contents.

        Preconditions: Summary generated.
        Test Input: Meeting containing agenda, decisions and actions.
        Expected Result: Summary contains relevant agenda/key points, decisions and action items.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # 1. Verify Agenda / Chronological Discussion Topics
        self._switch_sidebar_tab(driver, "Minutes")
        panels = driver.find_elements(By.CLASS_NAME, "white-panel-card")
        topics_panel = next((p for p in panels if "Discussion Topics" in p.text), None)
        assert topics_panel is not None, "Expected Discussion Topics / Agenda section"
        topics_text = topics_panel.text
        assert "No chronological discussion topics" not in topics_text, "Discussion topics should not be empty"
        assert "deployment" in topics_text.lower() or "audit" in topics_text.lower(), (
            f"Expected agenda/topics content, got: '{topics_text}'"
        )

        # 2. Verify Key Decisions
        self._switch_sidebar_tab(driver, "Overview")
        wait = WebDriverWait(driver, 5)
        wait.until(lambda d: any("Key Decisions" in p.text for p in d.find_elements(By.CLASS_NAME, "white-panel-card")))

        overview_panels = driver.find_elements(By.CLASS_NAME, "white-panel-card")
        decisions_panel = next((p for p in overview_panels if "Key Decisions" in p.text), None)
        assert decisions_panel is not None, "Expected Key Decisions panel"
        assert "deploy" in decisions_panel.text.lower() or "friday" in decisions_panel.text.lower(), (
            "Summary must contain recorded key decisions"
        )

        # 3. Verify Action Items
        actions_panel = next((p for p in overview_panels if "Action Items" in p.text), None)
        assert actions_panel is not None, "Expected Action Items panel"
        assert "audit" in actions_panel.text.lower() or "jason" in actions_panel.text.lower(), (
            "Summary must contain actionable next steps"
        )

    def test_tc_rep_03_store_meeting_report(self, backend_url):
        """TC-REP-03: Store meeting report.

        Preconditions: Meeting completed.
        Test Input: Generated report.
        Expected Result: Report is stored and associated with meeting.
        """
        # Fetch the stored meeting document from the backend database API
        res = requests.get(f"{backend_url}/api/meetings/{self.MEETING_ID}", timeout=5)
        assert res.status_code == 200, f"Expected HTTP 200 from meetings API, got {res.status_code}"

        data = res.json()
        assert data.get("success") is True, "Expected success response from meeting API"

        meeting = data.get("meeting")
        assert meeting is not None, "Stored meeting record must exist"
        assert meeting.get("meetingId") == self.MEETING_ID, f"Report must be associated with meeting {self.MEETING_ID}"

        # Assert report subdocument exists and is populated
        minutes = meeting.get("minutes")
        assert minutes is not None, "Meeting record must contain stored minutes report"
        assert len(minutes.get("summary", "")) > 0, "Stored report must contain summary"
        assert len(minutes.get("keyDecisions", [])) >= 1, "Stored report must contain key decisions"
        assert len(minutes.get("actionItems", [])) >= 1, "Stored report must contain action items"
        assert len(minutes.get("discussionTopics", [])) >= 1, "Stored report must contain discussion topics"

    def test_tc_rep_04_retrieve_historical_report(self, dashboard_page):
        """TC-REP-04: Retrieve historical report.

        Preconditions: Authorized user; report exists.
        Test Input: Search/view historical meeting.
        Expected Result: Correct historical report is displayed.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # Assert correct historical meeting report identity is displayed
        title_elem = driver.find_element(By.CLASS_NAME, "sidebar-meet-title")
        assert self.MEETING_ID in title_elem.text, (
            f"Expected historical meeting title to display '{self.MEETING_ID}', got: '{title_elem.text}'"
        )

        crumb = driver.find_element(By.CLASS_NAME, "canvas-breadcrumbs")
        assert self.MEETING_ID in crumb.text, "Historical report breadcrumb must match meeting ID"

        # Assert historical report summary and details are rendered
        self._switch_sidebar_tab(driver, "Minutes")
        summary_elem = driver.find_element(By.CLASS_NAME, "panel-body-p")
        assert len(summary_elem.text.strip()) > 0, "Historical report executive summary must be visible"

    def test_tc_rep_05_search_historical_meetings(self, dashboard_page):
        """TC-REP-05: Search historical meetings.

        Preconditions: Historical data exists.
        Test Input: Search/filter query.
        Expected Result: Matching historical meetings are returned.
        """
        driver = dashboard_page
        wait = WebDriverWait(driver, 10)

        # 1. Wait for meeting cards to be populated
        wait.until(
            lambda d: len(d.find_elements(By.CLASS_NAME, "meeting-card")) > 1
        )
        total_initial_cards = len(driver.find_elements(By.CLASS_NAME, "meeting-card"))
        assert total_initial_cards >= 2, "Expected multiple historical meetings in workspace"

        # 2. Locate search input
        search_input = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "history-search-input")))
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", search_input)
        time.sleep(0.3)

        # 3. Search for specific meeting query "oyv-gstt"
        search_query = "oyv-gstt"
        search_input.send_keys(Keys.CONTROL + "a")
        search_input.send_keys(Keys.BACKSPACE)
        search_input.send_keys(search_query)
        time.sleep(0.5)

        # Assert only matching cards are returned
        wait.until(
            lambda d: any(search_query in card.text.lower() for card in d.find_elements(By.CLASS_NAME, "meeting-card"))
        )
        filtered_cards = driver.find_elements(By.CLASS_NAME, "meeting-card")
        assert len(filtered_cards) >= 1, f"Expected matching cards for query '{search_query}'"
        for card in filtered_cards:
            assert search_query in card.text.lower(), f"Card text should match search query: {card.text}"

        # 4. Search for non-existent meeting to test empty state
        search_input = driver.find_element(By.CLASS_NAME, "history-search-input")
        search_input.send_keys(Keys.CONTROL + "a")
        search_input.send_keys(Keys.BACKSPACE)
        search_input.send_keys("nonexistent-meeting-999")
        time.sleep(0.5)

        empty_box = wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "history-empty")))
        assert empty_box.is_displayed(), "Expected empty state card when no meetings match"

        # 5. Clear search query to restore all meetings
        clear_btn = driver.find_elements(By.CLASS_NAME, "clear-search-btn")
        if clear_btn:
            driver.execute_script("arguments[0].click();", clear_btn[0])
        else:
            search_input = driver.find_element(By.CLASS_NAME, "history-search-input")
            search_input.send_keys(Keys.CONTROL + "a")
            search_input.send_keys(Keys.BACKSPACE)
        time.sleep(0.5)

        restored_cards = wait.until(
            lambda d: d.find_elements(By.CLASS_NAME, "meeting-card") if len(d.find_elements(By.CLASS_NAME, "meeting-card")) >= 2 else False
        )
        assert len(restored_cards) >= 2, "Expected full meeting list to restore upon clearing search filter"

    def test_tc_rep_06_export_report_as_pdf(self, dashboard_page):
        """TC-REP-06: Export report as PDF.

        Preconditions: Report exists.
        Test Input: PDF export request.
        Expected Result: Report is exported in PDF format.
        """
        driver = dashboard_page
        self._open_oyv_meeting(driver)

        # 1. Locate the Export PDF button in the Meeting Details view
        buttons = driver.find_elements(By.TAG_NAME, "button")
        export_btn = next((b for b in buttons if "Export PDF" in b.text), None)
        assert export_btn is not None, "Expected 'Export PDF' action button"
        assert export_btn.is_displayed(), "Export PDF button should be visible"
        assert export_btn.is_enabled(), "Export PDF button should be enabled"

        # 2. Click Export PDF action
        driver.execute_script("arguments[0].click();", export_btn)
        time.sleep(1.0)

        # 3. Assert clean PDF generation without unhandled client script errors
        logs = driver.get_log("browser")
        severe_errors = [
            l for l in logs
            if l.get("level") == "SEVERE" and "favicon" not in l.get("message", "") and "rate limit" not in l.get("message", "").lower()
        ]
        assert len(severe_errors) == 0, f"Encountered severe errors during PDF report generation: {severe_errors}"
