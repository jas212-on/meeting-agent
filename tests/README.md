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

### 🤖 9. Ask AI Groq RAG Modal & AI Assistant ([`test_ask_ai_modal.py`](test_ask_ai_modal.py))
- Modal header and Groq AI badge, query submit reactivity, conversation reset, and modal dismissal.
- **`test_tc_ai_01_ask_context_related_question`**: Verifies asking a context-related question about active meetings returns an answer based on meeting context.
- **`test_tc_ai_02_ask_question_through_supported_interface`**: Verifies text query is accepted into conversation stream and processed by AI assistant.
- **`test_tc_ai_03_ask_question_unrelated_to_meeting_context`**: Verifies AI responds to out-of-context questions without fabricating meeting-specific information.
- **`test_tc_ai_04_verify_non_interruption_behavior`**: Verifies AI assistant does not spontaneously interrupt active speakers or insert unsolicited turns.

### ⚙️ 10. API Boundary Testing ([`test_create_group_success.py`](test_create_group_success.py) & [`test_create_group_failure.py`](test_create_group_failure.py))
- HTTP status codes (201 vs 400), boundary length testing, and whitespace validation.

### 👥 11. Attendance Tracking & Audit ([`test_meeting_attendance.py`](test_meeting_attendance.py))
- Tested against session **`oyv-gstt-ooj`** (with recorded participant `Jason Bobby`).
- **`test_tc_att_01_track_participant_joining`**: Verifies participant join events, recording attendee identities and formatted join timestamps (`01:08:30 AM`).
- **`test_tc_att_02_track_participant_leaving`**: Verifies participant departure logging, leave timestamps (`01:08:51 AM`), and session interval records.
- **`test_tc_att_03_calculate_attendance_duration`**: Validates active duration calculations (`21s`) across session intervals.
- **`test_tc_att_04_generate_attendance_report`**: Validates complete attendance report generation with presence states, durations, and export functionality.

### 🎙️ 12. Transcription & Meeting Intelligence ([`test_transcription_intelligence.py`](test_transcription_intelligence.py))
- **`test_tc_tx_01_generate_live_transcription`**: Asserts that spoken audio conversation is converted into live text dialogue cards with timestamps.
- **`test_tc_tx_02_identify_speaker`**: Asserts that dialogue turns associate speech with the correct participant names, roles, and avatar identifiers.
- **`test_tc_tx_03_classify_meeting_type`**: Asserts that meeting context and conversation dialogue are classified into a supported meeting category badge.
- **`test_tc_tx_04_handle_continuous_conversation`**: Asserts that multi-segment continuous conversation updates without terminating unexpectedly.

### 🎯 13. Specific Session Transcription Verification: `oyv-gstt-ooj` ([`test_meeting_oyv_gstt_ooj_transcription.py`](test_meeting_oyv_gstt_ooj_transcription.py))
- **`test_tc_tx_01_generate_live_transcription`**: Asserts spoken audio from meeting `oyv-gstt-ooj` is converted into live text dialogue cards with recorded timestamps.
- **`test_tc_tx_02_identify_speaker`**: Asserts speech turns associate dialogue with the appropriate speaker (`Meeting Host` vs `MeetMinutes AI Agent`).
- **`test_tc_tx_03_classify_meeting_type`**: Asserts meeting `oyv-gstt-ooj` is classified into a supported meeting category badge.
- **`test_tc_tx_04_handle_continuous_conversation`**: Asserts continuous conversation in `oyv-gstt-ooj` updates sequentially without terminating unexpectedly.

### 📌 14. Decision & Action Item Extraction: `oyv-gstt-ooj` ([`test_meeting_oyv_gstt_ooj_extraction.py`](test_meeting_oyv_gstt_ooj_extraction.py))
- **`test_tc_ext_01_detect_meeting_decision`**: Verifies transcript discussion containing an explicit decision extracts into the "Key Decisions" meeting minutes panel.
- **`test_tc_ext_02_detect_action_item`**: Verifies transcript task assignment statements extract into structured action item deliverables.
- **`test_tc_ext_03_identify_assignee`**: Verifies responsible person (`Jason Bobby`) is accurately identified and associated with the extracted task.
- **`test_tc_ext_04_identify_deadline`**: Verifies explicit deadline (`Tomorrow 5 PM`) is extracted and associated with the action item.

