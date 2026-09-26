import type { Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

export interface AttendanceInterval {
  joinedAt: string;        // e.g. "10:02:15 AM"
  leftAt: string;          // e.g. "10:18:40 AM"
  joinTimestamp: number;   // Epoch ms
  leaveTimestamp: number;  // Epoch ms
  durationSeconds: number; // Seconds spent in this session
}

export interface ParticipantAttendance {
  id: string;
  name: string;
  email: string;
  role: "Host" | "Co-host" | "Speaker" | "Attendee";
  avatarColor: string;
  joinedAt: string;        // First joined time
  leftAt: string;          // Final left time
  speakingTimePct: number;
  status: "Present" | "Left Early" | "Joined Late" | "Rejoined";
  rejoinCount: number;
  totalDurationSeconds: number;
  intervals: AttendanceInterval[];
}

interface ActiveSession {
  joinTimestamp: number;
  joinedAt: string;
}

interface ParticipantRecord {
  id: string;
  name: string;
  email: string;
  role: "Host" | "Co-host" | "Speaker" | "Attendee";
  avatarColor: string;
  firstJoinedAt: string;
  lastLeftAt: string;
  rejoinCount: number;
  intervals: AttendanceInterval[];
  currentSession: ActiveSession | null;
  lastSeenTimestamp: number;
  speakingTimePct: number;
}

const AVATAR_COLORS = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#f97316", // Orange
];

export const peopleButtonSelectors = [
  'button[data-panel-id="1"]',
  'button[aria-label*="Show everyone" i]',
  'button[aria-label*="People" i]',
  'button[aria-label*="participants" i]',
  'button[data-panel-id="people"]',
] as const;

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const UI_JUNK_WORDS = new Set([
  "close", "info", "search", "devices", "mood", "apps", "send", "videocam",
  "chat", "chat_bubble", "call_end", "mic", "mic_off", "videocam_off",
  "more_vert", "pin", "unpin", "settings", "lock", "security", "warning",
  "help", "help_outline", "feedback", "radio_button_checked", "check",
  "visitor badge", "visitor", "meeting details", "people", "everyone",
  "in-call messages", "activities", "host controls", "present now",
  "raise hand", "more options", "turn on microphone", "turn off microphone",
  "turn on camera", "turn off camera", "join now", "ask to join",
  "back_hand", "front_hand", "domain_disabled", "arrow_drop_down",
  "arrow_back", "keyboard_arrow_down", "keyboard_arrow_up",
  "computer_arrow_up", "closed_caption_off", "closed_caption",
  "fullscreen", "fullscreen_exit", "record", "stop", "volume_up", "volume_off",
  "attachment", "content_copy", "add", "add_circle", "screen_share",
  "stop_screen_share", "pan_tool", "hand", "hand_raised", "hand_gesture",
  "thumb_up", "thumb_down", "celebration", "favorite", "recommend"
]);

function cleanParticipantName(raw: string): string {
  if (!raw) return "";
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const trimmed = line.trim();
    // Material icons always use underscores (e.g. arrow_drop_down, videocam_off)
    if (trimmed.includes("_")) continue;
    if (trimmed.includes("http") || trimmed.includes(":") || trimmed.includes("...")) continue;

    const lower = trimmed.toLowerCase();
    if (UI_JUNK_WORDS.has(lower)) continue;
    if (lower.includes("badge") || lower.includes("options for") || lower.includes("pin to your")) continue;

    const c = trimmed
      .replace(/\(You\)/gi, "")
      .replace(/\(Host\)/gi, "")
      .replace(/\(Co-host\)/gi, "")
      .replace(/\(Meeting host\)/gi, "")
      .trim();

    if (c.length >= 2 && c.length <= 50 && /[a-zA-Z]/.test(c)) {
      if (UI_JUNK_WORDS.has(c.toLowerCase())) continue;
      // If all-caps, convert to Title Case
      if (c === c.toUpperCase() && c.length > 3) {
        return c.replace(
          /\w\S*/g,
          (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase()
        );
      }
      return c;
    }
  }
  return "";
}

