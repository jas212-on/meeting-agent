import { Meeting, IMeeting } from "../models/Meeting.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CitedMeeting {
  id: string;
  title: string;
  date: string;
  duration?: string;
}

export interface AskMeetingsOptions {
  question: string;
  userId?: string;
  meetingId?: string;
  history?: ChatMessage[];
}

export interface AskMeetingsResult {
  answer: string;
  citedMeetings: CitedMeeting[];
}

/**
 * Answers questions about past meetings using Groq LLM and MongoDB meeting records.
 */
export async function askMeetings(options: AskMeetingsOptions): Promise<AskMeetingsResult> {
  const { question, userId, meetingId, history = [] } = options;
  const apiKey = process.env.GROQ_API_KEY?.trim();

  // 1. Fetch relevant meetings from MongoDB
  let meetings: IMeeting[] = [];

  try {
    if (meetingId) {
      const single = await Meeting.findOne({
        $or: [{ meetingId }, { _id: meetingId.match(/^[0-9a-fA-F]{24}$/) ? meetingId : null }],
      }).lean();
      if (single) {
        meetings = [single as unknown as IMeeting];
      }
    } else {
      const query: Record<string, any> = {};
      if (userId) {
        query.user = userId;
      }
      meetings = (await Meeting.find(query)
        .sort({ timestamp: -1 })
        .limit(20)
        .lean()) as unknown as IMeeting[];
    }
  } catch (err: any) {
    console.warn("[RAGService] MongoDB query warning:", err.message);
  }

  // If no meetings found in database
  if (!meetings || meetings.length === 0) {
    return {
      answer:
        "I couldn't find any recorded meetings in your workspace yet. Once you join a Google Meet session with MeetMinutes or import past records, you can ask me to summarize decisions, find action items, or check attendee participation!",
      citedMeetings: [],
    };
  }

  // 2. Build structured context from retrieved meetings
  const contextBlocks = meetings.map((m) => {
    const attendeesList = (m.attendees || [])
      .map((a) => `${a.name}${a.role ? ` (${a.role})` : ""}${a.status ? ` [${a.status}]` : ""}`)
      .join(", ");

    const actionItemsList = (m.minutes?.actionItems || [])
      .map(
        (act) =>
          `- [${act.completed ? "COMPLETED" : "PENDING"}] "${act.task}" -> Assigned to: ${act.assignee || "Unassigned"}${act.dueDate ? `, Due: ${act.dueDate}` : ""}`
      )
      .join("\n");

    const keyDecisionsList = (m.minutes?.keyDecisions || [])
      .map((d) => `- ${d}`)
      .join("\n");

    const topicsList = (m.minutes?.discussionTopics || [])
      .map((t) => `- [${t.time || "N/A"}] ${t.topic}: ${t.notes}`)
      .join("\n");

    return `========================================
MEETING ID: ${m.meetingId}
TITLE: ${m.title}
DATE: ${m.date} | TIME: ${m.time} | DURATION: ${m.duration}
STATUS: ${m.status}
PARTICIPANTS: ${attendeesList || "None recorded"}

EXECUTIVE SUMMARY:
${m.minutes?.summary || "No summary available."}

KEY DECISIONS:
${keyDecisionsList || "No explicit decisions logged."}

ACTION ITEMS:
${actionItemsList || "No action items assigned."}

DISCUSSION TOPICS:
${topicsList || "No breakdown logged."}
========================================`;
  });

  const fullContext = contextBlocks.join("\n\n");

  // 3. Fallback if no GROQ_API_KEY is configured
  if (!apiKey) {
    console.warn("[RAGService] Notice: GROQ_API_KEY is not configured in backend/.env. Generating rule-based response.");
    return generateLocalRuleBasedAnswer(question, meetings);
  }

  // 4. Construct System and User Prompts
  const systemPrompt = `You are MeetMinutes AI, an intelligent executive assistant and meeting knowledge expert.
Your job is to answer the user's questions about their past meetings with high precision, clarity, and professionalism.

CRITICAL INSTRUCTIONS:
1. Ground your answers ONLY in the provided meeting records below. Do not invent details not in the context.
2. Whenever you reference an action item, decision, discussion, or person from a meeting, YOU MUST CITE THE MEETING using the exact tag: [Meeting: <meetingId> | <title>].
   Example: "Alex Morgan was assigned the API refactor [Meeting: abc-defg-hij | Google Meet Session (abc-defg-hij)], due next Friday."
3. Format action items clearly with checkboxes or bullet points, assignees, and deadlines.
4. If the user asks a question that cannot be answered from the provided meetings, clearly state: "Based on your recorded meetings, that information was not discussed or recorded."
5. Use clean markdown formatting (bolding, lists, and tables when comparing multiple items).`;

  const userPrompt = `MEETING RECORDS DATABASE:
${fullContext}

----------------------------------------
USER QUESTION:
"${question}"

Provide a clear, direct, and well-structured answer citing the source meetings:`;

  const candidateModels = Array.from(
    new Set(
      [process.env.GROQ_MODEL?.trim(), "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"].filter(
        Boolean
      ) as string[]
    )
  );

  // Format message history (keep last 6 turns)
  const historyMessages = (history || [])
    .slice(-6)
    .filter((h) => h.role === "user" || h.role === "assistant")
    .map((h) => ({ role: h.role, content: h.content }));

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      console.log(`[RAGService] Querying Groq (${model}) for Ask-Meetings...`);
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
            ...historyMessages,
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.warn(`[RAGService] Groq returned HTTP ${res.status} for ${model}: ${errorText}`);
        if (i < candidateModels.length - 1) continue;
        return generateLocalRuleBasedAnswer(question, meetings);
      }

      const data = (await res.json()) as any;
      const answer = data?.choices?.[0]?.message?.content?.trim();

      if (!answer) {
        if (i < candidateModels.length - 1) continue;
        return generateLocalRuleBasedAnswer(question, meetings);
      }

      // Extract cited meetings from the answer or match meetings present in the answer
      const citedMeetings: CitedMeeting[] = [];
      const citedMap = new Set<string>();

      // Match [Meeting: id | title]
      const citationRegex = /\[Meeting:\s*([a-zA-Z0-9_-]+)\s*\|?\s*([^\]]*)\]/gi;
      let match;
      while ((match = citationRegex.exec(answer)) !== null) {
        const matchedId = match[1].trim();
        if (!citedMap.has(matchedId)) {
          citedMap.add(matchedId);
          const found = meetings.find((m) => m.meetingId === matchedId);
          citedMeetings.push({
            id: matchedId,
            title: found?.title || match[2].trim() || `Meeting ${matchedId}`,
            date: found?.date || "",
            duration: found?.duration || "",
          });
        }
      }

      // Also check if any meeting ID was explicitly mentioned
      for (const m of meetings) {
        if (!citedMap.has(m.meetingId) && answer.includes(m.meetingId)) {
          citedMap.add(m.meetingId);
          citedMeetings.push({
            id: m.meetingId,
            title: m.title,
            date: m.date,
            duration: m.duration,
          });
        }
      }

      // If no specific citations matched but we answered from 1 or 2 meetings, provide them
      if (citedMeetings.length === 0 && meetings.length <= 2) {
        for (const m of meetings) {
          citedMeetings.push({
            id: m.meetingId,
            title: m.title,
            date: m.date,
            duration: m.duration,
          });
        }
      }

      return { answer, citedMeetings };
    } catch (err: any) {
      console.warn(`[RAGService] Error calling Groq with ${model}:`, err.message);
      if (i === candidateModels.length - 1) {
        return generateLocalRuleBasedAnswer(question, meetings);
      }
    }
  }

  return generateLocalRuleBasedAnswer(question, meetings);
}

