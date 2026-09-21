import path from "node:path";
import fs from "node:fs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Automatically load local .env if present and not already loaded
const envPath = path.resolve(".env");
if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === "function") {
  try {
    (process as any).loadEnvFile(envPath);
  } catch {
    /* ignore */
  }
}

export interface ChatResponderOptions {
  sender: string;
  question: string;
  transcriptHistory?: string;
  apiKey?: string;
  model?: string;
}

export async function generateChatReply(options: ChatResponderOptions): Promise<string> {
  const {
    sender,
    question,
    transcriptHistory = "",
    apiKey = process.env.GROQ_API_KEY?.trim(),
    model = process.env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b",
  } = options;

  const cleanedQuestion = question.replace(/@?meetminutes/gi, "").trim();

  // If no Groq API key is configured, provide an intelligent fallback
  if (!apiKey) {
    console.warn("[ChatResponder] GROQ_API_KEY not configured. Generating rule-based fallback response.");
    if (transcriptHistory && transcriptHistory.length > 20) {
      const recentLines = transcriptHistory.trim().split("\n").slice(-3).join(" | ");
      return `@${sender} I'm actively taking minutes! Recent discussion: "${recentLines.slice(0, 150)}..."`;
    }
    return `@${sender} I am active and taking minutes for this meeting! How can I help you?`;
  }

  const systemPrompt = `You are MeetMinutes, an intelligent, helpful in-meeting AI scribe and assistant inside a live Google Meet call.
A meeting participant has mentioned you in the Google Meet in-call chat.
Answer their query directly, helpfully, and concisely based on the recent meeting conversation.

Rules:
1. Keep your reply concise: 1 to 3 sentences maximum, easy to read in a live chat box.
2. Directly answer their question or explain what was just discussed if they ask "can you explain this" or similar.
3. If they ask a general question not covered by the transcript, answer knowledgeably and briefly.
4. Do NOT use markdown bold headers, blockquotes, or bullet lists—plain conversational text works best in Google Meet chat.
5. Do NOT include "@${sender}" prefix in your response (the caller will format it).`;

  const contextPrompt = transcriptHistory.trim()
    ? `Recent Spoken Meeting Context:\n---------------------\n${transcriptHistory.slice(-2500)}\n---------------------`
    : `(No audio transcript recorded yet for this session)`;

  const userPrompt = `${contextPrompt}\n\nParticipant "${sender}" asks in chat: "${cleanedQuestion || "Can you explain this?"}"\n\nProvide your concise chat reply now:`;

  const candidateModels = Array.from(
    new Set([model, "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"].filter(Boolean))
  );

  for (const candidateModel of candidateModels) {
    try {
      console.log(`[ChatResponder] Generating response for "${sender}" using Groq (${candidateModel})...`);
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 220,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[ChatResponder] Groq request failed with model ${candidateModel}: ${res.status} ${errText}`);
        continue;
      }

      const data = (await res.json()) as any;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        // Strip any accidental leading "@username:" if model included it
        const cleanContent = content.replace(new RegExp(`^@?${sender}[:\\s]*`, "i"), "").trim();
        const reply = `@${sender} ${cleanContent}`;
        console.log(`[ChatResponder] SUCCESS: Groq generated reply for "${sender}": "${reply}"`);
        return reply;
      }
    } catch (err) {
      console.warn(`[ChatResponder] Error calling Groq with ${candidateModel}:`, err);
    }
  }

  // Fallback if all models fail
  console.warn("[ChatResponder] All Groq models failed or returned empty. Using fallback response.");
  if (transcriptHistory && transcriptHistory.length > 20) {
    const fallback = `@${sender} Based on the live discussion: ${transcriptHistory.slice(-180)}...`;
    console.log(`[ChatResponder] Generated fallback reply: "${fallback}"`);
    return fallback;
  }
  const defaultFallback = `@${sender} I heard your request! I'm actively taking meeting notes and tracking the discussion.`;
  console.log(`[ChatResponder] Generated default fallback reply: "${defaultFallback}"`);
  return defaultFallback;

}
