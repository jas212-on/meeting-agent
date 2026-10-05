import re
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class TestMeetingAttendanceTracking:
    """Selenium UI test suite for Attendance Tracking module specifically tested with meeting 'oyv-gstt-ooj'.

    Covers CSE312 Test Cases:
      - TC-ATT-01: Track participant joining
      - TC-ATT-02: Track participant leaving
      - TC-ATT-03: Calculate attendance duration
      - TC-ATT-04: Generate attendance report
    """

    MEETING_ID = "oyv-gstt-ooj"

    def _navigate_to_attendance_tab(self, driver):
        """Helper to navigate to Meeting Details for oyv-gstt-ooj and switch to the Attendance Audit tab."""
        wait = WebDriverWait(driver, 10)

        # 1. Wait for database meetings to load and locate meeting card
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

        # 4. Click 'Attendance' in sidebar menu
        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        attendance_btn = next((btn for btn in menu_items if "Attendance" in btn.text), None)
        assert attendance_btn is not None, "Expected 'Attendance' tab in sidebar menu"
        driver.execute_script("arguments[0].click();", attendance_btn)
        time.sleep(0.4)

        # 5. Confirm Attendance Audit section is rendered
        heading = wait.until(
            EC.visibility_of_element_located((By.CLASS_NAME, "section-main-heading"))
        )
        assert "Attendance" in heading.text, f"Expected Attendance section, got {heading.text}"
        wait.until(EC.visibility_of_element_located((By.CLASS_NAME, "data-table-clean")))

    def test_tc_att_01_track_participant_joining(self, dashboard_page):
        """TC-ATT-01: Track participant joining for meeting oyv-gstt-ooj.

        Preconditions: Active meeting / recorded session available.
        Test Input: Participant joins meeting.
        Expected Result: Participant identity and join timestamp are recorded.
        """
        driver = dashboard_page
        self._navigate_to_attendance_tab(driver)

        # Locate attendee rows in the data table
        rows = driver.find_elements(By.CSS_SELECTOR, ".data-table-clean tbody tr")
        attendee_rows = [r for r in rows if r.find_elements(By.CLASS_NAME, "table-user-name")]
        assert len(attendee_rows) > 0, f"Expected recorded participants in {self.MEETING_ID} attendance roster"

        time_pattern = re.compile(r"\d{1,2}:\d{2}\s*(?:AM|PM)", re.IGNORECASE)

        recorded_participants = []
        for row in attendee_rows:
            user_elem = row.find_element(By.CLASS_NAME, "table-user-name")
            name = user_elem.text.strip()
            assert len(name) > 0, "Participant name must not be empty"

            cols = row.find_elements(By.TAG_NAME, "td")
            # Columns: 0=Name, 1=Role, 2=Attendance, 3=Join Time, 4=Leave Time, 5=Duration, 6=Actions
            join_time = cols[3].text.strip()
            assert time_pattern.search(join_time), (
                f"Participant '{name}' should have a recorded join timestamp, got: '{join_time}'"
            )

            # Check status presence indicator
            status_elem = row.find_element(By.CLASS_NAME, "attendance-status-live")
            assert status_elem.is_displayed(), f"Status indicator for '{name}' must be visible"

            recorded_participants.append({"name": name, "join_time": join_time})

        assert len(recorded_participants) >= 1, (
            f"Expected at least 1 tracked participant in {self.MEETING_ID}, found {len(recorded_participants)}"
        )

    def test_tc_att_02_track_participant_leaving(self, dashboard_page):
        """TC-ATT-02: Track participant leaving for meeting oyv-gstt-ooj.

        Preconditions: Participant is in meeting.
        Test Input: Participant leaves.
        Expected Result: Leave timestamp is recorded and session interval is logged.
        """
        driver = dashboard_page
        self._navigate_to_attendance_tab(driver)

        rows = driver.find_elements(By.CSS_SELECTOR, ".data-table-clean tbody tr")
        attendee_rows = [r for r in rows if r.find_elements(By.CLASS_NAME, "table-user-name")]
        assert len(attendee_rows) > 0, "Expected participant rows in attendance table"

        time_pattern = re.compile(r"\d{1,2}:\d{2}\s*(?:AM|PM)", re.IGNORECASE)

        # 1. Verify leave timestamps exist across participants
        has_recorded_leave_time = False
        for row in attendee_rows:
            cols = row.find_elements(By.TAG_NAME, "td")
            leave_time = cols[4].text.strip()
            if time_pattern.search(leave_time):
                has_recorded_leave_time = True
                break
        assert has_recorded_leave_time, "Expected recorded leave timestamp for completed participant sessions"

        # 2. Expand logs for attendee to inspect recorded leave interval
        expand_btn = attendee_rows[0].find_element(By.TAG_NAME, "button")
        driver.execute_script("arguments[0].click();", expand_btn)
        time.sleep(0.4)

        # Verify expanded session intervals table row
        wait = WebDriverWait(driver, 5)
        expanded_row = wait.until(
            EC.visibility_of_element_located((By.XPATH, "//tr[contains(., 'Session Intervals:')]"))
        )
        expanded_text = expanded_row.text
        assert "Left at" in expanded_text, f"Expanded log should record 'Left at' timestamp: {expanded_text}"
        assert time_pattern.search(expanded_text), "Expanded log should contain formatted leave timestamp"

        # 3. Verify presence status states
        all_text = driver.find_element(By.CLASS_NAME, "data-table-clean").text
        assert ("Present" in all_text or "Left Early" in all_text), (
            "Attendance table should record departure / presence status states"
        )

    def test_tc_att_03_calculate_attendance_duration(self, dashboard_page):
        """TC-ATT-03: Calculate attendance duration for meeting oyv-gstt-ooj.

        Preconditions: Join and leave events available.
        Test Input: Participant session intervals.
        Expected Result: Correct attendance duration is calculated.
        """
        driver = dashboard_page
        self._navigate_to_attendance_tab(driver)

        rows = driver.find_elements(By.CSS_SELECTOR, ".data-table-clean tbody tr")
        attendee_rows = [r for r in rows if r.find_elements(By.CLASS_NAME, "table-user-name")]
        assert len(attendee_rows) > 0, "Expected attendee rows to verify duration calculations"

        duration_regex = re.compile(r"(\d+)\s*m(?:\s*(\d+)\s*s)?|(\d+)\s*s")

        for row in attendee_rows:
            cols = row.find_elements(By.TAG_NAME, "td")
            user_name = cols[0].text.strip()
            duration_text = cols[5].text.strip()

            # Verify duration column is non-empty and properly formatted (e.g., '21s' or '42m 0s')
            match = duration_regex.search(duration_text)
            assert match is not None, (
                f"Expected calculated duration for participant '{user_name}', got '{duration_text}'"
            )

        # Verify session intervals log duration calculation
        first_row = attendee_rows[0]
        expand_btn = first_row.find_element(By.TAG_NAME, "button")
        driver.execute_script("arguments[0].click();", expand_btn)
        time.sleep(0.4)

        intervals_container = driver.find_elements(By.XPATH, "//tr[contains(., 'Session Intervals:')]")
        assert len(intervals_container) > 0, "Session intervals breakdown should be displayed"
        intervals_text = intervals_container[0].text

        # Verify that interval duration is calculated and reported in parentheses, e.g. (21s)
        assert re.search(r"\((?:\d+m(?:\s*\d+s)?|\d+s)\)", intervals_text), (
            f"Expected interval duration calculations in log breakdown: {intervals_text}"
        )

    def test_tc_att_04_generate_attendance_report(self, dashboard_page):
        """TC-ATT-04: Generate attendance report for meeting oyv-gstt-ooj.

        Preconditions: Meeting completed.
        Test Input: Request attendance report.
        Expected Result: Report contains participant presence, duration and late-arrival information.
        """
        driver = dashboard_page
        self._navigate_to_attendance_tab(driver)

        # 1. Verify summary metrics / presence stats
        table_text = driver.find_element(By.CLASS_NAME, "data-table-clean").text
        assert "Present" in table_text, "Attendance report must reflect participant presence"

        # Verify presence of arrival / departure states (e.g., Present, Left Early, Rejoined)
        assert any(status in table_text for status in ["Present", "Left Early", "Rejoined", "Joined Late"]), (
            "Attendance report must include presence, late-arrival, or departure information"
        )

        # 2. Check Attendance section breadcrumb and sidebar badge
        crumb = driver.find_element(By.CLASS_NAME, "crumb-current")
        assert "Attendance" in crumb.text, f"Expected breadcrumb to indicate Attendance, got: {crumb.text}"

        menu_items = driver.find_elements(By.CLASS_NAME, "sidebar-menu-item")
        attendance_menu = next((btn for btn in menu_items if "Attendance" in btn.text), None)
        assert attendance_menu is not None, "Expected Attendance item in sidebar"

        # 3. Locate and trigger the 'Export Attendance Report' action
        export_btn = driver.find_element(By.ID, "export-attendance-csv-btn")
        assert export_btn.is_displayed(), "Expected 'Export Attendance Report' button to be visible"
        assert export_btn.is_enabled(), "Expected 'Export Attendance Report' button to be clickable"

        # Trigger report generation
        driver.execute_script("arguments[0].click();", export_btn)
        time.sleep(0.5)

        # Verify no JavaScript unhandled error occurred during export creation
        logs = driver.get_log("browser")
        severe_errors = [
            l for l in logs
            if l.get("level") == "SEVERE"
            and "favicon" not in l.get("message", "")
            and "warning-keys" not in l.get("message", "")
        ]
        assert len(severe_errors) == 0, f"Encountered severe errors during attendance report export: {severe_errors}"
