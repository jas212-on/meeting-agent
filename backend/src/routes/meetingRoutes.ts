import { Router, type Response } from "express";
import { spawn, exec, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";
import { Meeting, type ITranscriptEntry } from "../models/Meeting.js";
import { fetchVapiCallTranscript, terminateVapiCall } from "../services/vapiService.js";
import { generateMeetingSummary, transcribeAudioWithGroqWhisper } from "../services/groqService.js";
import { uploadMeetingRecording, isDriveConfigured } from "../services/driveService.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VM_DIR = path.resolve(__dirname, "..", "..", "..", "virtual_machine");

function killBotChrome(): void {
  if (process.platform === "win32") {
    try {
      const scriptPath = path.resolve(VM_DIR, "kill-chrome.js");
      if (fs.existsSync(scriptPath)) {
        spawnSync("cscript", ["//nologo", scriptPath], { stdio: "ignore", timeout: 3000 });
      }
    } catch {}
  }
}

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    exec(`taskkill /pid ${pid} /T /F`, () => {});
    killBotChrome();
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
}

/* ── Session state ───────────────────────────────────────── */
let activeProcess: ChildProcess | null = null;
let status: "idle" | "joining" | "running" = "idle";
let logs: string[] = [];
const sseClients: Set<Response> = new Set();

let currentMeetingId: string | null = null;
let currentMeetingUrl: string | null = null;
let currentMeetingStartTime: number | null = null;
let currentVapiCallId: string | null = null;
let currentUserId: any = null;
let currentUserName = "Meeting Host";
let currentUserEmail = "host@meetminutes.ai";
let recordedAttendees: any[] = [];
let activeMeetingTranscripts: ITranscriptEntry[] = [];

// Screen recording session state
let isScreenRecording = false;
let screenRecordingStartTime: number | null = null;
let savedRecordingPath: string | null = null;
let savedRecordingDuration = 0;

function broadcast(line: string): void {
  logs.push(line);
  if (logs.length > 500) logs = logs.slice(-400);
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }
}

function consolidateTranscripts(entries: ITranscriptEntry[]): ITranscriptEntry[] {
  if (!entries || entries.length === 0) return [];

  const consolidated: ITranscriptEntry[] = [];

  for (const rawEntry of entries) {
    const text = (rawEntry.text || "").trim();
    if (!text) continue;

    if (consolidated.length === 0) {
      consolidated.push({ ...rawEntry, text });
      continue;
    }

    const last = consolidated[consolidated.length - 1];
    const isSameSpeaker =
      last.speaker.toLowerCase().trim() === (rawEntry.speaker || "").toLowerCase().trim();

    if (!isSameSpeaker) {
      consolidated.push({ ...rawEntry, text });
      continue;
    }

    const cleanLast = last.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const cleanCurr = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    // 1. Progressive prefix extension (e.g. "u" -> "uh" -> "uh meet" -> "uh meeting agent")
    if (cleanCurr.startsWith(cleanLast) || text.startsWith(last.text)) {
      last.text = text;
      last.timestamp = rawEntry.timestamp || last.timestamp;
      continue;
    }

    // 2. Subsumed match (shorter or duplicate)
    if (cleanLast.startsWith(cleanCurr) || last.text.startsWith(text) || cleanLast.includes(cleanCurr)) {
      continue;
    }

    // 3. Word token overlap
    const lastWords = last.text.split(/\s+/);
    const currWords = text.split(/\s+/);
    let overlapped = false;
    for (let len = Math.min(5, lastWords.length, currWords.length); len >= 2; len--) {
      const suffix = lastWords.slice(-len).join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const prefix = currWords.slice(0, len).join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, "");
      if (suffix === prefix) {
        last.text = `${lastWords.slice(0, -len).join(" ")} ${text}`.trim();
        last.timestamp = rawEntry.timestamp || last.timestamp;
        overlapped = true;
        break;
      }
    }
    if (overlapped) continue;

    // 4. Consecutive speech from same speaker merged into one turn
    const endsWithPunct = /[.!?]$/.test(last.text.trim());
    const separator = endsWithPunct ? " " : ". ";
    last.text = `${last.text.trim()}${separator}${text.trim()}`;
    last.timestamp = rawEntry.timestamp || last.timestamp;
  }

  return consolidated;
}

