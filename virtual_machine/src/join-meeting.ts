import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { existsSync } from "node:fs";
import readline from "node:readline";
import { parseConfig } from "./config.js";
import { selectors, joinButtonSelectors, askToJoinButtonSelectors } from "./selectors.js";
import { setMic, setCameraOff, leaveMeeting } from "./meet-control.js";
import {
  setSystemDefaultsForMeeting,
  restoreDefaults,
  type DefaultsState,
} from "./audio-routing.js";
import { AudioBridge } from "./audio-bridge.js";
import { VapiBridge } from "./vapi-bridge.js";
import { startControlServer } from "./control-server.js";

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
        "--autoplay-policy=no-user-gesture-required",
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

async function clickJoin(page: Page): Promise<void> {
  if (await clickFirstVisible(page, joinButtonSelectors)) {
    log("Clicking 'Join now'...");
    return;
  }
  if (await clickFirstVisible(page, askToJoinButtonSelectors)) {
    log("Clicking 'Ask to join' (locked meeting)...");
    return;
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

async function main(): Promise<void> {
  const config = parseConfig(process.argv);
  const vapiEnabled =
    !config.noVapi && Boolean(config.vapiKey) && Boolean(config.assistantId);
  log(
    `Joining: ${config.meetUrl}` +
      (vapiEnabled ? "" : " (Vapi not configured — joining with mic/cam off)"),
  );

  let context: BrowserContext | undefined;
  let audioDefaults: DefaultsState | undefined;
  let audioBridge: AudioBridge | undefined;
  let vapiBridge: VapiBridge | undefined;
  let mode: "speak" | "listen" = "listen";
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    log("Cleaning up...");
    try {
      await vapiBridge?.stop();
    } catch {
      /* ignore */
    }
    try {
      await audioBridge?.stop();
    } catch {
      /* ignore */
    }
    const page = context?.pages()[0];
    if (page) await leaveMeeting(page).catch(() => {});
    try {
      await context?.close();
    } catch {
      /* ignore */
    }
    if (audioDefaults) {
      try {
        await restoreDefaults(config.svclPath, audioDefaults);
      } catch (err) {
        log(
          "WARNING: could not restore audio defaults:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    log("Done.");
  };

  const shutdown = async (): Promise<void> => {
    await cleanup();
    process.exit(0);
  };

  try {
    if (vapiEnabled) {
      if (!existsSync(config.svclPath)) {
        throw new Error(
          `svcl.exe not found at ${config.svclPath}. ` +
            "Download SoundVolumeView from NirSoft, extract svcl.exe into tools/, and retry.",
        );
      }
      log("Switching system audio defaults to VB-Cable...");
      audioDefaults = await setSystemDefaultsForMeeting(
        config.svclPath,
        config.cableInputName,
        config.cableOutputName,
      );
    }

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
    await clickJoin(page);
    await waitForAdmission(page, config.admissionTimeoutMs);
    log("In meeting.");

    await setCameraOff(page);
    log("Camera off.");

    if (vapiEnabled) {
      audioBridge = new AudioBridge(config.bridgePort, (pcm) => {
        if (mode === "listen") vapiBridge?.sendUserAudio(pcm);
      });
      const pageUrl = await audioBridge.start();
      const audioPage = await context.newPage();
      await audioPage.goto(pageUrl);

      const setMode = async (speaking: boolean): Promise<void> => {
        const next: "speak" | "listen" = speaking ? "speak" : "listen";
        if (next === mode) return;
        mode = next;
        log(`Mode: ${mode.toUpperCase()}`);
        await setMic(page, speaking).catch(() => {});
      };

      vapiBridge = new VapiBridge(
        config.vapiKey!,
        config.assistantId!,
        (speaking) => {
          void setMode(speaking);
        },
      );
      vapiBridge.onAssistantAudio = (pcm) => audioBridge?.sendToPage(pcm);
      await vapiBridge.start();
      log("Vapi agent connected.");

      await setMode(true);

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.on("keypress", (_str, key) => {
        if (key.name === "m") {
          const muted = !vapiBridge?.muted;
          vapiBridge?.setMuted(muted);
          log(`Agent ${muted ? "muted" : "unmuted"}.`);
        }
        if (key.name === "q") void shutdown();
        if (key.ctrl && key.name === "c") void shutdown();
      });

      const controlPort = config.bridgePort + 1;
      startControlServer(controlPort, {
        setAgentMuted: (muted) => {
          vapiBridge?.setMuted(muted);
          log(`Agent ${muted ? "muted" : "unmuted"} (HTTP).`);
        },
        leave: () => void shutdown(),
      });
      log(
        `Controls: press 'm' to mute/unmute the agent, 'q' to leave. ` +
          `HTTP: POST http://127.0.0.1:${controlPort}/mute {"muted":true} | /leave`,
      );
    } else {
      await setMic(page, false);
      log("Mic off. Press Ctrl+C to leave.");
    }

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  } catch (err) {
    log("ERROR:", err instanceof Error ? err.message : String(err));
    await cleanup();
    process.exitCode = 1;
  }
}

void main();