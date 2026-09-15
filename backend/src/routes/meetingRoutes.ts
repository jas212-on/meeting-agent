import { Router, type Response } from "express";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";
import { Meeting } from "../models/Meeting.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VM_DIR = path.resolve(__dirname, "..", "..", "..", "virtual_machine");

/* ── Session state ───────────────────────────────────────── */
let activeProcess: ChildProcess | null = null;
let status: "idle" | "joining" | "running" = "idle";
let logs: string[] = [];
const sseClients: Set<Response> = new Set();

let currentMeetingId: string | null = null;
let currentMeetingUrl: string | null = null;
let currentMeetingStartTime: number | null = null;
let currentUserId: any = null;
let currentUserName = "Meeting Host";
let currentUserEmail = "host@meetminutes.ai";

function broadcast(line: string): void {
  logs.push(line);
  if (logs.length > 500) logs = logs.slice(-400);
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }
}

function extractMeetingId(url: string): string {
  try {
    const match = url.match(/meet\.google\.com\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return match[1].replace(/[^a-zA-Z0-9-]/g, "");
    }
  } catch {
    // fallback
  }
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const r = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${r(3)}-${r(4)}-${r(3)}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m ${remSecs}s`;
  }
  return `${mins}m ${remSecs < 10 ? "0" : ""}${remSecs}s`;
}

async function saveCompletedMeetingToDB(exitCode: number | null = 0): Promise<void> {
  if (!currentMeetingId || !currentMeetingUrl) return;

  const meetingId = currentMeetingId;
  const meetingUrl = currentMeetingUrl;
  const startTime = currentMeetingStartTime || Date.now();
  const durationSeconds = Math.max(8, Math.round((Date.now() - startTime) / 1000));
  const durationStr = formatDuration(durationSeconds);
  const endTimeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // Extract transcripts or remarks from logs
  const transcriptLines: string[] = [];
  for (const line of logs) {
    if (line.includes("[VapiBridge] Voice transcribed") || line.includes("[VapiBridge] User voice transcribed") || line.includes("[VapiBridge] Assistant voice transcribed")) {
      transcriptLines.push(line.replace(/^\[.*?\]\s*/, ""));
    }
  }

  const summaryText = transcriptLines.length > 0
    ? `Meeting session (${meetingId}) completed. Transcribed ${transcriptLines.length} speech segments. Session ran for ${durationStr}.`
    : `Meeting session on Google Meet (${meetingId}) completed successfully after ${durationStr}. Audio and meeting state were logged.`;

  const attendees = [
    {
      id: `att-host-${startTime}`,
      name: currentUserName,
      email: currentUserEmail,
      role: "Host" as const,
      avatarColor: "#6366f1",
      joinedAt: new Date(startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      leftAt: endTimeStr,
      speakingTimePct: 45,
      status: "Present" as const,
    },
    {
      id: `att-bot-${startTime}`,
      name: "MeetMinutes AI Assistant",
      email: "agent@meetminutes.ai",
      role: "Speaker" as const,
      avatarColor: "#10b981",
      joinedAt: new Date(startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      leftAt: endTimeStr,
      speakingTimePct: 35,
      status: "Present" as const,
    },
  ];

  const minutes = {
    summary: summaryText,
    keyDecisions: [
      `Completed live session for meeting room ${meetingId}.`,
      `Bot session exited with status code ${exitCode ?? 0}.`,
      "Audio feed processed and archived in database.",
    ],
    actionItems: [
      {
        id: `act-1-${Date.now()}`,
        task: `Review compiled meeting notes for ${meetingId}`,
        assignee: currentUserName,
        dueDate: new Date(Date.now() + 86400000 * 2).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        completed: false,
      },
    ],
    discussionTopics: [
      {
        time: `00:00 - ${durationStr}`,
        topic: `Google Meet Session (${meetingId})`,
        notes: transcriptLines.length > 0
          ? transcriptLines.slice(-5).join(" | ")
          : "Session audio routing and agent presence active.",
      },
    ],
  };

  try {
    const updateData: Record<string, any> = {
      meetingId,
      title: `Google Meet Session (${meetingId})`,
      url: meetingUrl,
      status: "completed",
      duration: durationStr,
      durationSeconds,
      attendees,
      minutes,
      rawLogs: logs.slice(-300),
    };

    if (currentUserId) {
      updateData.user = currentUserId;
    }

    await Meeting.findOneAndUpdate(
      { meetingId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    broadcast(`[dashboard] 💾 Meeting ${meetingId} successfully recorded in MongoDB Atlas!`);
    console.log(`✅ [MongoDB] Meeting ${meetingId} saved to database.`);
  } catch (err: any) {
    console.error(`❌ [MongoDB] Error saving meeting ${meetingId}:`, err);
    broadcast(`[dashboard] Error saving meeting to database: ${err.message}`);
  } finally {
    // Reset session variables
    currentMeetingId = null;
    currentMeetingUrl = null;
    currentMeetingStartTime = null;
    currentUserId = null;
  }
}

/* ── POST /api/join ──────────────────────────────────────── */
router.post("/join", optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { url } = req.body as { url?: string };

  if (!url) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  const meetRe = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
  if (!meetRe.test(url)) {
    res.status(400).json({ error: "Invalid Google Meet URL" });
    return;
  }

  if (activeProcess) {
    res.status(409).json({ error: "A meeting session is already running" });
    return;
  }

  const meetingId = extractMeetingId(url);
  const userIdentifier = req.user ? `${req.user.name} (${req.user.email})` : "Anonymous user";

  currentMeetingId = meetingId;
  currentMeetingUrl = url;
  currentMeetingStartTime = Date.now();
  currentUserId = req.user?._id || null;
  currentUserName = req.user?.name || "Meeting Host";
  currentUserEmail = req.user?.email || "host@meetminutes.ai";

  status = "joining";
  logs = [];
  broadcast(`[dashboard] Starting bot for ${url} by ${userIdentifier}`);

  // Create or register meeting in-progress in MongoDB immediately
  try {
    const meetingPayload: Record<string, any> = {
      meetingId,
      title: `Google Meet Session (${meetingId})`,
      url,
      status: "in-progress",
      timestamp: currentMeetingStartTime,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      attendees: [
        {
          id: `att-host-${currentMeetingStartTime}`,
          name: currentUserName,
          email: currentUserEmail,
          role: "Host",
          avatarColor: "#6366f1",
          joinedAt: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          leftAt: "",
          speakingTimePct: 50,
          status: "Present",
        },
      ],
      minutes: {
        summary: `Live meeting session on Google Meet (${meetingId}) in progress...`,
        keyDecisions: [],
        actionItems: [],
        discussionTopics: [],
      },
      rawLogs: [],
    };

    if (currentUserId) {
      meetingPayload.user = currentUserId;
    }

    await Meeting.findOneAndUpdate(
      { meetingId },
      { $set: meetingPayload },
      { upsert: true, new: true }
    );
    console.log(`[MongoDB] Initialized in-progress meeting ${meetingId}`);
  } catch (err: any) {
    console.warn(`[MongoDB] Could not pre-save meeting ${meetingId}:`, err.message);
  }

  const vmBin = path.join(VM_DIR, "node_modules", ".bin");
  const child = spawn("npx", ["tsx", "src/join-meeting.ts", "--url", url], {
    cwd: VM_DIR,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${vmBin};${process.env.PATH ?? ""}`,
    },
  });

  activeProcess = child;

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      broadcast(text);
      if (text.includes("In meeting")) status = "running";
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) broadcast(`[stderr] ${text}`);
  });

  child.on("close", async (code) => {
    broadcast(`[dashboard] Process exited with code ${code}`);
    activeProcess = null;
    status = "idle";
    await saveCompletedMeetingToDB(code);
  });

  child.on("error", async (err) => {
    broadcast(`[dashboard] Process error: ${err.message}`);
    activeProcess = null;
    status = "idle";
    await saveCompletedMeetingToDB(1);
  });

  res.json({ ok: true, message: "Joining meeting...", meetingId });
});