function ingestAndBroadcastTranscript(
  speaker: string,
  role: "Host" | "Co-host" | "Speaker" | "Attendee" | "Assistant",
  rawText: string,
  avatarColor: string
): void {
  const speechText = rawText.trim();
  if (!speechText) return;

  const lastEntry = activeMeetingTranscripts.length > 0
    ? activeMeetingTranscripts[activeMeetingTranscripts.length - 1]
    : null;

  const isSameSpeaker = lastEntry && lastEntry.speaker.toLowerCase().trim() === speaker.toLowerCase().trim();

  if (isSameSpeaker && lastEntry) {
    const cleanLast = lastEntry.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const cleanCurr = speechText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    // 1. Progressive prefix extension (e.g. "U" -> "Uh," -> "Uh, Meet")
    if (cleanCurr.startsWith(cleanLast) || speechText.startsWith(lastEntry.text)) {
      lastEntry.text = speechText;
      lastEntry.timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      broadcast(`[LIVE_TRANSCRIPT_UPDATE] ${JSON.stringify(lastEntry)}`);
      return;
    }

    // 2. Subsumed match
    if (cleanLast.startsWith(cleanCurr) || lastEntry.text.startsWith(speechText) || cleanLast.includes(cleanCurr)) {
      return;
    }

    // 3. Consecutive speech from same speaker: Combine into single cohesive turn!
    const endsWithPunct = /[.!?]$/.test(lastEntry.text.trim());
    const separator = endsWithPunct ? " " : ". ";
    lastEntry.text = `${lastEntry.text.trim()}${separator}${speechText.trim()}`;
    lastEntry.timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    broadcast(`[LIVE_TRANSCRIPT_UPDATE] ${JSON.stringify(lastEntry)}`);
    return;
  }

  const newEntry: ITranscriptEntry = {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    speaker,
    role,
    text: speechText,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    avatarColor,
  };

  activeMeetingTranscripts.push(newEntry);
  if (activeMeetingTranscripts.length > 1000) {
    activeMeetingTranscripts = activeMeetingTranscripts.slice(-800);
  }
  broadcast(`[LIVE_TRANSCRIPT] ${JSON.stringify(newEntry)}`);
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

let isSavingMeeting = false;

async function saveCompletedMeetingToDB(exitCode: number | null = 0): Promise<void> {
  if (!currentMeetingId || !currentMeetingUrl || isSavingMeeting) return;
  isSavingMeeting = true;

  const meetingId = currentMeetingId;
  const meetingUrl = currentMeetingUrl;
  const startTime = currentMeetingStartTime || Date.now();
  const durationSeconds = Math.max(8, Math.round((Date.now() - startTime) / 1000));
  const durationStr = formatDuration(durationSeconds);
  const endTimeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // 1. Attempt to fetch clean transcript from Vapi API if call ID is available
  let officialTranscript = "";
  let vapiMessages: any[] = [];
  if (currentVapiCallId) {
    broadcast(`[dashboard] 🛑 Ensuring Vapi call session is terminated (${currentVapiCallId})...`);
    await terminateVapiCall(currentVapiCallId).catch(() => {});

    broadcast(`[dashboard] ⏳ Retrieving final transcript from Vapi API (${currentVapiCallId})...`);
    const vapiDetails = await fetchVapiCallTranscript(currentVapiCallId);
    if (vapiDetails && vapiDetails.transcript) {
      officialTranscript = vapiDetails.transcript;
      vapiMessages = vapiDetails.messages || [];
      broadcast(`[dashboard] ✅ Vapi transcript retrieved (${officialTranscript.length} chars, ${vapiMessages.length} speech segments).`);
    } else {
      broadcast("[dashboard] ⚠️ Vapi transcript not available, checking session logs.");
    }
  }

  // 2. Fallback transcript lines from logs if Vapi API didn't return one
  const fallbackTranscripts: string[] = [];
  for (const line of logs) {
    if (
      (line.includes("[VapiBridge] Voice transcribed") ||
        line.includes("[VapiBridge] User voice transcribed") ||
        line.includes("[VapiBridge] Assistant voice transcribed")) &&
      !line.includes("[partial]")
    ) {
      fallbackTranscripts.push(line.replace(/^\[.*?\]\s*/, ""));
    }
  }

  // 2b. Attempt to load recorded attendees from file if not yet captured from stdout
  if (recordedAttendees.length === 0) {
    try {
      const scratchFile = path.join(VM_DIR, "scratch", `attendance-${meetingId}.json`);
      if (fs.existsSync(scratchFile)) {
        const fileContent = fs.readFileSync(scratchFile, "utf-8");
        recordedAttendees = JSON.parse(fileContent);
        broadcast(`[dashboard] 👥 Attendance loaded from scratch file (${recordedAttendees.length} participants).`);
      }
    } catch (err: any) {
      console.warn("[dashboard] Could not read scratch attendance file:", err.message);
    }
  }

  const attendeeNamesList =
    recordedAttendees.length > 0
      ? recordedAttendees.map((a) => a.name)
      : [currentUserName, "MeetMinutes AI Assistant"];

  // 3. Consolidate live transcripts and apply fallbacks
  let finalTranscripts: ITranscriptEntry[] = consolidateTranscripts(activeMeetingTranscripts);

  // Fallback 3a: Extract from Vapi call messages (explicitly ignoring system prompt)
  if (finalTranscripts.length === 0 && vapiMessages && vapiMessages.length > 0) {
    for (let i = 0; i < vapiMessages.length; i++) {
      const vm = vapiMessages[i];
      const roleStr = (vm.role || "user").toLowerCase();
      if (roleStr === "system") continue;
      const isBot = roleStr.includes("assistant") || roleStr.includes("bot");
      const txt = vm.message || vm.content || vm.text || "";
      if (txt && typeof txt === "string") {
        finalTranscripts.push({
          id: `tr-vapi-${i}-${Date.now()}`,
          speaker: isBot ? "MeetMinutes AI Agent" : (attendeeNamesList[0] || "Participant"),
          role: isBot ? "Assistant" : "Speaker",
          text: txt,
          timestamp: new Date(startTime + i * 15000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          avatarColor: isBot ? "#10b981" : "#2563eb",
        });
      }
    }
  }

  // Fallback 3b: If transcript is still missing/empty, transcribe recorded audio via Groq Whisper!
  if (finalTranscripts.length === 0 || !officialTranscript.trim()) {
    const audioCandidates = [
      path.join(VM_DIR, "recordings", `${meetingId}-audio.raw`),
      savedRecordingPath,
      path.join(VM_DIR, "recordings", `${meetingId}.webm`),
      path.join(process.cwd(), "recordings", `${meetingId}.webm`),
    ].filter(Boolean) as string[];

    for (const audCandidate of audioCandidates) {
      if (fs.existsSync(audCandidate) && fs.statSync(audCandidate).size > 2000) {
        broadcast(`[dashboard] 🎙️ Transcribing meeting audio with Groq Whisper (${path.basename(audCandidate)})...`);
        try {
          const whisperRes = await transcribeAudioWithGroqWhisper(audCandidate);
          if (whisperRes.text && whisperRes.segments.length > 0) {
            broadcast(`[dashboard] ✅ Groq Whisper transcribed ${whisperRes.segments.length} speech segments (${whisperRes.text.length} chars).`);
            if (!officialTranscript.trim()) {
              officialTranscript = whisperRes.text;
            }
            if (finalTranscripts.length === 0) {
              const primarySpeaker = attendeeNamesList[0] || currentUserName || "Participant";
              for (let i = 0; i < whisperRes.segments.length; i++) {
                const seg = whisperRes.segments[i];
                const segTime = new Date(startTime + seg.start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                finalTranscripts.push({
                  id: `tr-whisper-${i}-${Date.now()}`,
                  speaker: primarySpeaker,
                  role: "Speaker",
                  text: seg.text,
                  timestamp: segTime,
                  avatarColor: "#2563eb",
                });
              }
            }
            break;
          }
        } catch (err: any) {
          console.warn("[dashboard] Groq Whisper fallback note:", err.message);
        }
      }
    }
  }

  // 4. Generate structured AI minutes via Groq LLM
  broadcast("[dashboard] 🧠 Generating meeting minutes with Groq AI...");
  const minutes = await generateMeetingSummary(officialTranscript, {
    meetingId,
    meetingTitle: `Google Meet Session (${meetingId})`,
    duration: durationStr,
    attendeeNames: attendeeNamesList,
    fallbackTranscripts: fallbackTranscripts.length > 0 ? fallbackTranscripts : finalTranscripts.map((t) => `${t.speaker}: ${t.text}`),
  });

  // 4. Construct final attendees list with entry, leave, and rejoin intervals
  let attendees: any[] = [];
  if (recordedAttendees.length > 0) {
    attendees = recordedAttendees.map((att: any, idx: number) => {
      const totalSecs =
        att.totalDurationSeconds ||
        (att.intervals || []).reduce(
          (sum: number, int: any) => sum + (int.durationSeconds || 0),
          0
        );
      const pct =
        durationSeconds > 0
          ? Math.min(100, Math.round((totalSecs / durationSeconds) * 100))
          : 50;

      return {
        id: att.id || `att-rec-${idx}-${startTime}`,
        name: att.name,
        email: att.email || `${att.name.toLowerCase().replace(/\s+/g, ".")}@meeting.attendee`,
        role: att.role || (idx === 0 ? "Host" : "Attendee"),
        avatarColor: att.avatarColor || "#6366f1",
        joinedAt:
          att.joinedAt ||
          new Date(startTime).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        leftAt: att.leftAt || endTimeStr,
        speakingTimePct: att.speakingTimePct || Math.max(5, Math.min(60, Math.round(pct * 0.4))),
        status: att.status || "Present",
        rejoinCount: att.rejoinCount || 0,
        totalDurationSeconds: totalSecs,
        intervals: (att.intervals || []).map((interval: any) => ({
          joinedAt: interval.joinedAt,
          leftAt: interval.leftAt,
          joinTimestamp: interval.joinTimestamp,
          leaveTimestamp: interval.leaveTimestamp,
          durationSeconds: interval.durationSeconds,
        })),
      };
    });
  } else {
    // Fallback if no attendees were captured
    attendees = [
      {
        id: `att-host-${startTime}`,
        name: currentUserName,
        email: currentUserEmail,
        role: "Host" as const,
        avatarColor: "#6366f1",
        joinedAt: new Date(startTime).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        leftAt: endTimeStr,
        speakingTimePct: 50,
        status: "Present" as const,
        rejoinCount: 0,
        totalDurationSeconds: durationSeconds,
        intervals: [
          {
            joinedAt: new Date(startTime).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            leftAt: endTimeStr,
            durationSeconds,
          },
        ],
      },
      {
        id: `att-bot-${startTime}`,
        name: "MeetMinutes AI Assistant",
        email: "agent@meetminutes.ai",
        role: "Speaker" as const,
        avatarColor: "#10b981",
        joinedAt: new Date(startTime).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        leftAt: endTimeStr,
        speakingTimePct: 40,
        status: "Present" as const,
        rejoinCount: 0,
        totalDurationSeconds: durationSeconds,
        intervals: [
          {
            joinedAt: new Date(startTime).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            leftAt: endTimeStr,
            durationSeconds,
          },
        ],
      },
    ];
  }

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
      transcript: finalTranscripts,
      rawLogs: logs.slice(-300),
    };

    if (currentUserId) {
      updateData.user = currentUserId;
    }

    // Attach screen recording details if video was captured
    const possibleRecordings = [
      savedRecordingPath,
      path.join(VM_DIR, "recordings", `${meetingId}.webm`),
      path.join(process.cwd(), "recordings", `${meetingId}.webm`),
    ].filter(Boolean) as string[];

    let finalRecordingFile: string | null = null;
    for (const p of possibleRecordings) {
      if (fs.existsSync(p)) {
        finalRecordingFile = p;
        break;
      }
    }

    // Fallback: If not found, check VM recordings directory for recent webm files
    if (!finalRecordingFile) {
      const vmRecordingsDir = path.join(VM_DIR, "recordings");
      if (fs.existsSync(vmRecordingsDir)) {
        try {
          const files = fs.readdirSync(vmRecordingsDir)
            .filter((f) => f.endsWith(".webm"))
            .map((f) => {
              const fullPath = path.join(vmRecordingsDir, f);
              const stat = fs.statSync(fullPath);
              return { fullPath, mtimeMs: stat.mtimeMs, size: stat.size };
            })
            .filter((f) => f.size > 10000 && Date.now() - f.mtimeMs < 15 * 60 * 1000)
            .sort((a, b) => b.mtimeMs - a.mtimeMs);

          if (files.length > 0) {
            finalRecordingFile = files[0].fullPath;
            console.log(`[meetingRoutes] Discovered recent recording file: ${finalRecordingFile}`);
          }
        } catch (scanErr: any) {
          console.warn("[meetingRoutes] Note on fallback recording scan:", scanErr.message);
        }
      }
    }

    if (finalRecordingFile) {
      const stats = fs.statSync(finalRecordingFile);
      const recordingFileName = `${meetingId}.webm`;
      const backendRecordingsFolder = path.join(process.cwd(), "recordings");
      if (!fs.existsSync(backendRecordingsFolder)) {
        fs.mkdirSync(backendRecordingsFolder, { recursive: true });
      }
      const backendTarget = path.join(backendRecordingsFolder, recordingFileName);

      // If the discovered file is a raw page@ video and a matching raw audio file exists, mux them!
      const pcmAudioPath = path.join(VM_DIR, "recordings", `${meetingId}-audio.raw`);
      const isRawSilentVideo = path.basename(finalRecordingFile).startsWith("page@");
      let muxedWithAudio = false;

      if (isRawSilentVideo && fs.existsSync(pcmAudioPath) && fs.statSync(pcmAudioPath).size > 1024) {
        try {
          const ffmpegStaticPkg = path.join(VM_DIR, "node_modules", "ffmpeg-static");
          let ffmpegExe: string | null = null;
          if (fs.existsSync(ffmpegStaticPkg)) {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(ffmpegStaticPkg, "package.json"), "utf8"));
            const binRel = pkgJson.bin?.ffmpeg || "ffmpeg.exe";
            const candidate = path.join(ffmpegStaticPkg, binRel);
            if (fs.existsSync(candidate)) ffmpegExe = candidate;
          }

          if (ffmpegExe) {
            console.log(`[meetingRoutes] 🎙️ Merging unmerged raw video with participant audio for ${meetingId}...`);
            const { spawnSync } = await import("node:child_process");
            const res = spawnSync(ffmpegExe, [
              "-y",
              "-i", finalRecordingFile,
              "-f", "s16le",
              "-ar", "16000",
              "-ac", "1",
              "-i", pcmAudioPath,
              "-c:v", "copy",
              "-c:a", "libopus",
              "-af", "aresample=async=1000",
              "-shortest",
              backendTarget,
            ], { stdio: "pipe" });

            if (res.status === 0 && fs.existsSync(backendTarget) && fs.statSync(backendTarget).size > 1000) {
              muxedWithAudio = true;
              console.log(`[meetingRoutes] ✅ Successfully muxed raw video and audio into ${backendTarget}`);
            } else {
              console.warn("[meetingRoutes] Fallback FFmpeg mux note:", res.stderr?.toString().slice(-200));
            }
          }
        } catch (muxErr: any) {
          console.warn("[meetingRoutes] Note on fallback audio mux:", muxErr.message);
        }
      }

      if (!muxedWithAudio && path.resolve(finalRecordingFile) !== path.resolve(backendTarget)) {
        try {
          fs.copyFileSync(finalRecordingFile, backendTarget);
        } catch (err: any) {
          console.warn("[meetingRoutes] Note on recording copy:", err.message);
        }
      }

      updateData.recording = {
        status: isDriveConfigured() ? "uploading" : "ready",
        localUrl: `/recordings/${recordingFileName}`,
        fileName: recordingFileName,
        fileSizeBytes: stats.size,
        durationSeconds: savedRecordingDuration || durationSeconds,
      };

      // Asynchronously trigger Google Drive upload if configured
      if (isDriveConfigured()) {
        (async () => {
          try {
            broadcast(`[dashboard] ☁️ Uploading screen recording to Google Drive...`);
            const driveResult = await uploadMeetingRecording(
              backendTarget,
              meetingId,
              `Google Meet Session (${meetingId})`
            );
            if (driveResult && driveResult.driveUrl) {
              await Meeting.findOneAndUpdate(
                { meetingId },
                {
                  $set: {
                    "recording.status": "uploaded",
                    "recording.driveUrl": driveResult.driveUrl,
                    "recording.driveFileId": driveResult.driveFileId,
                    "recording.uploadedAt": new Date().toISOString(),
                  },
                }
              );
              broadcast(`[dashboard] ✅ Recording uploaded to Google Drive: ${driveResult.driveUrl}`);
            }
          } catch (driveErr: any) {
            console.warn("[meetingRoutes] Google Drive upload error:", driveErr.message);
          }
        })();
      }
    }

    await Meeting.findOneAndUpdate(
      { meetingId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    broadcast(`[dashboard] 💾 Meeting ${meetingId} successfully recorded in MongoDB Atlas!`);
    console.log(`✅ [MongoDB] Meeting ${meetingId} saved to database with ${finalTranscripts.length} transcript lines.`);
  } catch (err: any) {
    console.error(`❌ [MongoDB] Error saving meeting ${meetingId}:`, err);
    broadcast(`[dashboard] Error saving meeting to database: ${err.message}`);
  } finally {
    // Reset session variables
    currentMeetingId = null;
    currentMeetingUrl = null;
    currentMeetingStartTime = null;
    currentVapiCallId = null;
    currentUserId = null;
    recordedAttendees = [];
    activeMeetingTranscripts = [];
    logs = [];
    isScreenRecording = false;
    screenRecordingStartTime = null;
    savedRecordingPath = null;
    savedRecordingDuration = 0;
    isSavingMeeting = false;
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
      console.log(text);
      broadcast(text);
      if (text.includes("In meeting")) status = "running";

      // Detect Vapi Call ID emitted by vapi-bridge
      const vapiMatch = text.match(/\[VapiBridge\] Call created with ID:\s*([a-zA-Z0-9_-]+)/);
      if (vapiMatch && vapiMatch[1]) {
        currentVapiCallId = vapiMatch[1];
        broadcast(`[dashboard] 🔗 Vapi Call Session linked: ${currentVapiCallId}`);
      }

      // Detect Attendance summary emitted by attendance-tracker
      const attendanceMatch = text.match(/\[ATTENDANCE_DATA\]\s*(\[[\s\S]*\])/);
      if (attendanceMatch && attendanceMatch[1]) {
        try {
          recordedAttendees = JSON.parse(attendanceMatch[1]);
          broadcast(
            `[dashboard] 👥 Attendance data captured: ${recordedAttendees.length} participants recorded.`
          );
        } catch (err: any) {
          console.warn("[dashboard] Could not parse ATTENDANCE_DATA JSON:", err.message);
        }
      }

      // Detect Screen Recording output emitted by join-meeting
      const recSavedMatch = text.match(/\[ScreenRecorder\] Recording saved:\s*(.+)/);
      if (recSavedMatch && recSavedMatch[1]) {
        savedRecordingPath = recSavedMatch[1].trim();
        broadcast(`[dashboard] 🎥 Screen recording file finalized: ${path.basename(savedRecordingPath)}`);
      }
      const recDurMatch = text.match(/\[ScreenRecorder\] Recording duration:\s*(\d+)s/);
      if (recDurMatch && recDurMatch[1]) {
        savedRecordingDuration = parseInt(recDurMatch[1], 10);
      }

      // Filter out partial/interim transcripts to prevent fragmented word-by-word cards
      const isPartial = text.includes("[partial]") || text.includes("interim");

      // Detect Live Transcript lines emitted during the meeting
      const userSpeechMatch = text.match(/\[VapiBridge\]\s*User voice transcribed(?:\s*\[(final|partial)\])?:\s*"([^"]+)"/i);
      if (userSpeechMatch && userSpeechMatch[2]) {
        const lineIsPartial = isPartial || userSpeechMatch[1] === "partial";
        if (!lineIsPartial) {
          ingestAndBroadcastTranscript(
            currentUserName || "Participant",
            "Speaker",
            userSpeechMatch[2],
            "#2563eb"
          );
        }
      }

      const botSpeechMatch = text.match(/\[VapiBridge\]\s*Assistant voice transcribed(?:\s*\[(final|partial)\])?:\s*"([^"]+)"/i);
      if (botSpeechMatch && botSpeechMatch[2]) {
        const lineIsPartial = isPartial || botSpeechMatch[1] === "partial";
        if (!lineIsPartial) {
          ingestAndBroadcastTranscript(
            "MeetMinutes AI Agent",
            "Assistant",
            botSpeechMatch[2],
            "#10b981"
          );
        }
      }

      const roleSpeechMatch = text.match(/\[VapiBridge\]\s*Voice transcribed\s*\[([^\]]+)\](?:\s*\[(final|partial)\])?:\s*"([^"]+)"/i);
      if (roleSpeechMatch && roleSpeechMatch[1] && roleSpeechMatch[3]) {
        const lineIsPartial = isPartial || roleSpeechMatch[2] === "partial";
        if (!lineIsPartial) {
          const speechRole = roleSpeechMatch[1].toLowerCase();
          const isBot = speechRole.includes("assistant") || speechRole.includes("bot");
          ingestAndBroadcastTranscript(
            isBot ? "MeetMinutes AI Agent" : (currentUserName || "Participant"),
            isBot ? "Assistant" : "Speaker",
            roleSpeechMatch[3],
            isBot ? "#10b981" : "#2563eb"
          );
        }
      }

      const convMatch = text.match(/\[VapiBridge\]\s*Conversation update:\s*\[([^\]]+)\]\s*(.+)/i);
      if (convMatch && convMatch[1] && convMatch[2]) {
        const speechRole = convMatch[1].toLowerCase();
        const isBot = speechRole.includes("assistant") || speechRole.includes("bot");
        const speechText = convMatch[2].trim();
        if (speechText && !speechText.startsWith("{")) {
          ingestAndBroadcastTranscript(
            isBot ? "MeetMinutes AI Agent" : (currentUserName || "Participant"),
            isBot ? "Assistant" : "Speaker",
            speechText,
            isBot ? "#10b981" : "#2563eb"
          );
        }
      }
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      console.error(`[stderr] ${text}`);
      broadcast(`[stderr] ${text}`);
    }
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
  const proc = activeProcess;
  const pid = proc.pid;
  const vapiCallIdToTerminate = currentVapiCallId;

  // Immediately terminate Vapi call via API so Vapi cloud disconnects in <200ms
  if (vapiCallIdToTerminate) {
    broadcast(`[dashboard] 🛑 Disconnecting Vapi AI Assistant (${vapiCallIdToTerminate})...`);
    terminateVapiCall(vapiCallIdToTerminate).catch((err) => {
      console.warn("[meetingRoutes] Error terminating Vapi call:", err);
    });
  }

  // 1. Attempt graceful leave via control server if available
  try {
    await fetch("http://127.0.0.1:4712/leave", {
      method: "POST",
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Fall back to signal/kill if control server is unreachable
  }

  // Ensure bot Chrome window is closed promptly (within 1.5s)
  setTimeout(() => {
    killBotChrome();
  }, 1500);

  // 2. Force-kill entire process tree if still running after 3.5 seconds
  // (allows Playwright to flush video and FFmpeg to mux audio)
  const timer = setTimeout(async () => {
    if (activeProcess && pid) {
      broadcast("[dashboard] Force-terminating session process tree...");
      killProcessTree(pid);
      activeProcess = null;
      status = "idle";
      await saveCompletedMeetingToDB(0);
    }
  }, 3500);

  proc.once("close", () => {
    clearTimeout(timer);
    killBotChrome();
    activeProcess = null;
    status = "idle";
  });

  res.json({ ok: true });
});

