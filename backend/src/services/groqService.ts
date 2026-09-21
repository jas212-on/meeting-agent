import { IMeetingMinutes, IActionItem, IDiscussionTopic } from "../models/Meeting.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

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
  const model = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
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
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(`[GroqService] Groq API returned HTTP ${res.status}: ${errorText}`);
      return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("[GroqService] Groq response missing message content");
      return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
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
    console.error("[GroqService] Failed to generate summary via Groq:", err?.message || err);
    return createFallbackMeetingMinutes(meetingId, duration, transcript, attendeeNames);
  }
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
