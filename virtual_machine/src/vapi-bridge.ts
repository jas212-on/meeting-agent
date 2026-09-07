import WebSocket from "ws";

const VAPI_API_BASE = "https://api.vapi.ai";

interface AssistantConfig {
  assistantId: string;
  firstMessageMode: "assistant-speaks-first";
}

async function createWebsocketCall(
  apiKey: string,
  assistantId: string,
): Promise<string> {
  const body: { transport: object; assistant: AssistantConfig } = {
    transport: {
      provider: "vapi.websocket",
      audioFormat: {
        format: "pcm_s16le",
        container: "raw",
        sampleRate: 16000,
      },
    },
    assistant: {
      assistantId,
      firstMessageMode: "assistant-speaks-first",
    },
  };

  const res = await fetch(`${VAPI_API_BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Vapi call creation failed: HTTP ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { transport?: { websocketCallUrl?: string } };
  const url = data?.transport?.websocketCallUrl;
  if (!url) {
    throw new Error("Vapi response missing transport.websocketCallUrl");
  }
  return url;
}

export class VapiBridge {
  muted = false;
  onAssistantAudio?: (pcm: Buffer) => void;

  private ws?: WebSocket;

  constructor(
    private readonly apiKey: string,
    private readonly assistantId: string,
    private readonly onAssistantSpeech: (speaking: boolean) => void,
  ) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  async start(): Promise<void> {
    const url = await createWebsocketCall(this.apiKey, this.assistantId);
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    await new Promise<void>((resolve, reject) => {
      this.ws!.once("open", () => resolve());
      this.ws!.once("error", (err) => reject(err));
    });

    this.ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const pcm = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);
        if (!this.muted) this.onAssistantAudio?.(pcm);
        return;
      }

      let msg: { type?: string; role?: string; status?: string };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "speech-update" && msg.role === "assistant") {
        this.onAssistantSpeech(msg.status === "started");
      } else if (msg.type === "error") {
        console.log("[vapi]", JSON.stringify(msg));
      }
    });

    this.ws.on("close", () => {
      this.ws = undefined;
    });
  }

  sendUserAudio(pcm: Buffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
    }
  }

  async stop(): Promise<void> {
    const ws = this.ws;
    this.ws = undefined;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "hangup" }));
    ws.close();
  }
}