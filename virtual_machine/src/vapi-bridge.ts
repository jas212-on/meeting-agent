import WebSocket from "ws";

const VAPI_API_BASE = "https://api.vapi.ai";

async function createWebsocketCall(
  apiKey: string,
  assistantId: string,
): Promise<string> {
  const body = {
    assistantId,
    transport: {
      provider: "vapi.websocket",
      audioFormat: {
        format: "pcm_s16le",
        container: "raw",
        sampleRate: 16000,
      },
    },
    assistantOverrides: {
      firstMessageMode: "assistant-waits-for-user",
      silenceTimeoutSeconds: 1200,
    },
  };

  console.log("[VapiBridge] Step: Creating Vapi call session (POST https://api.vapi.ai/call)...");
  const res = await fetch(`${VAPI_API_BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[VapiBridge] FAILED: Vapi call creation failed: HTTP ${res.status} ${errorText}`);
    throw new Error(
      `Vapi call creation failed: HTTP ${res.status} ${errorText}`,
    );
  }

  const data = (await res.json()) as { transport?: { websocketCallUrl?: string } };
  const url = data?.transport?.websocketCallUrl;
  if (!url) {
    console.error("[VapiBridge] FAILED: Vapi response missing transport.websocketCallUrl:", JSON.stringify(data));
    throw new Error("Vapi response missing transport.websocketCallUrl");
  }
  console.log(`[VapiBridge] SUCCESS: Vapi call session created. WebSocket URL obtained.`);
  return url;
}

export class VapiBridge {
  muted = false;
  isSpeaking = false;
  onAssistantAudio?: (pcm: Buffer) => void;

  private ws?: WebSocket;
  private speechTimeout?: NodeJS.Timeout;
  private assistantSpeaking = false;
  private lastVoiceSentLog = 0;
  private sentVoiceBytes = 0;
  private lastVoiceRecvLog = 0;
  private recvVoiceBytes = 0;
  private lastEchoGateLog = 0;

