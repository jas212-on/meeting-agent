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
  private page?: WebSocket;

  constructor(
    private readonly port: number,
    private readonly onUserAudio: (pcm: Buffer) => void,
  ) {}

  async start(): Promise<string> {
    this.server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(audioBridgePageHtml);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, "127.0.0.1", () => resolve());
    });

    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });
    this.wss.on("connection", (ws) => {
      this.page = ws;
      ws.on("message", (data: RawData, isBinary: boolean) => {
        if (!isBinary) return;
        this.onUserAudio(toBuffer(data));
      });
      ws.on("close", () => {
        if (this.page === ws) this.page = undefined;
      });
    });

    return `http://127.0.0.1:${this.port}/`;
  }

  sendToPage(pcm: Buffer): void {
    if (this.page && this.page.readyState === WebSocket.OPEN) {
      this.page.send(pcm);
    }
  }

  async stop(): Promise<void> {
    this.page?.close();
    this.wss?.close();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}