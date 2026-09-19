import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { existsSync } from "node:fs";
import readline from "node:readline";
import type http from "node:http";
import { parseConfig } from "./config.js";
import {
  selectors,
  joinButtonSelectors,
  askToJoinButtonSelectors,
  callEndedSelectors,
} from "./selectors.js";
import { setMic, setCameraOff, leaveMeeting, dismissPopups } from "./meet-control.js";
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
  log(`[Step 3] Launching Chrome with persistent profile: ${absolute}`);
  try {
    const context = await chromium.launchPersistentContext(absolute, {
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
    log("[Step 3] Chrome browser launched successfully.");
    return context;
  } catch (err) {
    log("[Step 3] FAILED: Could not launch Chrome browser:", err);
    throw new Error(
      `Failed to launch Chrome with profile "${absolute}". ` +
        "Close any Chrome window already using this profile, then retry. " +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

async function waitForPrejoin(page: Page, timeoutMs: number): Promise<void> {
  log(`[Step 6] Waiting for Google Meet pre-join screen (timeout: ${timeoutMs}ms)...`);
  const candidates = [
    [selectors.NAME_INPUT, "name"],
    [selectors.MEDIA_PROMPT_ACCEPT, "mediaPrompt"],
    [selectors.IN_CALL, "inCall"],
    ...joinButtonSelectors.map((sel) => [sel, "joinNow"] as const),
    ...askToJoinButtonSelectors.map((sel) => [sel, "askToJoin"] as const),
  ] as const;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dismissPopups(page);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const stage = await Promise.any(
        candidates.map(([sel, key]) =>
          page
            .locator(sel)
            .first()
            .waitFor({ state: "visible", timeout: Math.min(2000, remaining) })
            .then(() => key),
        ),
      );

      if (stage === "mediaPrompt") {
        log("[Step 6] Media prompt detected: Dismissing microphone/camera permission prompt...");
        await dismissPopups(page);
        continue;
      }
      log(`[Step 6] Pre-join screen ready (detected stage: ${stage}).`);
      return;
    } catch {
      await dismissPopups(page);
      await sleep(300);
    }
  }
  log("[Step 6] FAILED: Google Meet pre-join screen did not appear within timeout.");
  throw new Error("Google Meet pre-join screen did not appear in time.");
}

async function fillName(page: Page, displayName: string | undefined): Promise<void> {
  if (!displayName) {
    log("[Step 7] No custom display name provided, using default account profile name.");
    return;
  }
  log(`[Step 7] Setting participant display name to: "${displayName}"...`);
  const input = page.locator(selectors.NAME_INPUT).first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(displayName);
    log(`[Step 7] Display name set to "${displayName}".`);
  } else {
    log("[Step 7] Name input not required (already logged into Google account).");
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

async function clickJoin(page: Page, timeoutMs = 15_000): Promise<void> {
  log("[Step 8] Locating and clicking Join button...");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await dismissPopups(page);
    if (await clickFirstVisible(page, joinButtonSelectors)) {
      log("[Step 8] Clicked 'Join now' button.");
      return;
    }
    if (await clickFirstVisible(page, askToJoinButtonSelectors)) {
      log("[Step 8] Clicked 'Ask to join' button (meeting with host admission required).");
      return;
    }
    await sleep(500);
  }
  log("[Step 8] FAILED: No join button found on pre-join screen.");
  throw new Error("No join button found on the pre-join screen.");
}

async function waitForAdmission(page: Page, timeoutMs: number): Promise<void> {
  log(`[Step 9] Waiting for admission into call (timeout: ${timeoutMs}ms)...`);
  const deadline = Date.now() + timeoutMs;
  let waitingLogged = false;
  while (Date.now() < deadline) {
    if (await page.locator(selectors.IN_CALL).first().isVisible().catch(() => false)) {
      log("[Step 9] SUCCESS: Admitted and joined the call.");
      return;
    }
    if (await page.locator(selectors.ALONE).first().isVisible().catch(() => false)) {
      log("[Step 9] SUCCESS: Joined the call (currently alone in room).");
      return;
    }

    const inWaitingRoom = await page
      .locator(selectors.WAITING_ROOM)
      .first()
      .isVisible()
      .catch(() => false);
    if (inWaitingRoom) {
      if (!waitingLogged) {
        log("[Step 9] In waiting room: waiting for the meeting host to admit the agent...");
        waitingLogged = true;
      }
    } else {
      const clicked = await clickJoin(page).catch(() => false);
      if (clicked) {
        log("[Step 9] Not in the call yet — re-clicked join button.");
      }
    }
    await sleep(2_000);
  }
  log("[Step 9] FAILED: Timed out waiting for host admission.");
  throw new Error("Not admitted to the meeting within the timeout.");
}

function startCallMonitor(page: Page, onCallEnded: () => void): () => void {
  let active = true;
  let timer: NodeJS.Timeout | null = null;

  const check = async () => {
    if (!active || page.isClosed()) return;
    try {
      const url = page.url();
      // Google Meet redirects to /landing or root domain after leaving
      if (
        url.includes("/landing") ||
        url === "https://meet.google.com/" ||
        url === "https://meet.google.com" ||
        url.startsWith("https://meet.google.com/?")
      ) {
        log(`[CallMonitor] Google Meet left call room (URL: ${url}). Ending session...`);
        active = false;
        if (timer) clearInterval(timer);
        onCallEnded();
        return;
      }

      // Check for explicit call ended / left UI elements
      for (const sel of callEndedSelectors) {
        const isEnded = await page
          .locator(sel)
          .first()
          .isVisible({ timeout: 200 })
          .catch(() => false);
        if (isEnded) {
          log(`[CallMonitor] Detected meeting exit screen (found "${sel}"). Ending session...`);
          active = false;
          if (timer) clearInterval(timer);
          onCallEnded();
          return;
        }
      }

      // Check if in-call controls disappeared
      const inCall = await page
        .locator(selectors.IN_CALL)
        .first()
        .isVisible({ timeout: 200 })
        .catch(() => false);
      if (!inCall) {
        const alone = await page
          .locator(selectors.ALONE)
          .first()
          .isVisible({ timeout: 200 })
          .catch(() => false);
        if (!alone) {
          // Double-check after 2 seconds to avoid transient UI flashes
          await sleep(2000);
          if (!active || page.isClosed()) return;
          const stillInCall = await page
            .locator(selectors.IN_CALL)
            .first()
            .isVisible({ timeout: 300 })
            .catch(() => false);
          const stillAlone = await page
            .locator(selectors.ALONE)
            .first()
            .isVisible({ timeout: 300 })
            .catch(() => false);
          if (!stillInCall && !stillAlone) {
            log("[CallMonitor] In-call controls no longer visible. Ending session...");
            active = false;
            if (timer) clearInterval(timer);
            onCallEnded();
            return;
          }
        }
      }
    } catch {
      // Ignore transient errors while page is navigating or closing
    }
  };

  timer = setInterval(() => {
    void check();
  }, 2000);

  return () => {
    active = false;
    if (timer) clearInterval(timer);
  };
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv);
  const vapiEnabled =
    !config.noVapi && Boolean(config.vapiKey) && Boolean(config.assistantId);

  log("=================================================");
  log("        GOOGLE MEET AI VOICE AGENT STARTING      ");
  log("=================================================");
  log(`[Step 1] Target Meeting: ${config.meetUrl}`);
  log(`[Step 1] Vapi Integration: ${vapiEnabled ? "ENABLED" : "DISABLED"}`);

  let context: BrowserContext | undefined;
  let audioDefaults: DefaultsState | undefined;
  let audioBridge: AudioBridge | undefined;
  let vapiBridge: VapiBridge | undefined;
  let controlServer: http.Server | undefined;
  let stopCallMonitor: (() => void) | undefined;
  let mode: "speak" | "listen" | undefined = undefined;
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    log("Cleaning up session...");
    if (stopCallMonitor) {
      stopCallMonitor();
      stopCallMonitor = undefined;
    }
    try {
      controlServer?.close();
    } catch {
      /* ignore */
    }
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
    if (page && !page.isClosed()) {
      await leaveMeeting(page).catch(() => {});
    }
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
    log("Session cleanup complete.");
  };

  const shutdown = async (): Promise<void> => {
    await cleanup();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());


  try {
    if (vapiEnabled) {
      log("[Step 2] Checking svcl audio routing tool...");
      if (!existsSync(config.svclPath)) {
        throw new Error(
          `svcl.exe not found at ${config.svclPath}. ` +
            "Download SoundVolumeView from NirSoft, extract svcl.exe into tools/, and retry.",
        );
      }
      log("[Step 2] Switching system audio defaults to VB-Cable...");
      audioDefaults = await setSystemDefaultsForMeeting(
        config.svclPath,
        config.cableInputName,
        config.cableOutputName,
      );
      log("[Step 2] System audio defaults successfully configured to VB-Cable.");
    }

    context = await launchContext(config.profileDir);
    context.on("close", () => {
      log("[Browser] Chrome browser closed. Initiating shutdown...");
      void shutdown();
    });

    const mediaHookScript = `
      (function() {
        if (!window.location.href.includes('meet.google.com')) {
          return;
        }

        try {
          Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; } });
        } catch (e) {}

        // 1. Intercept microphone capture to force CABLE Output and disable video
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          var origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async function(constraints) {
            if (constraints) {
              if (constraints.video) {
                console.log('[MediaHook] Disabling video capture in constraints (camera kept OFF)');
                constraints.video = false;
              }
            }

            if (constraints && constraints.audio) {
              try {
                var devices = await navigator.mediaDevices.enumerateDevices();
                var cableMic = devices.find(function(d) {
                  return d.kind === 'audioinput' && /cable output|vb-audio/i.test(d.label);
                });
                if (cableMic) {
                  console.log('[MediaHook] Routing getUserMedia microphone to CABLE Output:', cableMic.label, cableMic.deviceId);
                  if (typeof constraints.audio === 'boolean') {
                    constraints.audio = {
                      deviceId: { exact: cableMic.deviceId },
                      echoCancellation: false,
                      noiseSuppression: false,
                      autoGainControl: false,
                      channelCount: 1
                    };
                  } else if (typeof constraints.audio === 'object') {
                    constraints.audio = Object.assign({}, constraints.audio, {
                      deviceId: { exact: cableMic.deviceId },
                      echoCancellation: false,
                      noiseSuppression: false,
                      autoGainControl: false,
                      channelCount: 1
                    });
                  }
                }
              } catch (err) {
                console.warn('[MediaHook] Error selecting CABLE Output microphone:', err);
              }
              return origGetUserMedia(constraints);
            }

            // If only video was requested without audio, return a disabled empty video stream
            var canvas = document.createElement('canvas');
            canvas.width = 2;
            canvas.height = 2;
            var stream = canvas.captureStream ? canvas.captureStream(0) : new MediaStream();
            var track = stream.getVideoTracks()[0];
            if (track) {
              track.enabled = false;
              track.stop();
            }
            return stream;
          };
        }
      })();
    `;

    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(config.prejoinTimeoutMs);
    page.on("close", () => {
      log("[Meet] Google Meet tab was closed. Initiating shutdown...");
      void shutdown();
    });
    await page.addInitScript(mediaHookScript);

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[MediaHook]") || text.includes("audio") || text.includes("microphone") || text.includes("[MeetControl]")) {
        log("[meet:browser]", text);
      }
    });
    page.on("pageerror", (err: Error) => {
      log("[meet:pageerror]", err.message);
    });

    let audioPage: Page | undefined;
    if (vapiEnabled) {
      log("[Step 4] Initializing Audio Bridge server and browser worklet...");
      let audioBytes = 0;
      let maxPeak = 0;
      let lastLog = 0;
      let totalVoiceChunks = 0;

      audioBridge = new AudioBridge(config.bridgePort, (pcm) => {
        totalVoiceChunks++;
        audioBytes += pcm.length;
        for (let i = 0; i < pcm.length; i += 2) {
          const val = Math.abs(pcm.readInt16LE(i));
          if (val > maxPeak) maxPeak = val;
        }

        const now = Date.now();
        if (now - lastLog > 3_000) {
          const peakPercent = Math.round((maxPeak / 32768) * 100);
          log(`[AudioPipeline] User voice received (${pcm.length} B chunk, total: ${Math.round(audioBytes / 1024)} KB, signal peak: ${peakPercent}%) -> voice sent to vapi`);
          maxPeak = 0;
          lastLog = now;
        }

        vapiBridge?.sendUserAudio(pcm);
      });

      audioBridge.onPlaybackStateChange = (playing) => {
        log(`[AudioPipeline] Audio playback state changed: ${playing ? "PLAYING assistant voice in meeting" : "STOPPED / IDLE"}`);
        vapiBridge?.setPlaybackState(playing);
      };

      const pageUrl = await audioBridge.start();
      audioPage = await context.newPage();
      audioPage.on("console", (msg) => {
        log("[browser:bridge]", msg.text());
      });
      audioPage.on("pageerror", (err: Error) => {
        log("[browser:bridge:pageerror]", err.message);
      });

      log(`[Step 4] Opening audio bridge page at ${pageUrl}...`);
      await audioPage.goto(pageUrl);
      await audioBridge.waitForReady();
      log("[Step 4] SUCCESS: Audio Bridge initialized and fully ready.");
    }

    await page.bringToFront().catch(() => {});
    log(`[Step 5] Navigating to Google Meet: ${config.meetUrl}...`);
    await page.goto(config.meetUrl, { waitUntil: "domcontentloaded" });

    await waitForPrejoin(page, config.prejoinTimeoutMs);
    await fillName(page, config.displayName);
    await setCameraOff(page).catch(() => {});
    await setMic(page, false).catch(() => {});
    await clickJoin(page);
    await waitForAdmission(page, config.admissionTimeoutMs);
    log("[Step 10] Successfully joined meeting.");

    // Start background monitor for meeting ending
    stopCallMonitor = startCallMonitor(page, () => {
      log("[CallMonitor] Google Meet call ended. Initiating shutdown...");
      void shutdown();
    });

    try {
      await setCameraOff(page);
      log("[Step 10] Camera confirmed OFF.");
    } catch {
      /* non-critical */
    }

    try {
      await setMic(page, false);
      log("[Step 10] Microphone confirmed MUTED (listening mode).");
    } catch {
      /* non-critical */
    }

    if (vapiEnabled) {
      const setMode = async (speaking: boolean): Promise<void> => {
        const next: "speak" | "listen" = speaking ? "speak" : "listen";
        if (next === mode) return;
        mode = next;
        log(`[ModeChange] Switched to mode: ${mode.toUpperCase()} (Assistant is ${speaking ? "SPEAKING (unmuting mic)" : "LISTENING (muting mic)"})`);
        try {
          await setMic(page, speaking);
        } catch (err) {
          log("Warning: could not toggle Google Meet microphone:", err instanceof Error ? err.message : String(err));
        }
      };

      log("[Step 11] Connecting to Vapi Voice AI Agent...");
      vapiBridge = new VapiBridge(
        config.vapiKey!,
        config.assistantId!,
        (speaking) => {
          void setMode(speaking);
        },
      );
      vapiBridge.onAssistantAudio = (pcm) => {
        audioBridge?.sendToPage(pcm);
      };
      await vapiBridge.start();
      log("[Step 11] SUCCESS: Vapi Voice AI Agent connected and active.");

      // Ensure Google Meet microphone is explicitly muted in listening mode upon joining
      await setMode(false);

      log("=================================================");
      log("   ALL STEPS COMPLETED: AGENT ACTIVE & LISTENING ");
      log("=================================================");

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdin.on("keypress", (_str, key) => {
        if (key.name === "m") {
          const muted = !vapiBridge?.muted;
          vapiBridge?.setMuted(muted);
          log(`Agent ${muted ? "MUTED" : "UNMUTED"}.`);
        }
        if (key.name === "q") void shutdown();
        if (key.ctrl && key.name === "c") void shutdown();
      });

      const controlPort = config.bridgePort + 1;
      controlServer = startControlServer(controlPort, {
        setAgentMuted: (muted) => {
          vapiBridge?.setMuted(muted);
          log(`Agent ${muted ? "MUTED" : "UNMUTED"} (via HTTP).`);
        },
        leave: () => void shutdown(),
      });
      log(
        `Controls: Press 'm' to mute/unmute, 'q' to leave meeting. ` +
          `HTTP API: POST http://127.0.0.1:${controlPort}/mute {"muted":true} | /leave`,
      );
    } else {
      await setMic(page, false);
      log("Mic off. Press Ctrl+C to leave.");
    }
  } catch (err) {
    log("CRITICAL ERROR ENCOUNTERED:", err instanceof Error ? err.message : String(err));
    await cleanup();
    process.exitCode = 1;
  }
}

void main();