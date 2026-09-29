# MeetMinutes.ai Selenium & Pytest Test Suite

The automated test suite combines API-level boundary testing, end-to-end browser automation, resilience testing, and accessibility verification using **Selenium WebDriver** and **Pytest**.

---

## 📂 Test Suites Breakdown

### 💾 1. Storage & Session Resilience ([`test_storage_resilience.py`](test_storage_resilience.py))
- **`test_tc01_corrupted_localstorage_graceful_recovery`**: Injects corrupted non-JSON data into `localStorage` and verifies the application recovers gracefully without white-screen crash.
- **`test_tc02_theme_persistence_across_browser_reloads`**: Verifies `dark` and `light` mode preferences survive full browser page reloads.
- **`test_tc03_meeting_history_records_rendered`**: Verifies stored past meeting records render with title, date, and duration badges.

### 🔍 2. Transcript Search & Filters ([`test_transcript_search_filters.py`](test_transcript_search_filters.py))
- **`test_tc01_transcript_view_initial_turns_rendered`**: Navigates to Meeting Details → Transcript and verifies speech turn cards and turns counter pill.
- **`test_tc02_filter_transcript_by_keyword`**: Types search keywords into the transcript filter input and verifies real-time dialogue filtering.
- **`test_tc03_filter_transcript_no_match_shows_empty_state`**: Searches for non-existent keywords and verifies clean empty-state presentation.
- **`test_tc04_clear_filter_restores_all_turns`**: Clears search filter and asserts all dialogue speech cards return to view.

### 📱 3. Responsive Viewports & Layout ([`test_responsive_viewports.py`](test_responsive_viewports.py))
- **`test_tc01_mobile_viewport_interactive_controls`**: Tests Mobile viewport (`375x812` iPhone), asserting core input and action controls remain visible and functional.
- **`test_tc02_tablet_viewport_interactive_controls`**: Tests Tablet viewport (`768x1024` iPad), verifying responsive adaptations.
- **`test_tc03_desktop_viewport_full_layout`**: Tests Desktop viewport (`1440x900`), verifying full navigation bar and actions.

### ⌨️ 4. Keyboard Navigation & Accessibility ([`test_keyboard_accessibility.py`](test_keyboard_accessibility.py))
- **`test_tc01_enter_key_triggers_url_input_validation`**: Asserts pressing `Enter` in the URL input triggers validation and feedback immediately.
- **`test_tc02_tab_key_moves_focus_through_interactive_elements`**: Asserts `Tab` key sequentially advances keyboard focus to next interactive controls.
- **`test_tc03_modal_dialog_accessibility_semantics`**: Validates modal dialog attributes (`role="dialog"`, `aria-modal="true"`).

### 🚀 5. Meeting URL Lifecycle ([`test_meeting_url_lifecycle.py`](test_meeting_url_lifecycle.py))
- Button state reactivity (disabled on empty/invalid, enabled on valid link), error hint dismissal, and clear input button.

### 🎨 6. Theme & Shell Navigation ([`test_theme_and_navigation.py`](test_theme_and_navigation.py))
- Light/Dark theme switching, top navigation items (`Meetings`, `Groups`), and collapsible diagnostic terminal logs.

### 👥 7. Group Workspace Collaboration ([`test_group_workspace_ui.py`](test_group_workspace_ui.py))
- Guest auth modal prompt, authenticated modal open, workspace tabs (`All`, `My Workspaces`, `Member`), and search filtering.

### 📋 8. Meeting Details & Interactive Action Items ([`test_meeting_details_actions.py`](test_meeting_details_actions.py))
- Navigation to meeting details, sidebar tab switching, **interactive action item checkbox toggling**, and breadcrumb navigation.

### 🤖 9. Ask AI Groq RAG Modal ([`test_ask_ai_modal.py`](test_ask_ai_modal.py))
- Modal header and Groq AI badge, query submit reactivity, conversation reset, and modal dismissal.

### ⚙️ 10. API Boundary Testing ([`test_create_group_success.py`](test_create_group_success.py) & [`test_create_group_failure.py`](test_create_group_failure.py))
- HTTP status codes (201 vs 400), boundary length testing, and whitespace validation.

---

## 🏃 Running the Automated Suites

```bash
# Run all advanced suites (13 tests)
pytest tests/test_storage_resilience.py tests/test_transcript_search_filters.py tests/test_responsive_viewports.py tests/test_keyboard_accessibility.py -v

# Run the UI interaction suites (19 tests)
pytest tests/test_meeting_url_lifecycle.py tests/test_theme_and_navigation.py tests/test_group_workspace_ui.py tests/test_meeting_details_actions.py tests/test_ask_ai_modal.py -v

# Run headed in a visible browser window
pytest tests/test_meeting_url_lifecycle.py -v --headed
```
