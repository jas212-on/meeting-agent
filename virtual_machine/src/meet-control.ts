import type { Page } from "playwright";
import { selectors } from "./selectors.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function setMic(page: Page, on: boolean): Promise<void> {
  const micOffBtn = page.locator(selectors.MIC_OFF).first();
  const isOn = await micOffBtn.isVisible().catch(() => false);
  if (on === isOn) return;
  const btn = page.locator(on ? selectors.MIC_ON : selectors.MIC_OFF).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

export async function setCameraOff(page: Page): Promise<void> {
  const btn = page.locator(selectors.CAMERA_ON).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
}

export async function leaveMeeting(page: Page): Promise<void> {
  try {
    const leave = page.locator(selectors.IN_CALL).first();
    await leave.click({ timeout: 3_000 });
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