/* ── POST /api/leave ─────────────────────────────────────── */
router.post("/leave", async (_req, res: Response): Promise<void> => {
  if (!activeProcess) {
    // If there is an active tracked session without activeProcess, finalize it
    if (currentMeetingId) {
      await saveCompletedMeetingToDB(0);
      status = "idle";
      res.json({ ok: true });
      return;
    }
    res.status(404).json({ error: "No active session" });
    return;
  }

  broadcast("[dashboard] Leaving meeting...");
  activeProcess.kill("SIGTERM");

  // Force-kill after 5 seconds if not closed
  const timer = setTimeout(async () => {
    if (activeProcess) {
      activeProcess.kill("SIGKILL");
      activeProcess = null;
      status = "idle";
      await saveCompletedMeetingToDB(0);
    }
  }, 5000);

  activeProcess.on("close", () => clearTimeout(timer));

  res.json({ ok: true });
});

/* ── GET /api/status ─────────────────────────────────────── */
router.get("/status", (_req, res: Response): void => {
  res.json({
    status,
    activeMeetingId: currentMeetingId,
    activeMeetingUrl: currentMeetingUrl,
    activeStartTime: currentMeetingStartTime,
  });
});

/* ── GET /api/logs (SSE) ─────────────────────────────────── */
router.get("/logs", (_req, res: Response): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send existing logs
  for (const line of logs) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  sseClients.add(res);
  _req.on("close", () => sseClients.delete(res));
});

export default router;
