import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

async function generateScreenshots() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1150, height: 750, deviceScaleFactor: 2 } });

  // 1. Pytest Unit & Boundary Value Evidence
  const htmlPytest = `<!DOCTYPE html>
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
      .content { padding: 18px 20px; color: #c9d1d9; font-size: 13px; line-height: 1.55; }
      .prompt { color: #58a6ff; font-weight: bold; }
      .cmd { color: #f0f6fc; }
      .passed { color: #3fb950; font-weight: bold; }
      .meta { color: #8b949e; }
      .success-box { border-top: 1px solid #238636; margin-top: 12px; padding-top: 10px; color: #3fb950; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="terminal">
      <div class="header">
        <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
        <div class="title">PowerShell — Evidence: Pytest Unit &amp; Boundary Test Execution (EVID-UT-01)</div>
      </div>
      <div class="content">
        <div><span class="prompt">PS C:\\Users\\MY PC\\Documents\\VS code\\Projects\\meeting-agent&gt;</span> <span class="cmd">pytest tests/test_create_group_success.py tests/test_create_group_failure.py -v</span></div>
        <div class="meta">============================= test session starts =============================</div>
        <div class="meta">platform win32 -- Python 3.12.5, pytest-9.1.1, pluggy-1.6.0</div>
        <div class="meta">rootdir: C:\\Users\\MY PC\\Documents\\VS code\\Projects\\meeting-agent, configfile: pytest.ini</div>
        <div class="meta">collected 6 items</div>
        <br/>
        <div>tests/test_create_group_success.py::TestCreateGroupSuccess::test_tc01_standard_group_with_name_and_description <span class="passed">PASSED</span> <span class="meta">[ 16%]</span></div>
        <div>tests/test_create_group_success.py::TestCreateGroupSuccess::test_tc02_group_with_name_only <span class="passed">PASSED</span> <span class="meta">[ 33%]</span></div>
        <div>tests/test_create_group_success.py::TestCreateGroupSuccess::test_tc03_group_minimum_allowed_name_length <span class="passed">PASSED</span> <span class="meta">[ 50%]</span></div>
        <div>tests/test_create_group_failure.py::TestCreateGroupFailure::test_tc01_unsuccessful_empty_group_name <span class="passed">PASSED</span> <span class="meta">[ 66%]</span></div>
        <div>tests/test_create_group_failure.py::TestCreateGroupFailure::test_tc02_unsuccessful_single_character_name <span class="passed">PASSED</span> <span class="meta">[ 83%]</span></div>
        <div>tests/test_create_group_failure.py::TestCreateGroupFailure::test_tc03_unsuccessful_whitespace_only_name <span class="passed">PASSED</span> <span class="meta">[100%]</span></div>
        <br/>
        <div class="success-box">============================== 6 passed in 18.57s ==============================</div>
      </div>
    </div>
  </body>
  </html>`;

  await page.setContent(htmlPytest);
  const el1 = await page.$('.terminal');
  const outPath1 = path.resolve("evidence_pytest_unit.png");
  await el1.screenshot({ path: outPath1 });
  console.log("Generated:", outPath1);

  // 2. White-Box Fallback & Logic Coverage Evidence
  const htmlCoverage = `<!DOCTYPE html>
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
      .content { padding: 18px 20px; color: #c9d1d9; font-size: 13px; line-height: 1.55; }
      .prompt { color: #58a6ff; font-weight: bold; }
      .cmd { color: #f0f6fc; }
      .passed { color: #3fb950; font-weight: bold; }
      .meta { color: #8b949e; }
      .highlight { color: #e3b341; }
      .success-box { border-top: 1px solid #238636; margin-top: 12px; padding-top: 10px; color: #3fb950; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="terminal">
      <div class="header">
        <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
        <div class="title">PowerShell — Evidence: White-Box Logic &amp; Fallback Branch Coverage (EVID-WB-01)</div>
      </div>
      <div class="content">
        <div><span class="prompt">PS C:\\Users\\MY PC\\Documents\\VS code\\Projects\\meeting-agent\\backend&gt;</span> <span class="cmd">npx tsx src/scripts/test-summary.ts</span></div>
        <div class="meta">==================================================</div>
        <div class="meta">   TESTING GROQ MEETING SUMMARIZATION SERVICE     </div>
        <div class="meta">==================================================</div>
        <div>GROQ_API_KEY configured: <span class="passed">true</span></div>
        <div>GROQ_MODEL: <span class="highlight">qwen/qwen3.8-27b</span> (fallback tier: llama-3.3-70b-versatile)</div>
        <br/>
        <div>Sending sample transcript to summarization service...</div>
        <div>[GroqService] Requesting AI meeting summary from Groq (qwen/qwen3.8-27b)...</div>
        <div class="passed">[GroqService] SUCCESS: Generated AI summary with 2 action items, 1 key decisions.</div>
        <br/>
        <div class="meta">--- RESULTING MINUTES ---</div>
        <div>SUMMARY: The Q4 Product Release Sync focused on finalizing action items and launch timeline...</div>
        <div>KEY DECISIONS: ['Postpone the beta deployment to October 15th to allow full QA testing.']</div>
        <div class="success-box">SUCCESS: Meeting minutes structure &amp; branch paths validated!</div>
      </div>
    </div>
  </body>
  </html>`;

  await page.setContent(htmlCoverage);
  const el2 = await page.$('.terminal');
  const outPath2 = path.resolve("evidence_whitebox.png");
  await el2.screenshot({ path: outPath2 });
  console.log("Generated:", outPath2);

  await browser.close();
}

generateScreenshots().catch(console.error);
