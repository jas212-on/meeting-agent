import http from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { audioBridgePageHtml } from "./audio-bridge-page.js";

function toBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data as ArrayBuffer);
}

export class AudioBridge {
  private server?: http.Server;
  private wss?: WebSocketServer;

  // WebSocket used by the audio bridge browser page.
  // This is the Vapi TTS -> CABLE Input path.
  private page?: WebSocket;

  private ready = false;

  onPlaybackStateChange?: (playing: boolean) => void;

  constructor(
    private readonly port: number,
    private readonly onUserAudio: (pcm: Buffer) => void,
  ) {}

  async start(): Promise<string> {
    console.log(`[AudioBridge] Step: Starting HTTP & WebSocket bridge server on port ${this.port}...`);
    this.server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
      });

      res.end(audioBridgePageHtml);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", (err) => {
        console.error(`[AudioBridge] FAILED: HTTP server failed to start on port ${this.port}:`, err);
        reject(err);
      });

      this.server!.listen(this.port, "127.0.0.1", () => {
        console.log(
          `[AudioBridge] SUCCESS: HTTP server listening on 127.0.0.1:${this.port}`,
        );

        resolve();
      });
    });

    // One WebSocket server, with two separate paths:
    //
    // /ws
    //   Audio bridge page <-> Node
    //   Vapi TTS -> browser -> CABLE Input
    //
    // /meet-audio
    //   Meet page -> Node
    //   Remote Meet participant audio -> Vapi
    //
    this.wss = new WebSocketServer({
      server: this.server,
    });

    this.wss.on("connection", (ws, req) => {
      console.log(`[AudioBridge] WebSocket client connected on path: ${req.url}`);

      // ============================================================
      // MEET AUDIO INPUT
      // ============================================================
      //
      // Meet page captures the remote participant's audio and sends
      // PCM here.
      //
      // This path MUST NOT overwrite this.page.
      //
      if (req.url === "/meet-audio") {
        console.log("[AudioBridge] Meet audio WebSocket connection established (/meet-audio)");

        ws.on("message", (data: RawData, isBinary: boolean) => {
          if (!isBinary) {
            return;
          }

          const pcm = toBuffer(data);

          console.log(
            `[AudioBridge] User voice received from Meet audio capture (${pcm.length} bytes)`,
          );

          this.onUserAudio(pcm);
        });

        ws.on("close", () => {
          console.log("[AudioBridge] Meet audio WebSocket connection closed");
        });

        ws.on("error", (err) => {
          console.error("[AudioBridge] Meet audio WebSocket error:", err);
        });

        return;
      }

      // ============================================================
      // AUDIO BRIDGE PAGE
      // ============================================================
      //
      // The browser page used for Vapi playback connects here.
      //
      if (req.url !== "/ws") {
        console.warn(`[AudioBridge] Unknown WebSocket connection path rejected: ${req.url}`);
        ws.close();
        return;
      }

      console.log("[AudioBridge] Audio bridge browser page connected (/ws)");

      // IMPORTANT:
      // Only /ws is allowed to become this.page.
      this.page = ws;
      this.ready = false;

      ws.on("message", (data: RawData, isBinary: boolean) => {
        // Messages from the audio bridge page are normally control
        // messages such as "ready" or playback state.
        if (!isBinary) {
          try {
            const msg = JSON.parse(data.toString());

            console.log(
              `[AudioBridge] Bridge page control message: type="${msg.type}"`,
              JSON.stringify(msg),
            );

            if (msg.type === "ready") {
              this.ready = true;
              console.log("[AudioBridge] SUCCESS: Audio bridge browser page confirmed READY");
            } else if (msg.type === "playback-started") {
              console.log("[AudioBridge] Playback STARTED: Assistant voice now playing to Google Meet");
              this.onPlaybackStateChange?.(true);
            } else if (
              msg.type === "playback-stopped" ||
              msg.type === "playback-underrun"
            ) {
              console.log(
                `[AudioBridge] Playback STOPPED (${msg.type}): Assistant voice finished playing`,
              );
              this.onPlaybackStateChange?.(false);
            }
          } catch (err) {
            console.error(
              "[AudioBridge] FAILED to parse message from audio bridge page:",
              err,
            );
          }

          return;
        }

        // Binary data coming from the bridge page (user audio captured from CABLE Output).
        const pcm = toBuffer(data);
        this.onUserAudio(pcm);
      });

      ws.on("close", () => {
        console.log("[AudioBridge] Audio bridge browser page WebSocket connection closed");

        if (this.page === ws) {
          this.page = undefined;
          this.ready = false;
        }
      });

      ws.on("error", (err) => {
        console.error(
          "[AudioBridge] Audio bridge browser page WebSocket error:",
          err,
        );
      });
    });

    return `http://127.0.0.1:${this.port}/`;
  }

  async waitForReady(timeoutMs = 10_000): Promise<void> {
    console.log(`[AudioBridge] Step: Waiting for audio bridge browser page to signal READY (timeout: ${timeoutMs}ms)...`);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (
        this.page &&
        this.page.readyState === WebSocket.OPEN &&
        this.ready
      ) {
        console.log("[AudioBridge] SUCCESS: Audio bridge page is confirmed READY.");
        return;
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    console.error(
      "[AudioBridge] TIMEOUT: Timed out waiting for audio bridge browser page to report READY",
    );
  }

  // ==============================================================
  // VAPI -> AUDIO BRIDGE PAGE
  // ==============================================================

  sendToPage(pcm: Buffer): void {
    if (
      this.page &&
      this.page.readyState === WebSocket.OPEN
    ) {
      this.page.send(pcm);
    } else {
      console.warn(
        "[AudioBridge] FAILED to forward voice to bridge page: WebSocket /ws is not open",
      );
    }
  }

  // ==============================================================
  // STOP
  // ==============================================================

  async stop(): Promise<void> {
    console.log("[AudioBridge] Step: Stopping Audio Bridge server...");

    this.page?.close();

    this.wss?.close();

    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        resolve();
      });
    });

    console.log("[AudioBridge] Audio Bridge stopped.");
  }
}