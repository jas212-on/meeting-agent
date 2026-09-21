const VAPI_API_BASE = "https://api.vapi.ai";

export interface VapiCallDetails {
  id: string;
  status: string;
  transcript: string;
  messages: Array<{
    role: "user" | "assistant" | "system" | string;
    message: string;
    time?: number;
    secondsFromStart?: number;
  }>;
  summary?: string;
  endedReason?: string;
  duration?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches call details and transcript from Vapi's API for a given callId.
 * Performs quick polling with retries to give Vapi time to finalize the transcript after hangup.
 */
export async function fetchVapiCallTranscript(
  callId: string,
  apiKey?: string,
  maxAttempts = 3,
  delayMs = 1500
): Promise<VapiCallDetails | null> {
  const token = apiKey || process.env.VAPI_PRIVATE_KEY;
  if (!token) {
    console.warn("[VapiService] Missing VAPI_PRIVATE_KEY. Cannot query Vapi API for call:", callId);
    return null;
  }

  console.log(`[VapiService] Querying Vapi API for call ID: ${callId}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[VapiService] Waiting ${delayMs}ms before attempt ${attempt}/${maxAttempts}...`);
        await sleep(delayMs);
      }

      const res = await fetch(`${VAPI_API_BASE}/call/${callId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.warn(`[VapiService] Attempt ${attempt} failed with HTTP ${res.status}: ${errorText}`);
        continue;
      }

      const data = (await res.json()) as any;
      const status = data?.status || "unknown";
      let transcript: string = data?.transcript || "";

      // If transcript string isn't populated yet, attempt to build from messages
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      if (!transcript && messages.length > 0) {
        transcript = messages
          .map((m: any) => {
            const role = m.role === "assistant" ? "MeetMinutes AI" : "Participant";
            const text = m.message || m.content || "";
            return text ? `${role}: ${text}` : "";
          })
          .filter(Boolean)
          .join("\n");
      }

      // If status is ended or transcript is populated, we are done
      if (transcript || status === "ended") {
        console.log(
          `[VapiService] SUCCESS: Retrieved transcript from Vapi API (${transcript.length} characters, status: ${status})`
        );
        return {
          id: callId,
          status,
          transcript,
          messages,
          summary: data?.summary,
          endedReason: data?.endedReason,
          duration: data?.duration,
        };
      }
    } catch (err: any) {
      console.warn(`[VapiService] Attempt ${attempt} error:`, err?.message || err);
    }
  }

  console.warn(`[VapiService] Could not retrieve final transcript from Vapi for call ${callId}`);
  return null;
}