/**
 * Intelligent rule-based answering fallback when Groq is unavailable or offline.
 */
function generateLocalRuleBasedAnswer(question: string, meetings: IMeeting[]): AskMeetingsResult {
  const qLower = question.toLowerCase();
  const citedMeetings: CitedMeeting[] = [];

  // Check for action items query
  if (qLower.includes("action") || qLower.includes("task") || qLower.includes("todo") || qLower.includes("assigned")) {
    const allActions: Array<{ task: string; assignee: string; dueDate: string; meeting: IMeeting }> = [];
    for (const m of meetings) {
      for (const act of m.minutes?.actionItems || []) {
        allActions.push({
          task: act.task,
          assignee: act.assignee || "Unassigned",
          dueDate: act.dueDate || "TBD",
          meeting: m,
        });
      }
    }

    if (allActions.length === 0) {
      return {
        answer: "No specific action items were found across your recorded meetings.",
        citedMeetings: [],
      };
    }

    const lines = allActions.map((a) => {
      citedMeetings.push({ id: a.meeting.meetingId, title: a.meeting.title, date: a.meeting.date });
      return `- **${a.task}**\n  - Assignee: **${a.assignee}** | Due: ${a.dueDate} [Meeting: ${a.meeting.meetingId} | ${a.meeting.title}]`;
    });

    return {
      answer: `Here are the action items found in your meeting history:\n\n${lines.join("\n")}`,
      citedMeetings: Array.from(new Map(citedMeetings.map((c) => [c.id, c])).values()),
    };
  }

  // Check for decisions query
  if (qLower.includes("decision") || qLower.includes("decide") || qLower.includes("agreed")) {
    const allDecisions: Array<{ decision: string; meeting: IMeeting }> = [];
    for (const m of meetings) {
      for (const dec of m.minutes?.keyDecisions || []) {
        allDecisions.push({ decision: dec, meeting: m });
      }
    }

    if (allDecisions.length === 0) {
      return {
        answer: "No explicit key decisions were recorded in your meetings.",
        citedMeetings: [],
      };
    }

    const lines = allDecisions.map((d) => {
      citedMeetings.push({ id: d.meeting.meetingId, title: d.meeting.title, date: d.meeting.date });
      return `- ${d.decision} [Meeting: ${d.meeting.meetingId} | ${d.meeting.title}]`;
    });

    return {
      answer: `Here are key decisions recorded across your meetings:\n\n${lines.join("\n")}`,
      citedMeetings: Array.from(new Map(citedMeetings.map((c) => [c.id, c])).values()),
    };
  }

  // Default summary of latest meeting
  const latest = meetings[0];
  citedMeetings.push({ id: latest.meetingId, title: latest.title, date: latest.date });

  return {
    answer: `Here is a summary from your most recent meeting **${latest.title}** (${latest.date}):\n\n${latest.minutes?.summary || "No summary recorded."}\n\n*You can ask specific questions like "What are my action items?" or "What decisions were made?"*`,
    citedMeetings,
  };
}