/**
 * Attendance Tracker class to observe and log participant entry, exit, and rejoin events.
 */
export class AttendanceTracker {
  private page: Page;
  private meetingId: string;
  private meetingStartTime: number;
  private participants = new Map<string, ParticipantRecord>();
  private pollIntervalTimer: NodeJS.Timeout | null = null;
  private isActive = false;
  private colorIndex = 0;
  private readonly gracePeriodMs = 12_000; // 12s grace period before marking someone left
  private botDisplayName: string;
  private lastLoggedPoll = 0;

  constructor(options: {
    page: Page;
    meetingId: string;
    meetingStartTime?: number;
    botDisplayName?: string;
  }) {
    this.page = options.page;
    this.meetingId = options.meetingId;
    this.meetingStartTime = options.meetingStartTime || Date.now();
    this.botDisplayName = (options.botDisplayName || "MeetMinutes").toLowerCase();
  }

  private getNextColor(): string {
    const color = AVATAR_COLORS[this.colorIndex % AVATAR_COLORS.length];
    this.colorIndex++;
    return color;
  }

  public isBotName(name: string): boolean {
    const norm = name.toLowerCase().replace(/[\s_-]+/g, "");
    const botNorm = (this.botDisplayName || "meetminutes").toLowerCase().replace(/[\s_-]+/g, "");
    return norm.includes("meetminutes") || norm === botNorm || norm === "meetminutesaiassistant";
  }