### 📊 15. Summarization & Reports Testing: `oyv-gstt-ooj` ([`test_meeting_summarization_reports.py`](test_meeting_summarization_reports.py))
- **`test_tc_rep_01_generate_meeting_summary`**: Asserts a structured meeting summary is generated and accessible when a meeting has concluded.
- **`test_tc_rep_02_verify_summary_contents`**: Validates summary contents in the report canvas, asserting discussion topics, key decisions (*"Deploy the beta release to production on Friday"*), and action items (*"Complete the security audit and submit compliance report"* assigned to `Jason Bobby`) are present.
- **`test_tc_rep_03_store_meeting_report`**: Asserts the complete meeting minutes report is persisted in the database and associated with meeting session `oyv-gstt-ooj`.
- **`test_tc_rep_04_retrieve_historical_report`**: Asserts an authorized user can retrieve and view historical meeting report details and minutes on the dashboard canvas.
- **`test_tc_rep_05_search_historical_meetings`**: Asserts searching historical meetings by ID, title, or participant returns matching cards, renders an empty state on non-matching queries, and restores the full meeting list on clearing filters.
- **`test_tc_rep_06_export_report_as_pdf`**: Asserts clicking "Export PDF" executes client-side PDF document generation (`jsPDF`) without unhandled errors or page crashes.

### 🛡️ 16. Non-Functional Requirements & Performance ([`test_non_functional_requirements.py`](test_non_functional_requirements.py))
- **`test_tc_perf_01_measure_ai_query_response`**: Measures Ask AI round-trip response duration, asserting performance within the $\le 2\text{--}3\text{ s}$ SLA threshold (Status: PASS).
- **`test_tc_perf_02_measure_transcription_delay`**: Measures transcription latency and live turn card rendering, recording the $2.0\text{ s}$ latency benchmark against the $< 1.5\text{ s}$ target (Status: FAIL / Benchmark).
- **`test_tc_perf_03_measure_ai_meeting_join_time`**: Measures elapsed time from host consent approval to meeting connection, asserting join time $\le 10\text{ s}$ (Status: PASS).
- **`test_tc_perf_04_measure_summary_generation`**: Measures post-meeting summary retrieval and generation pipeline duration, recording the $1.5\text{ min}$ benchmark against the $\le 1.0\text{ min}$ requirement (Status: FAIL / Benchmark).
- **`test_tc_sec_01_unauthorized_report_access`**: Verifies unauthenticated and forged-token requests to protected resources are blocked with HTTP 401/403 (Status: PASS).
- **`test_tc_sec_02_verify_secure_communication`**: Verifies TLS 1.3 / modern cryptographic protocol support and HTTPS enforcement (Status: PASS).
- **`test_tc_sec_03_process_meeting_without_consent`**: Asserts declining host consent prevents agent join and halts recording/processing (Status: PASS).
- **`test_tc_ui_01_verify_dashboard_navigation`**: Validates end-to-end dashboard workflows (URL input, tabs, meeting history, sidebar navigation, theme switch, diagnostic logs) (Status: PASS).
- **`test_tc_comp_01_test_supported_browser`**: Verifies supported browser execution, HTML5 API availability, and CSS layout engine integrity (Status: PASS).

### 🔬 17. White-Box Logic & Branch Testing ([`test_white_box_requirements.py`](test_white_box_requirements.py))
- **`test_wb_01_groq_summary_valid_transcript`**: Branch coverage: Valid transcript extracts structured JSON meeting minutes via Groq LLM (Status: PASS).
- **`test_wb_02_groq_summary_empty_transcript_fallback`**: Branch coverage: Empty/short transcript invokes fallback structured summary branch (Status: PASS).
- **`test_wb_03_auth_middleware_missing_or_invalid_token`**: Decision coverage: Missing or invalid Bearer token routes to HTTP 401/403 rejection (Status: PASS).
- **`test_wb_04_auth_login_mismatched_password`**: Condition coverage: Valid email with mismatched password (`bcrypt.compare` returns false) routes to HTTP 401 (Status: PASS).
- **`test_wb_05_group_creation_duplicate_name_conflict`**: Decision coverage: Duplicate group name lookup (`Group.findOne`) routes to HTTP 409 Conflict rejection (Status: PASS).
- **`test_wb_06_drive_service_failure_disk_fallback`**: Exception coverage: Google Drive failure/missing token executes catch block and falls back safely to disk storage (Status: PASS).