/* ── GET /api/status ─────────────────────────────────────── */
router.get("/status", (_req, res: Response): void => {
  res.json({
    status,
    activeMeetingId: currentMeetingId,
    activeMeetingUrl: currentMeetingUrl,
    activeStartTime: currentMeetingStartTime,
    activeVapiCallId: currentVapiCallId,
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

/* ── GET /api/live-transcript ────────────────────────────── */
router.get("/live-transcript", (_req, res: Response): void => {
  res.json({
    inProgress: status === "running" || status === "joining",
    meetingId: currentMeetingId,
    transcript: activeMeetingTranscripts,
  });
});

/* ── GET /api/meetings/:id/transcript ─────────────────────── */
router.get("/meetings/:id/transcript", async (req, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const meeting = await Meeting.findOne({ meetingId: id });
    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    res.json({ transcript: meeting.transcript || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Screen Recording Endpoints ───────────────────────── */
router.post("/recording/start", async (_req, res: Response): Promise<void> => {
  if (status === "idle" || !activeProcess) {
    res.status(400).json({ error: "No active meeting session to record" });
    return;
  }
  try {
    const vmRes = await fetch("http://127.0.0.1:4712/record/start", {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
    if (vmRes.ok) {
      isScreenRecording = true;
      screenRecordingStartTime = Date.now();
      broadcast("[dashboard] 🎥 Screen recording started.");
      res.json({ ok: true, isRecording: true, startedAt: screenRecordingStartTime });
      return;
    }
  } catch (err: any) {
    console.warn("[meetingRoutes] Note connecting to VM /record/start:", err.message);
  }
  isScreenRecording = true;
  screenRecordingStartTime = Date.now();
  broadcast("[dashboard] 🎥 Screen recording started.");
  res.json({ ok: true, isRecording: true, startedAt: screenRecordingStartTime });
});

router.post("/recording/stop", async (_req, res: Response): Promise<void> => {
  try {
    const vmRes = await fetch("http://127.0.0.1:4712/record/stop", {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
    if (vmRes.ok) {
      isScreenRecording = false;
      broadcast("[dashboard] ⏹️ Screen recording paused/stopped.");
      res.json({ ok: true, isRecording: false });
      return;
    }
  } catch (err: any) {
    console.warn("[meetingRoutes] Note connecting to VM /record/stop:", err.message);
  }
  isScreenRecording = false;
  broadcast("[dashboard] ⏹️ Screen recording stopped.");
  res.json({ ok: true, isRecording: false });
});

router.get("/recording/status", async (_req, res: Response): Promise<void> => {
  try {
    const vmRes = await fetch("http://127.0.0.1:4712/record/status", {
      signal: AbortSignal.timeout(1000),
    });
    if (vmRes.ok) {
      const data = await vmRes.json();
      res.json(data);
      return;
    }
  } catch {}
  res.json({
    isRecording: isScreenRecording,
    startedAt: screenRecordingStartTime,
    durationSeconds: savedRecordingDuration,
  });
});

export default router;
