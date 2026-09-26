import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { IMeetingMinutes, IActionItem, IDiscussionTopic } from "../models/Meeting.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export interface SummarizeMeetingOptions {
  meetingId: string;
  meetingTitle?: string;
  duration?: string;
  attendeeNames?: string[];
  fallbackTranscripts?: string[];
}

/**
 * Calls Groq LLM (llama-3.3-70b-versatile) with JSON mode to generate structured meeting minutes.
 */
export async function generateMeetingSummary(
  rawTranscript: string,
  options: SummarizeMeetingOptions
): Promise<IMeetingMinutes> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const candidateModels = Array.from(
    new Set(
      [process.env.GROQ_MODEL?.trim(), "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "groq/compound-mini"].filter(
        Boolean
      ) as string[]
    )
  );
  const { meetingId, meetingTitle = `Google Meet (${meetingId})`, duration = "N/A", attendeeNames = [] } = options;

  const transcript = rawTranscript.trim() || (options.fallbackTranscripts || []).join("\n").trim();

  // If transcript is virtually empty
  if (!transcript || transcript.length < 15) {
    console.log("[GroqService] Transcript is empty or very short. Creating default summary.");
    return createEmptyMeetingMinutes(meetingId, duration);
  }

  // If GROQ_API_KEY is not configured, warn and return clean fallback
  if (!apiKey) {
    console.warn(
      "[GroqService] Notice: GROQ_API_KEY is not configured in backend/.env. Returning structured summary from transcript."
    );
    return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
  }

  const systemPrompt = `You are an elite executive AI meeting scribe and minutes generator named MeetMinutes.
Your job is to read raw transcript data from a live meeting and produce structured, professional meeting minutes.

You MUST reply ONLY with a valid JSON object matching the following structure:
{
  "summary": "A concise executive paragraph (3-5 sentences) summarizing the main topics, outcomes, and state of the meeting.",
  "keyDecisions": [
    "Clear decision item 1",
    "Clear decision item 2"
  ],
  "actionItems": [
    {
      "task": "Specific actionable task description",
      "assignee": "Name of responsible person or 'Unassigned'",
      "dueDate": "Inferred due date (e.g., 'Next Friday', 'By end of week') or 'TBD'"
    }
  ],
  "discussionTopics": [
    {
      "time": "00:00 - ${duration}",
      "topic": "Concise topic title",
      "notes": "Key points and perspectives discussed regarding this topic"
    }
  ]
}

Guidelines:
- Only extract real decisions and action items mentioned or strongly implied by the transcript.
- If no clear action items were decided, leave actionItems as an empty array or suggest a logical follow-up (e.g., "Review meeting notes").
- Return strictly valid JSON. Do not include markdown fences, backticks, or preamble outside the JSON.`;

  const userPrompt = `Meeting Title: ${meetingTitle}
Meeting ID: ${meetingId}
Duration: ${duration}
Known Participants: ${attendeeNames.join(", ") || "Meeting Participants"}

Here is the meeting transcript:
----------------------------------------
${transcript}
----------------------------------------

Generate the structured JSON minutes now.`;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      console.log(`[GroqService] Requesting AI meeting summary from Groq (${model})...`);
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 950,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.warn(`[GroqService] Groq API returned HTTP ${res.status} for ${model}: ${errorText}`);
        // If model not found or unavailable, try next candidate
        if ((res.status === 404 || errorText.includes("model_not_found")) && i < candidateModels.length - 1) {
          console.log(`[GroqService] Attempting next candidate model: ${candidateModels[i + 1]}...`);
          continue;
        }
        if (i === candidateModels.length - 1) {
          return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
        }
        continue;
      }

      const data = (await res.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.warn("[GroqService] Groq response missing message content");
        continue;
      }

    const parsed = JSON.parse(content);

    // Format action items to ensure all required fields and IDs exist
    const actionItems: IActionItem[] = (Array.isArray(parsed.actionItems) ? parsed.actionItems : []).map(
      (item: any, idx: number) => ({
        id: `act-${Date.now()}-${idx + 1}`,
        task: String(item.task || item.title || "Follow-up on meeting notes"),
        assignee: String(item.assignee || (attendeeNames[0] ?? "Unassigned")),
        dueDate: String(item.dueDate || "TBD"),
        completed: false,
      })
    );

    const discussionTopics: IDiscussionTopic[] = (
      Array.isArray(parsed.discussionTopics) ? parsed.discussionTopics : []
    ).map((topic: any) => ({
      time: String(topic.time || `00:00 - ${duration}`),
      topic: String(topic.topic || "General Discussion"),
      notes: String(topic.notes || ""),
    }));

    const keyDecisions: string[] = Array.isArray(parsed.keyDecisions)
      ? parsed.keyDecisions.map((d: any) => String(d))
      : [];

    const summary: string =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary
        : `Meeting session for ${meetingId} completed in ${duration}.`;

    console.log(
      `[GroqService] SUCCESS: Generated AI summary with ${actionItems.length} action items, ${keyDecisions.length} key decisions.`
    );

      return {
        summary,
        keyDecisions,
        actionItems,
        discussionTopics,
      };
    } catch (err: any) {
      console.warn(`[GroqService] Attempt failed with model ${model}:`, err?.message || err);
      if (i === candidateModels.length - 1) {
        return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
      }
    }
  }

  return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
}