### 🧩 18. Unit Testing Requirements ([`test_unit_requirements.py`](test_unit_requirements.py))
- **`test_ut_01_register_valid_input`**: Valid input creates user and returns HTTP 201 with JWT token (Status: PASS).
- **`test_ut_02_register_password_length_short`**: Password length = 5 returns HTTP 400 password-length validation error (Status: PASS).
- **`test_ut_03_login_unknown_email`**: Unknown email rejected with HTTP 401 Unauthorized (Status: PASS).
- **`test_ut_04_login_incorrect_password`**: Existing user with mismatched password rejected with HTTP 401 Unauthorized (Status: PASS).
- **`test_ut_05_generate_summary_empty_transcript`**: Empty transcript returns structured empty minutes via fallback (Status: PASS).
- **`test_ut_06_generate_summary_absent_groq_api_key`**: Absent API key returns structured fallback minutes without unhandled exceptions (Status: PASS).
- **`test_ut_07_transcribe_audio_non_existent_path`**: Non-existent audio file path handled safely, returning `{ text: "", segments: [] }` (Status: PASS).
- **`test_ut_08_transcribe_audio_tiny_file_size`**: Tiny audio file (<1000 bytes) triggers size guard, returning `{ text: "", segments: [] }` (Status: PASS).

### 🔗 19. Integration & Interface Requirements ([`test_integration_requirements.py`](test_integration_requirements.py))
- **`test_int_01_user_auth_mongodb_integration`**: User Authentication $\rightarrow$ MongoDB Database. Interface: Mongoose ODM / Database Call. User record hashed & stored; JWT token generated and verified (Status: PASS).
- **`test_int_02_frontend_dashboard_backend_api_integration`**: Frontend Dashboard $\rightarrow$ Backend API Server. Interface: REST API (`/api/meetings`). Historical meetings returned and rendered on UI cards (Status: PASS).
- **`test_int_03_backend_orchestrator_playwright_bot_ipc`**: Backend Orchestrator $\rightarrow$ Playwright Bot. Interface: Child Process IPC (spawn stdio / CLI args). Bot process launched, joined, and transitions UI meeting controls (Status: PASS).
- **`test_int_04_in_call_dom_tracker_backend_attendance`**: In-Call DOM Tracker $\rightarrow$ Backend Controller. Interface: stdout Event Stream (`[ATTENDANCE_DATA]`). Live join/leave intervals and attendance duration roster parsed and rendered (Status: PASS).
- **`test_int_05_bot_audio_bridge_whisper_transcription`**: Bot Audio Bridge $\rightarrow$ Vapi AI / Groq Whisper. Interface: WebSocket / REST Audio Stream. Audio converted to dialogue turns with tagged speaker names (Status: PASS).
- **`test_int_06_backend_meeting_service_groq_llm_summary`**: Backend Meeting Service $\rightarrow$ Groq LLM API. Interface: HTTPS REST API (`llama-3.3-70b` / `qwen`). Structured minutes, key decisions, and action items generated (Status: PASS).
- **`test_int_07_ask_ai_modal_rag_search_engine`**: Ask AI Modal $\rightarrow$ Semantic RAG Search Engine. Interface: WebSocket / HTTP JSON RPC. Natural language query processed and meeting-grounded contextual response generated (Status: PASS).
- **`test_int_08_media_service_google_drive_upload`**: Media Storage Service $\rightarrow$ Google Drive / Cloud Fallback. Interface: Google Drive REST API v3 / Local Disk Fallback. Audio and transcript assets exported and link/path persisted (Status: PASS).

---

## 🏃 Running the Automated Suites

```bash
# Run all advanced suites (13 tests)
pytest tests/test_storage_resilience.py tests/test_transcript_search_filters.py tests/test_responsive_viewports.py tests/test_keyboard_accessibility.py -v

# Run the UI interaction suites (19 tests)
pytest tests/test_meeting_url_lifecycle.py tests/test_theme_and_navigation.py tests/test_group_workspace_ui.py tests/test_meeting_details_actions.py tests/test_ask_ai_modal.py -v

# Run Summarization & Reports test suite (6 tests)
pytest tests/test_meeting_summarization.py -v

# Run Non-Functional Requirements test suite (9 tests)
pytest tests/test_non_functional_requirements.py -v

# Run White-Box Requirements test suite (6 tests)
pytest tests/test_white_box_requirements.py -v

# Run Unit Requirements test suite (8 tests)
pytest tests/test_unit_requirements.py -v

# Run Integration Requirements test suite (8 tests)
pytest tests/test_integration_requirements.py -v

# Run headed in a visible browser window
pytest tests/test_integration_requirements.py -v --headed
```

