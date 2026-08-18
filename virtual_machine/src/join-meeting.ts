import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { parseConfig } from "./config.js";
import { selectors, joinButtonSelectors, askToJoinButtonSelectors } from "./selectors.js";

const log = (...msg: unknown[]): void =>
  console.log(`[${new Date().toISOString()}]`, ...msg);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function launchContext(profileDir: string): Promise<BrowserContext> {
  const absolute = path.resolve(profileDir);
  log(`Launching Chrome with persistent profile: ${absolute}`);
  try {
    return await chromium.launchPersistentContext(absolute, {
      channel: "chrome",
      headless: false,
      viewport: null,
      permissions: ["camera", "microphone"],
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
  } catch (err) {
    throw new Error(
      `Failed to launch Chrome with profile "${absolute}". ` +
        "Close any Chrome window already using this profile, then retry. " +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

async function waitForPrejoin(page: Page, timeoutMs: number): Promise<void> {
  const candidates = [
    [selectors.NAME_INPUT, "name"],
    [selectors.MEDIA_PROMPT_ACCEPT, "mediaPrompt"],
    [selectors.IN_CALL, "inCall"],
    ...joinButtonSelectors.map((sel) => [sel, "joinNow"] as const),
    ...askToJoinButtonSelectors.map((sel) => [sel, "askToJoin"] as const),
  ] as const;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    try {
      const stage = await Promise.any(
        candidates.map(([sel, key]) =>
          page
            .locator(sel)
            .first()
            .waitFor({ state: "visible", timeout: remaining })
            .then(() => key),
        ),
      );

      if (stage === "mediaPrompt") {
        log("Dismissing microphone/camera prompt...");
        const accept = page.locator(selectors.MEDIA_PROMPT_ACCEPT).first();
        const skip = page.locator(selectors.MEDIA_PROMPT_SKIP).first();
        if (await accept.isVisible().catch(() => false)) {
          await accept.click();
        } else if (await skip.isVisible().catch(() => false)) {
          await skip.click();
        }
        continue;
      }
      return;
    } catch {
      break;
    }
  }
  throw new Error("Google Meet pre-join screen did not appear in time.");
}

async function fillName(page: Page, displayName: string | undefined): Promise<void> {
  if (!displayName) return;
  const input = page.locator(selectors.NAME_INPUT).first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(displayName);
  }
}

async function clickFirstVisible(
  page: Page,
  selectorList: readonly string[],
): Promise<boolean> {
  for (const sel of selectorList) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click();
      return true;
    }
  }
  return false;
}

async function clickJoin(page: Page): Promise<"joined" | "waitingRoom"> {
  if (await clickFirstVisible(page, joinButtonSelectors)) {
    log("Clicking 'Join now'...");
    return "joined";
  }
  if (await clickFirstVisible(page, askToJoinButtonSelectors)) {
    log("Clicking 'Ask to join' (locked meeting)...");
    return "waitingRoom";
  }
  throw new Error("No join button found on the pre-join screen.");
}

async function waitForAdmission(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let waitingLogged = false;
  while (Date.now() < deadline) {
    if (await page.locator(selectors.IN_CALL).first().isVisible().catch(() => false)) {
      return;
    }
    if (await page.locator(selectors.ALONE).first().isVisible().catch(() => false)) {
      return;
    }

    const inWaitingRoom = await page
      .locator(selectors.WAITING_ROOM)
      .first()
      .isVisible()
      .catch(() => false);
    if (inWaitingRoom) {
      if (!waitingLogged) {
        log("Waiting for the host to admit you...");
        waitingLogged = true;
      }
    } else {
      const clicked = await clickJoin(page).catch(() => false);
      if (clicked) {
        log("Not in the call yet — clicking the join button again.");
      }
    }
    await sleep(2_000);
  }
  throw new Error("Not admitted to the meeting within the timeout.");
}

async function leaveMeeting(page: Page): Promise<void> {
  try {
    await page.locator(selectors.IN_CALL).first().click({ timeout: 3_000 });
    await sleep(1_000);
    const confirm = page
      .locator('button:has-text("Leave meeting"), button:has-text("Just leave the meeting")')
      .first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
  } catch {
    // Page already closed or we were never in a call.
  }
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv);
  log(`Joining: ${config.meetUrl}`);

  let context: BrowserContext | undefined;
  try {
    context = await launchContext(config.profileDir);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(config.prejoinTimeoutMs);

    log("Opening Google Meet...");
    await page.goto(config.meetUrl, { waitUntil: "domcontentloaded" });

    await waitForPrejoin(page, config.prejoinTimeoutMs);
    await fillName(page, config.displayName);
    const admission = await clickJoin(page);

    if (admission === "joined") {
      log("Waiting to be admitted to the call...");
    }
    await waitForAdmission(page, config.admissionTimeoutMs);
    log("In meeting. Press Ctrl+C to leave.");

    let leaving = false;
    process.on("SIGINT", async () => {
      if (leaving) return;
      leaving = true;
      log("Leaving the meeting...");
      await leaveMeeting(page);
      await context?.close().catch(() => {});
      process.exit(0);
    });
  } catch (err) {
    log("ERROR:", err instanceof Error ? err.message : String(err));
    await leaveMeeting((context?.pages()[0] ?? (await context?.newPage()))! as Page).catch(() => {});
    await context?.close().catch(() => {});
    process.exitCode = 1;
  }
}

void main();