function createEmptyMeetingMinutes(meetingId: string, duration: string): IMeetingMinutes {
  return {
    summary: `Google Meet session (${meetingId}) completed after ${duration}. Minimal or no voice dialogue was recorded during this session.`,
    keyDecisions: [`Session for room ${meetingId} concluded.`],
    actionItems: [
      {
        id: `act-1-${Date.now()}`,
        task: `Review recording and follow up with attendees for ${meetingId}`,
        assignee: "Host",
        dueDate: new Date(Date.now() + 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        completed: false,
      },
    ],
    discussionTopics: [
      {
        time: `00:00 - ${duration}`,
        topic: `Session Overview (${meetingId})`,
        notes: "No spoken transcripts captured during this call window.",
      },
    ],
  };
}

function createFallbackMeetingMinutes(
  meetingId: string,
  duration: string,
  transcript: string,
  attendeeNames: string[]
): IMeetingMinutes {
  const preview = transcript.length > 250 ? `${transcript.slice(0, 247)}...` : transcript;
  return {
    summary: `Live meeting session for room ${meetingId} ran for ${duration}. Key discussion topics and speech segments were recorded.`,
    keyDecisions: [
      `Concluded meeting session ${meetingId}.`,
      "Archived conversation audio and transcripts in MongoDB database.",
    ],
    actionItems: [
      {
        id: `act-1-${Date.now()}`,
        task: `Review conversation record for meeting ${meetingId}`,
        assignee: attendeeNames[0] || "Host",
        dueDate: new Date(Date.now() + 86400000 * 2).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        completed: false,
      },
    ],
    discussionTopics: [
      {
        time: `00:00 - ${duration}`,
        topic: `Google Meet Session (${meetingId})`,
        notes: preview || "Speech activity was captured during the meeting.",
      },
    ],
  };
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperTranscriptionResult {
  text: string;
  segments: WhisperSegment[];
}

function getFfmpegPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "..", "virtual_machine", "node_modules", "ffmpeg-static"),
    path.resolve(process.cwd(), "node_modules", "ffmpeg-static"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(c, "package.json"), "utf8"));
        const binRel = pkgJson.bin?.ffmpeg || "ffmpeg.exe";
        const candidate = path.join(c, binRel);
        if (fs.existsSync(candidate)) return candidate;
      } catch {}
    }
  }
  return null;
}