  /**
   * Attempts to open the Google Meet People panel so the full participant list is rendered.
   */
  public async openPeoplePanel(): Promise<boolean> {
    if (this.page.isClosed()) return false;
    try {
      const isAlreadyOpen = await this.page.evaluate(`(() => {
        return !!document.querySelector(
          'div[data-side-panel-id="1"], div[aria-label*="People" i][role="region"], div[role="list"][aria-label*="participant" i]'
        );
      })()`);
      if (isAlreadyOpen) {
        console.log("[AttendanceTracker] People panel is already open.");
        return true;
      }

      for (const sel of peopleButtonSelectors) {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          const label = (await btn.getAttribute("aria-label").catch(() => sel)) || "";
          if (label.toLowerCase().includes("chat")) continue;
          console.log(`[AttendanceTracker] Opening People panel via button: "${label}"...`);
          await btn.click({ timeout: 1500 }).catch(() => {});
          await new Promise((r) => setTimeout(r, 600));
          return true;
        }
      }
    } catch (err: any) {
      console.warn("[AttendanceTracker] Could not open People panel:", err.message);
    }
    return false;
  }

  /**
   * Starts tracking participants in the Google Meet call.
   */
  public async start(): Promise<void> {
    if (this.isActive) return;
    this.isActive = true;
    console.log(`[AttendanceTracker] 📋 Started real-time attendance monitor for meeting "${this.meetingId}"`);

    // In-page setup: monitor live toasts and announcements
    await this.page
      .evaluate(`(() => {
        window.__meetAttendanceAnnouncements = [];

        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                const text = (el.innerText || el.textContent || "").trim();
                if (
                  text &&
                  (text.toLowerCase().includes("joined") || text.toLowerCase().includes("left")) &&
                  text.length < 120
                ) {
                  window.__meetAttendanceAnnouncements.push({
                    text,
                    timestamp: Date.now(),
                  });
                }
              }
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      })()`)
      .catch((err) => {
        console.warn("[AttendanceTracker] Could not attach in-page announcement observer:", err.message);
      });

    // Try opening People panel to guarantee maximum visibility
    await this.openPeoplePanel().catch(() => {});

    // Run initial poll
    await this.pollRoster();

    // Heartbeat poll every 2.5 seconds
    this.pollIntervalTimer = setInterval(() => {
      void this.pollRoster();
    }, 2500);
  }

  /**
   * Scrapes currently visible participant names from Google Meet DOM.
   */
  public async getVisibleParticipantNames(): Promise<string[]> {
    if (this.page.isClosed()) return [];
    try {
      return (await this.page.evaluate(`(() => {
        const found = new Set();

        const JUNK = new Set([
          "close", "info", "search", "devices", "mood", "apps", "send", "videocam",
          "chat", "chat_bubble", "call_end", "mic", "mic_off", "videocam_off",
          "more_vert", "pin", "unpin", "settings", "lock", "security", "warning",
          "help", "help_outline", "feedback", "radio_button_checked", "check",
          "visitor badge", "visitor", "meeting details", "people", "everyone",
          "in-call messages", "activities", "host controls", "present now",
          "raise hand", "more options", "turn on microphone", "turn off microphone",
          "turn on camera", "turn off camera", "join now", "ask to join",
          "back_hand", "front_hand", "domain_disabled", "arrow_drop_down",
          "arrow_back", "keyboard_arrow_down", "keyboard_arrow_up",
          "computer_arrow_up", "closed_caption_off", "closed_caption",
          "fullscreen", "fullscreen_exit", "record", "stop", "volume_up", "volume_off",
          "attachment", "content_copy", "add", "add_circle", "screen_share",
          "stop_screen_share", "pan_tool", "hand", "hand_raised", "hand_gesture",
          "thumb_up", "thumb_down", "celebration", "favorite", "recommend"
        ]);

        const cleanStr = (raw) => {
          if (!raw) return "";
          const lines = raw.split("\\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            // Reject any icon ligature with underscores
            if (line.includes("_")) continue;
            if (line.includes(":") || line.includes("http") || line.includes("...")) continue;

            const lower = line.toLowerCase();
            if (JUNK.has(lower)) continue;
            if (lower.includes("badge") || lower.includes("options for") || lower.includes("pin to your")) continue;

            let c = line
              .replace(/\\(You\\)/gi, "")
              .replace(/\\(Host\\)/gi, "")
              .replace(/\\(Co-host\\)/gi, "")
              .replace(/\\(Meeting host\\)/gi, "")
              .trim();

            if (c.length >= 2 && c.length <= 50 && /[a-zA-Z]/.test(c)) {
              if (JUNK.has(c.toLowerCase())) continue;
              if (c === c.toUpperCase() && c.length > 3) {
                c = c.replace(/\\w\\S*/g, (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase());
              }
              return c;
            }
          }
          return "";
        };

        // 1. People tab list items (canonical roster when People tab is open)
        const listItems = document.querySelectorAll(
          'div[data-side-panel-id="1"] div[role="listitem"], div[aria-label*="participant" i] div[role="listitem"], div[role="list"] div[role="listitem"]'
        );
        listItems.forEach((item) => {
          // Google Meet specific participant name span (zWGUib or dir="auto")
          const nameSpan = item.querySelector('span.zWGUib, span[dir="auto"], span.ZjFb7c');
          if (nameSpan) {
            const name = cleanStr(nameSpan.innerText || nameSpan.textContent || "");
            if (name) {
              found.add(name);
              return;
            }
          }
          // Fallback inside listitem: find text span not inside button and not an icon
          const spans = Array.from(item.querySelectorAll('span, div'));
          for (const s of spans) {
            if (
              s.closest('button') ||
              s.getAttribute('aria-hidden') === 'true' ||
              s.classList.contains('google-material-icons') ||
              s.classList.contains('google-symbols')
            ) {
              continue;
            }
            const name = cleanStr(s.innerText || s.textContent || "");
            if (name) {
              found.add(name);
              break;
            }
          }
        });

        // 2. Participant video tiles in call viewport
        const tileContainers = document.querySelectorAll(
          'div[data-participant-id], [data-requested-participant-id], div[data-self-name], [data-allocation-index]'
        );
        tileContainers.forEach((tile) => {
          const selfName = tile.getAttribute('data-self-name');
          if (selfName) {
            const n = cleanStr(selfName);
            if (n) { found.add(n); return; }
          }

          const text = tile.innerText || tile.textContent || "";

          // Accessibility label check (if hovered)
          const pinMatch = text.match(/Pin\\s+(.+?)\\s+to\\s+your\\s+main\\s+screen/i);
          if (pinMatch && pinMatch[1]) {
            const n = cleanStr(pinMatch[1]);
            if (n) { found.add(n); return; }
          }
          const optMatch = text.match(/More options for\\s+(.+)/i);
          if (optMatch && optMatch[1]) {
            const n = cleanStr(optMatch[1]);
            if (n) { found.add(n); return; }
          }

          // Avatar image aria-label
          const avatar = tile.querySelector('[role="img"][aria-label]');
          if (avatar) {
            const n = cleanStr(avatar.getAttribute("aria-label") || "");
            if (n) { found.add(n); return; }
          }

          // Name elements inside video tile (Google Meet uses poVWob, XE8e1e, zWGUib, or dir="auto")
          const tileNameSpan = tile.querySelector('div.poVWob, div.XE8e1e, span.zWGUib, div.zWGUib, span[dir="auto"], div[dir="auto"], span.ZjFb7c');
          if (tileNameSpan) {
            const n = cleanStr(tileNameSpan.innerText || tileNameSpan.textContent || "");
            if (n) { found.add(n); return; }
          }

          // Fallback: clean the tile's own text content
          const fallback = cleanStr(text);
          if (fallback) found.add(fallback);
        });

        // 3. Name badges across call viewport
        const nameBadges = document.querySelectorAll('div.poVWob, div.XE8e1e, div[data-self-name]');
        nameBadges.forEach((badge) => {
          const self = badge.getAttribute('data-self-name');
          if (self) {
            const n = cleanStr(self);
            if (n) found.add(n);
          }
          const n = cleanStr(badge.innerText || badge.textContent || "");
          if (n) found.add(n);
        });

        return Array.from(found);
      })()`) as string[]) || [];
    } catch (err: any) {
      console.error("[AttendanceTracker] Error evaluating participant names:", err.message);
      return [];
    }
  }

  /**
   * Reads and flushes in-page join/leave announcement toasts.
   */
  private async getPendingAnnouncements(): Promise<Array<{ text: string; timestamp: number }>> {
    if (this.page.isClosed()) return [];
    try {
      return (await this.page.evaluate(`(() => {
        const arr = window.__meetAttendanceAnnouncements || [];
        window.__meetAttendanceAnnouncements = [];
        return arr;
      })()`) as Array<{ text: string; timestamp: number }>) || [];
    } catch {
      return [];
    }
  }

  /**
   * Differential roster scan to track entries, exits, and rejoins.
   */
  public async pollRoster(): Promise<void> {
    if (!this.isActive || this.page.isClosed()) return;

    const now = Date.now();
    const visibleNames = await this.getVisibleParticipantNames();
    const announcements = await this.getPendingAnnouncements();

    // Process announcements first for early detection
    for (const item of announcements) {
      const cleanToast = item.text.replace(/^(?:person_add|close|chat|info)\s+/i, "").trim();
      const joinMatch = cleanToast.match(/([A-Za-z0-9\s.]+?)\s+(?:has\s+)?joined/i);
      const leaveMatch = cleanToast.match(/([A-Za-z0-9\s.]+?)\s+left/i);

      if (joinMatch && joinMatch[1]) {
        const cleanName = cleanParticipantName(joinMatch[1]);
        if (cleanName && !visibleNames.some((v) => v.toLowerCase() === cleanName.toLowerCase())) {
          visibleNames.push(cleanName);
        }
      } else if (leaveMatch && leaveMatch[1]) {
        const cleanName = cleanParticipantName(leaveMatch[1]);
        if (cleanName) {
          this.handleParticipantLeft(cleanName.toLowerCase(), item.timestamp);
        }
      }
    }

    // Periodic heartbeat log so we can see active participant detection
    if (now - this.lastLoggedPoll > 8000) {
      this.lastLoggedPoll = now;
      console.log(
        `[AttendanceTracker] 🔍 Active roster scan (${visibleNames.length} detected):`,
        visibleNames
      );
    }

    const currentSweep = new Set<string>();

    for (const rawName of visibleNames) {
      const name = rawName.trim();
      if (!name || this.isBotName(name)) {
        continue;
      }
      const nameKey = name.toLowerCase();
      currentSweep.add(nameKey);

      let record = this.participants.get(nameKey);
      if (!record) {
        // New Participant First Join
        const timeStr = formatTime(now);
        const newRecord: ParticipantRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@meeting.attendee`,
          role: "Attendee",
          avatarColor: this.getNextColor(),
          firstJoinedAt: timeStr,
          lastLeftAt: timeStr,
          rejoinCount: 0,
          intervals: [],
          currentSession: {
            joinTimestamp: now,
            joinedAt: timeStr,
          },
          lastSeenTimestamp: now,
          speakingTimePct: 0,
        };
        this.participants.set(nameKey, newRecord);
        console.log(`[AttendanceTracker] 🟢 First Join: "${name}" joined at ${timeStr}`);
      } else {
        // Existing participant
        if (!record.currentSession) {
          // Rejoin event!
          record.rejoinCount += 1;
          const timeStr = formatTime(now);
          record.currentSession = {
            joinTimestamp: now,
            joinedAt: timeStr,
          };
          console.log(
            `[AttendanceTracker] 🔄 REJOIN: "${record.name}" rejoined the meeting at ${timeStr} (Rejoin #${record.rejoinCount})`
          );
        }
        record.lastSeenTimestamp = now;
      }
    }

    // Check for participants who disappeared longer than the grace period
    for (const [nameKey, record] of this.participants.entries()) {
      if (record.currentSession && !currentSweep.has(nameKey)) {
        const silenceDuration = now - record.lastSeenTimestamp;
        if (silenceDuration >= this.gracePeriodMs) {
          this.handleParticipantLeft(nameKey, record.lastSeenTimestamp);
        }
      }
    }
  }

  /**
   * Closes an active attendance session for a participant who left.
   */
  private handleParticipantLeft(nameOrKey: string, leaveTimestamp: number): void {
    const key = nameOrKey.toLowerCase();
    const record = this.participants.get(key);
    if (!record || !record.currentSession) return;

    const session = record.currentSession;
    const leaveTimeStr = formatTime(leaveTimestamp);
    const durationSeconds = Math.max(
      1,
      Math.round((leaveTimestamp - session.joinTimestamp) / 1000)
    );

    record.intervals.push({
      joinedAt: session.joinedAt,
      leftAt: leaveTimeStr,
      joinTimestamp: session.joinTimestamp,
      leaveTimestamp,
      durationSeconds,
    });

    record.lastLeftAt = leaveTimeStr;
    record.currentSession = null;

    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationFmt = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    console.log(
      `[AttendanceTracker] 🔴 Left: "${record.name}" left at ${leaveTimeStr} (Session duration: ${durationFmt})`
    );
  }

  /**
   * Finalizes attendance tracking and outputs the structured summary.
   */
  public async stop(): Promise<ParticipantAttendance[]> {
    if (!this.isActive) {
      return this.getSummary();
    }
    this.isActive = false;

    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }

    const meetingEndTime = Date.now();
    const meetingEndTimeStr = formatTime(meetingEndTime);

    // Close any still-open sessions
    for (const [_name, record] of this.participants.entries()) {
      if (record.currentSession) {
        const durationSeconds = Math.max(
          1,
          Math.round((meetingEndTime - record.currentSession.joinTimestamp) / 1000)
        );
        record.intervals.push({
          joinedAt: record.currentSession.joinedAt,
          leftAt: meetingEndTimeStr,
          joinTimestamp: record.currentSession.joinTimestamp,
          leaveTimestamp: meetingEndTime,
          durationSeconds,
        });
        record.lastLeftAt = meetingEndTimeStr;
        record.currentSession = null;
      }
    }

    const summary = this.getSummary(meetingEndTime);
    console.log(`[AttendanceTracker] ✅ Attendance summary finalized (${summary.length} attendees recorded).`);

    // Output machine-readable payload to stdout for parent process
    console.log(`[ATTENDANCE_DATA] ${JSON.stringify(summary)}`);

    // Also persist to scratch/attendance-<meetingId>.json
    try {
      const scratchDir = path.resolve(process.cwd(), "scratch");
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      const filePath = path.join(scratchDir, `attendance-${this.meetingId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
      console.log(`[AttendanceTracker] 💾 Attendance saved to ${filePath}`);
    } catch (err: any) {
      console.warn("[AttendanceTracker] Could not write attendance file to scratch:", err.message);
    }

    return summary;
  }

  /**
   * Formats internal participant records into clean, exportable ParticipantAttendance objects.
   */
  public getSummary(meetingEndTime = Date.now()): ParticipantAttendance[] {
    const totalMeetingSeconds = Math.max(
      1,
      Math.round((meetingEndTime - this.meetingStartTime) / 1000)
    );

    const result: ParticipantAttendance[] = [];

    for (const record of this.participants.values()) {
      const totalDurationSeconds = record.intervals.reduce(
        (sum, int) => sum + int.durationSeconds,
        0
      );

      // Determine attendance status
      let status: "Present" | "Left Early" | "Joined Late" | "Rejoined" = "Present";
      const joinedLateThresholdMs = 3 * 60 * 1000; // 3 minutes after meeting start

      if (record.rejoinCount > 0) {
        status = "Rejoined";
      } else if (
        record.intervals.length > 0 &&
        record.intervals[0].joinTimestamp - this.meetingStartTime > joinedLateThresholdMs
      ) {
        status = "Joined Late";
      } else if (
        totalMeetingSeconds > 60 &&
        totalDurationSeconds < totalMeetingSeconds * 0.75
      ) {
        status = "Left Early";
      }

      result.push({
        id: record.id,
        name: record.name,
        email: record.email,
        role: record.role,
        avatarColor: record.avatarColor,
        joinedAt: record.firstJoinedAt,
        leftAt: record.lastLeftAt,
        speakingTimePct: record.speakingTimePct,
        status,
        rejoinCount: record.rejoinCount,
        totalDurationSeconds,
        intervals: record.intervals,
      });
    }

    return result;
  }

  /**
   * Returns the count of human participants currently present in the meeting (excluding the bot).
   */
  public getActiveHumanCount(): number {
    let count = 0;
    const botName = (this.botDisplayName || "meetminutes").toLowerCase();
    for (const record of this.participants.values()) {
      if (record.currentSession) {
        const nameLower = record.name.toLowerCase();
        const isBot =
          nameLower.includes("meetminutes") ||
          nameLower.includes("assistant") ||
          nameLower.includes(botName);
        if (!isBot) {
          count++;
        }
      }
    }
    return count;
  }
}

/**
 * Helper function to create and start an AttendanceTracker.
 */
export async function startAttendanceTracker(options: {
  page: Page;
  meetingId: string;
  meetingStartTime?: number;
  botDisplayName?: string;
}): Promise<AttendanceTracker> {
  const tracker = new AttendanceTracker(options);
  await tracker.start();
  return tracker;
}
