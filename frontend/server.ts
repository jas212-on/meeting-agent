import express from "express";
import cors from "cors";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const app = express();
const PORT = 3001;
const VM_DIR = path.resolve(import.meta.dirname, "..", "virtual_machine");

app.use(cors());
app.use(express.json());

/* ── Session state ───────────────────────────────────────── */
let activeProcess: ChildProcess | null = null;
let status: "idle" | "joining" | "running" = "idle";
let logs: string[] = [];
const sseClients: Set<express.Response> = new Set();

function broadcast(line: string): void {
  logs.push(line);
  if (logs.length > 500) logs = logs.slice(-400);
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }
}

/* ── POST /api/join ──────────────────────────────────────── */
app.post("/api/join", (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url) return res.status(400).json({ error: "Missing url" });

  const meetRe = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
  if (!meetRe.test(url))
    return res.status(400).json({ error: "Invalid Google Meet URL" });

  if (activeProcess) {
    return res
      .status(409)
      .json({ error: "A meeting session is already running" });
  }

  status = "joining";
  logs = [];
  broadcast(`[dashboard] Starting bot for ${url}`);

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
      broadcast(text);
      if (text.includes("In meeting")) status = "running";
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) broadcast(`[stderr] ${text}`);
  });

  child.on("close", (code) => {
    broadcast(`[dashboard] Process exited with code ${code}`);
    activeProcess = null;
    status = "idle";
  });

  child.on("error", (err) => {
    broadcast(`[dashboard] Process error: ${err.message}`);
    activeProcess = null;
    status = "idle";
  });

  return res.json({ ok: true, message: "Joining meeting..." });
});

/* ── POST /api/leave ─────────────────────────────────────── */
app.post("/api/leave", (_req, res) => {
  if (!activeProcess) return res.status(404).json({ error: "No active session" });

  broadcast("[dashboard] Leaving meeting...");
  activeProcess.kill("SIGTERM");
  // Force-kill after 5 seconds
  const timer = setTimeout(() => {
    if (activeProcess) {
      activeProcess.kill("SIGKILL");
      activeProcess = null;
      status = "idle";
    }
  }, 5000);
  activeProcess.on("close", () => clearTimeout(timer));

  return res.json({ ok: true });
});

/* ── GET /api/status ─────────────────────────────────────── */
app.get("/api/status", (_req, res) => {
  res.json({ status });
});

/* ── GET /api/logs (SSE) ─────────────────────────────────── */
app.get("/api/logs", (_req, res) => {
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

/* ── Start ───────────────────────────────────────────────── */
app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});