/**
 * Transcribes an audio or video file (raw PCM s16le, webm, wav) using Groq Whisper API (whisper-large-v3).
 */
export async function transcribeAudioWithGroqWhisper(
  audioInputPath: string
): Promise<WhisperTranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[GroqWhisper] Notice: GROQ_API_KEY is not configured in backend/.env.");
    return { text: "", segments: [] };
  }

  if (!fs.existsSync(audioInputPath)) {
    console.warn(`[GroqWhisper] Audio file not found at: ${audioInputPath}`);
    return { text: "", segments: [] };
  }

  const stat = fs.statSync(audioInputPath);
  if (stat.size < 1000) {
    console.log(`[GroqWhisper] Audio file too small (${stat.size} bytes). Skipping.`);
    return { text: "", segments: [] };
  }

  const ffmpegExe = getFfmpegPath();
  let wavPath = audioInputPath;
  let isTempWav = false;

  // If input is .raw (16kHz s16le mono) or .webm, extract/convert to 16kHz mono WAV for Whisper
  if (audioInputPath.endsWith(".raw") || audioInputPath.endsWith(".webm")) {
    if (!ffmpegExe) {
      console.warn("[GroqWhisper] FFmpeg executable not found to prepare audio for Whisper.");
      return { text: "", segments: [] };
    }

    wavPath = path.join(
      path.dirname(audioInputPath),
      `whisper-temp-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`
    );
    isTempWav = true;

    const ffmpegArgs = audioInputPath.endsWith(".raw")
      ? ["-y", "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", audioInputPath, "-ar", "16000", "-ac", "1", wavPath]
      : ["-y", "-i", audioInputPath, "-vn", "-ar", "16000", "-ac", "1", wavPath];

    const convertRes = spawnSync(ffmpegExe, ffmpegArgs, { stdio: "pipe" });
    if (convertRes.status !== 0 || !fs.existsSync(wavPath)) {
      console.warn("[GroqWhisper] FFmpeg audio extraction failed:", convertRes.stderr?.toString().slice(-200));
      return { text: "", segments: [] };
    }
  }

  try {
    const fileData = fs.readFileSync(wavPath);
    if (fileData.length < 1000) {
      return { text: "", segments: [] };
    }

    const formData = new FormData();
    formData.append("file", new Blob([fileData], { type: "audio/wav" }), "audio.wav");
    formData.append("model", "whisper-large-v3");
    formData.append("response_format", "verbose_json");
    formData.append("language", "en");
    formData.append("temperature", "0");
    formData.append("prompt", "Discussion in a Google Meet call.");

    console.log(`[GroqWhisper] Transcribing ${Math.round(fileData.length / 1024)} KB audio with Groq Whisper...`);
    const res = await fetch(GROQ_AUDIO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[GroqWhisper] Groq Whisper API HTTP ${res.status}: ${errText}`);
      return { text: "", segments: [] };
    }

    const json = (await res.json()) as any;
    const cleanSegments: WhisperSegment[] = [];

    for (const s of (json.segments || [])) {
      const t = (s.text || "").trim();
      if (t && t !== "." && t !== "..." && (s.no_speech_prob ?? 0) < 0.6) {
        cleanSegments.push({
          start: s.start ?? 0,
          end: s.end ?? 0,
          text: t,
        });
      }
    }

    const fullCleanText = cleanSegments.map((s) => s.text).join(" ").trim() || (json.text || "").trim();
    console.log(`[GroqWhisper] ✅ Transcription complete: ${cleanSegments.length} segments, ${fullCleanText.length} chars.`);
    return {
      text: fullCleanText,
      segments: cleanSegments,
    };
  } catch (err: any) {
    console.error("[GroqWhisper] Error during Whisper transcription:", err.message);
    return { text: "", segments: [] };
  } finally {
    if (isTempWav && fs.existsSync(wavPath)) {
      try { fs.unlinkSync(wavPath); } catch {}
    }
  }
}