  constructor(
    private readonly apiKey: string,
    private readonly assistantId: string,
    private readonly onAssistantSpeech: (speaking: boolean) => void,
  ) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
    console.log(`[VapiBridge] Assistant mute state set to: ${muted ? "MUTED" : "UNMUTED"}`);
  }

  setPlaybackState(playing: boolean): void {
    if (!playing) {
      if (!this.assistantSpeaking) {
        if (this.speechTimeout) clearTimeout(this.speechTimeout);
        this.setSpeaking(false);
      }
    } else {
      this.setSpeaking(true);
    }
  }

  private setSpeaking(speaking: boolean): void {
    if (this.isSpeaking === speaking) return;
    this.isSpeaking = speaking;
    console.log(`[VapiBridge] Assistant speech state: ${speaking ? "SPEAKING (transmitting voice to Meet)" : "LISTENING (ready for user voice)"}`);
    this.onAssistantSpeech(speaking);
  }

  private handleAssistantAudio(pcm: Buffer): void {
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 2) {
      const val = Math.abs(pcm.readInt16LE(i));
      if (val > peak) peak = val;
    }

    // Drop silent padding frames when assistant is not in active speech
    if (!this.assistantSpeaking && peak < 80) {
      return;
    }

    this.recvVoiceBytes += pcm.length;
    const now = Date.now();
    if (now - this.lastVoiceRecvLog > 2000) {
      console.log(`[VapiBridge] Assistant voice received from Vapi (Total: ${Math.round(this.recvVoiceBytes / 1024)} KB received)`);
      this.lastVoiceRecvLog = now;
    }

    if (!this.muted) {
      this.onAssistantAudio?.(pcm);
    } else {
      console.log("[VapiBridge] Assistant voice suppressed (agent is muted).");
    }

    if (peak >= 80) {
      this.setSpeaking(true);
      if (this.speechTimeout) clearTimeout(this.speechTimeout);
      this.speechTimeout = setTimeout(() => {
        if (!this.assistantSpeaking) {
          this.setSpeaking(false);
        }
      }, 1000);
    }
  }

  async start(): Promise<void> {
    console.log("[VapiBridge] Step: Initializing Vapi connection...");
    const url = await createWebsocketCall(this.apiKey, this.assistantId);
    console.log("[VapiBridge] Step: Connecting to Vapi WebSocket endpoint...");
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    await new Promise<void>((resolve, reject) => {
      this.ws!.once("open", () => {
        console.log("[VapiBridge] SUCCESS: Vapi WebSocket connection established and OPEN.");
        resolve();
      });
      this.ws!.once("error", (err) => {
        console.error("[VapiBridge] FAILED: Vapi WebSocket connection error:", err);
        reject(err);
      });
    });

    this.ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const pcm = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);
        this.handleAssistantAudio(pcm);
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "speech-update") {
        const role = msg.role ?? "unspecified";
        const status = msg.status;
        console.log(`[VapiBridge] Speech update: ${role} ${status}`);
        if (role === "user") {
          if (status === "started") {
            console.log("[VapiBridge] User voice detected (user started speaking)");
          } else if (status === "stopped") {
            console.log("[VapiBridge] User stopped speaking");
          }
        } else if (role === "assistant") {
          if (status === "started") {
            this.assistantSpeaking = true;
            this.setSpeaking(true);
          } else if (status === "stopped") {
            this.assistantSpeaking = false;
            if (this.speechTimeout) clearTimeout(this.speechTimeout);
            this.speechTimeout = setTimeout(() => {
              this.setSpeaking(false);
            }, 600);
          }
        }
      } else if (msg.type === "transcript") {
        const role = msg.role ?? "user";
        const transcript = msg.transcript ?? "";
        const transcriptType = msg.transcriptType || (msg.type === "transcript" ? "final/interim" : "");
        if (role === "user") {
          console.log(`[VapiBridge] User voice transcribed: "${transcript}" [${transcriptType}]`);
        } else if (role === "assistant") {
          console.log(`[VapiBridge] Assistant voice transcribed: "${transcript}"`);
        } else {
          console.log(`[VapiBridge] Voice transcribed [${role}]: "${transcript}"`);
        }
      } else if (msg.type === "conversation-update") {
        if (Array.isArray(msg.conversation)) {
          const last = msg.conversation[msg.conversation.length - 1];
          if (last) {
            console.log(`[VapiBridge] Conversation update: [${last.role}] ${last.content || last.message || ""}`);
          }
        }
      } else if (msg.type === "model-output") {
        console.log("[VapiBridge] Model output / LLM response received:", msg.output || JSON.stringify(msg));
      } else if (msg.type === "error") {
        console.error("[VapiBridge] Vapi error received:", JSON.stringify(msg));
      } else {
        console.log(`[VapiBridge] Event [${msg.type ?? "unknown"}]:`, JSON.stringify(msg));
      }
    });

    this.ws.on("close", (code, reason) => {
      console.log(`[VapiBridge] Vapi WebSocket closed (code: ${code}, reason: ${reason.toString() || "none"})`);
      if (this.speechTimeout) clearTimeout(this.speechTimeout);
      this.ws = undefined;
    });

    this.ws.on("error", (err) => {
      console.error("[VapiBridge] Vapi WebSocket error:", err);
    });
  }

  sendUserAudio(pcm: Buffer): void {
    if (this.isSpeaking) {
      const now = Date.now();
      if (now - this.lastEchoGateLog > 3000) {
        console.log("[VapiBridge] Echo gate: suppressing microphone packet while assistant is speaking...");
        this.lastEchoGateLog = now;
      }
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sentVoiceBytes += pcm.length;
      const now = Date.now();
      if (now - this.lastVoiceSentLog > 2000) {
        console.log(`[VapiBridge] Voice sent to Vapi (Total: ${Math.round(this.sentVoiceBytes / 1024)} KB sent, current chunk: ${pcm.length} bytes)`);
        this.lastVoiceSentLog = now;
      }
      this.ws.send(pcm);
    } else {
      console.warn("[VapiBridge] Cannot send voice to Vapi: WebSocket is not open");
    }
  }

  async stop(): Promise<void> {
    console.log("[VapiBridge] Step: Stopping Vapi connection...");
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    const ws = this.ws;
    this.ws = undefined;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log("[VapiBridge] Vapi connection already closed.");
      return;
    }
    ws.send(JSON.stringify({ type: "hangup" }));
    ws.close();
    console.log("[VapiBridge] Vapi session ended.");
  }
}