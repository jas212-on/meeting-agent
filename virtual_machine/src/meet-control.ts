import type { Page } from "playwright";
import { selectors } from "./selectors.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function getMicState(page: Page): Promise<{ buttonFound: boolean; isMuted: boolean }> {
  try {
    const micBtn = page.locator('button[aria-label*="microphone" i], button[aria-label*="mic" i], button[data-is-muted]').first();
    const exists = await micBtn.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!exists) return { buttonFound: false, isMuted: true };

    const isMutedAttr = await micBtn.getAttribute("data-is-muted", { timeout: 1_000 }).catch(() => null);
    const ariaLabel = (await micBtn.getAttribute("aria-label", { timeout: 1_000 }).catch(() => "")) || "";

    if (isMutedAttr !== null) {
      return { buttonFound: true, isMuted: isMutedAttr === "true" };
    }
    if (/turn on microphone/i.test(ariaLabel)) {
      return { buttonFound: true, isMuted: true };
    }
    if (/turn off microphone/i.test(ariaLabel)) {
      return { buttonFound: true, isMuted: false };
    }
    return { buttonFound: true, isMuted: true };
  } catch {
    return { buttonFound: false, isMuted: true };
  }
}

let micToggleLock = Promise.resolve();

export async function setMic(page: Page, on: boolean): Promise<void> {
  micToggleLock = micToggleLock.then(async () => {
    try {
      await page.bringToFront().catch(() => {});
      const { buttonFound, isMuted } = await getMicState(page);
      const isCurrentlyOn = !isMuted;
      console.log(`[MeetControl] Step: Setting Google Meet mic state (Current: ${isCurrentlyOn ? "ON (unmuted)" : "OFF (muted)"} -> Target: ${on ? "ON" : "OFF"})...`);
      if (buttonFound && on === isCurrentlyOn) {
        console.log(`[MeetControl] Google Meet mic is already ${on ? "ON" : "OFF"}, no toggle needed.`);
        return;
      }

      const micBtn = page.locator('button[aria-label*="microphone" i], button[aria-label*="mic" i], button[data-is-muted]').first();
      if (await micBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await micBtn.click({ timeout: 1_500 }).catch(async () => {
          await page.keyboard.press("Control+d");
        });
      } else {
        await page.keyboard.press("Control+d");
      }
      await sleep(300);
      const after = await getMicState(page);
      console.log(`[MeetControl] SUCCESS: Google Meet mic state is now: ${!after.isMuted ? "ON (unmuted)" : "OFF (muted)"}`);
    } catch (err) {
      console.error(`[MeetControl] FAILED to toggle Google Meet mic:`, err);
      await page.keyboard.press("Control+d").catch(() => {});
    }
  });
  return micToggleLock;
}

export async function configureMeetAudioDevices(page: Page): Promise<void> {
  try {
    console.log("[MeetControl] Step: Checking Google Meet in-meeting audio settings...");
    await page.bringToFront().catch(() => {});
    // Try opening Google Meet settings via More Options
    const moreBtn = page.locator('button[aria-label*="More options" i], button[aria-label*="options" i]').first();
    if (await moreBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await moreBtn.click();
      await sleep(500);
      const settingsItem = page.locator('li[role="menuitem"]:has-text("Settings"), div[role="menuitem"]:has-text("Settings"), span:has-text("Settings")').first();
      if (await settingsItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await settingsItem.click();
        await sleep(1_000);

        // In settings modal, select CABLE Output for microphone
        const micOption = page.locator('div[role="option"]:has-text("CABLE Output"), span:has-text("CABLE Output"), li:has-text("CABLE Output")').first();
        if (await micOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await micOption.click();
          console.log("[MeetControl] SUCCESS: Selected CABLE Output microphone in Google Meet settings");
        }

        // Close modal
        const closeBtn = page.locator('button[aria-label*="Close" i], button:has-text("Close")').first();
        if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await closeBtn.click();
        }
      }
    }
  } catch (err) {
    console.warn("[MeetControl] Non-critical: Could not configure in-meeting audio device dropdown:", err);
  }
}

export async function setCameraOff(page: Page): Promise<void> {
  try {
    console.log("[MeetControl] Step: Ensuring Google Meet camera is turned OFF...");
    await page.bringToFront().catch(() => {});
    const camBtn = page.locator('button[aria-label*="camera" i], button[aria-label*="video" i], div[role="button"][aria-label*="camera" i], div[role="button"][aria-label*="video" i]').first();
    const exists = await camBtn.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!exists) {
      console.log("[MeetControl] Camera button not found (already off or not available).");
      return;
    }

    const isMutedAttr = await camBtn.getAttribute("data-is-muted", { timeout: 1_000 }).catch(() => null);
    const ariaLabel = (await camBtn.getAttribute("aria-label", { timeout: 1_000 }).catch(() => "")) || "";

    const isOff = isMutedAttr === "true" || /turn on camera/i.test(ariaLabel) || /turn on video/i.test(ariaLabel);
    if (isOff) {
      console.log("[MeetControl] Google Meet camera is already OFF.");
      return;
    }

    await camBtn.click({ timeout: 1_500 }).catch(async () => {
      await page.keyboard.press("Control+e");
    });
    console.log("[MeetControl] SUCCESS: Camera toggled OFF.");
  } catch (err) {
    console.warn("[MeetControl] Non-critical warning toggling camera off:", err);
  }
}

export async function dismissPopups(page: Page): Promise<boolean> {
  try {
    const { mediaPromptSelectors } = await import("./selectors.js");
    for (const sel of mediaPromptSelectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 300 }).catch(() => false)) {
        console.log(`[MeetControl] Dismissing popup prompt: ${sel}`);
        await loc.click({ timeout: 1000 }).catch(() => {});
        await sleep(300);
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function leaveMeeting(page: Page): Promise<void> {
  try {
    console.log("[MeetControl] Step: Leaving Google Meet call...");
    const leave = page.locator(selectors.IN_CALL).first();
    await leave.click({ timeout: 3_000 });
    await sleep(1_000);
    const confirm = page
      .locator('button:has-text("Leave meeting"), button:has-text("Just leave the meeting")')
      .first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
    console.log("[MeetControl] SUCCESS: Left Google Meet call.");
  } catch {
    // Page already closed or we were never in a call.
  }
}