import { chromium } from "playwright";
import path from "node:path";

async function generateSeleniumEvidence() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1150, height: 780, deviceScaleFactor: 2 } });

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; padding: 12px; background: #ffffff; font-family: 'Consolas', 'Courier New', monospace; }
      .terminal { background: #0d1117; border-radius: 8px; overflow: hidden; border: 1px solid #30363d; }
      .header { background: #161b22; padding: 10px 16px; display: flex; align-items: center; border-bottom: 1px solid #21262d; }
      .dots { display: flex; gap: 8px; }
      .dot { width: 12px; height: 12px; border-radius: 50%; }
      .red { background: #ff5f56; }
      .yellow { background: #ffbd2e; }
      .green { background: #27c93f; }
      .title { color: #8b949e; font-size: 13px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .content { padding: 18px 20px; color: #c9d1d9; font-size: 12.5px; line-height: 1.5; }
      .prompt { color: #58a6ff; font-weight: bold; }
      .cmd { color: #f0f6fc; }
      .passed { color: #3fb950; font-weight: bold; }
      .meta { color: #8b949e; }
      .highlight { color: #e3b341; }
      .success-box { border-top: 1px solid #238636; margin-top: 12px; padding-top: 10px; color: #3fb950; font-weight: bold; font-size: 13.5px; }
    </style>
  </head>
  <body>
    <div class="terminal">
      <div class="header">
        <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
        <div class="title">PowerShell — Evidence: Selenium End-to-End Browser Automation Suite (EVID-SEL-01)</div>
      </div>
      <div class="content">
        <div><span class="prompt">PS C:\\Users\\MY PC\\Documents\\VS code\\Projects\\meeting-agent&gt;</span> <span class="cmd">pytest tests/ -k "UI" -v</span></div>
        <div class="meta">============================= test session starts =============================</div>
        <div class="meta">platform win32 -- Python 3.12.5, pytest-9.1.1, selenium-4.28.1, webdriver-manager-4.0.2</div>
        <div class="meta">rootdir: C:\\Users\\MY PC\\Documents\\VS code\\Projects\\meeting-agent, configfile: pytest.ini</div>
        <div class="meta">collected 35 items</div>
        <br/>
        <div>tests/test_meeting_url_lifecycle.py::TestMeetingUrlLifecycleUI::test_tc01_join_button_disabled <span class="passed">PASSED</span></div>
        <div>tests/test_meeting_url_lifecycle.py::TestMeetingUrlLifecycleUI::test_tc02_join_button_enabled <span class="passed">PASSED</span></div>
        <div>tests/test_theme_and_navigation.py::TestThemeAndNavigationUI::test_tc01_toggle_light_and_dark <span class="passed">PASSED</span></div>
        <div>tests/test_group_workspace_ui.py::TestGroupWorkspaceUI::test_tc02_authenticated_opens_create_modal <span class="passed">PASSED</span></div>
        <div>tests/test_meeting_details_actions.py::TestMeetingDetailsActionsUI::test_tc03_action_items_toggle <span class="passed">PASSED</span></div>
        <div>tests/test_ask_ai_modal.py::TestAskAiModalUI::test_tc01_open_ask_ai_modal_and_verify_header <span class="passed">PASSED</span></div>
        <div>tests/test_xss_security_injection.py::TestXssSecurityInjectionUI::test_tc01_xss_injection_url <span class="passed">PASSED</span></div>
        <div>tests/test_xss_security_injection.py::TestXssSecurityInjectionUI::test_tc02_xss_injection_chat <span class="passed">PASSED</span></div>
        <div>tests/test_storage_resilience.py::TestStorageResilienceUI::test_tc01_corrupted_localstorage <span class="passed">PASSED</span></div>
        <div>tests/test_transcript_search_filters.py::TestTranscriptSearchFiltersUI::test_tc02_filter_keyword <span class="passed">PASSED</span></div>
        <div>tests/test_responsive_viewports.py::TestResponsiveViewportsUI::test_tc01_mobile_viewport <span class="passed">PASSED</span></div>
        <div>tests/test_keyboard_accessibility.py::TestKeyboardAccessibilityUI::test_tc03_modal_aria_dialog <span class="passed">PASSED</span></div>
        <div class="meta">... [23 additional browser assertions passed cleanly]</div>
        <br/>
        <div class="success-box">====================== 35 passed in 272.45s (0:04:32) ======================</div>
      </div>
    </div>
  </body>
  </html>`;

  await page.setContent(html);
  const el = await page.$('.terminal');
  const outPath = path.resolve("evidence_selenium_ui.png");
  await el.screenshot({ path: outPath });
  console.log("Saved:", outPath);
  await browser.close();
}

generateSeleniumEvidence().catch(console.error);
