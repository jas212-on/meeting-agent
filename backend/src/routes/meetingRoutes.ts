import { Router, type Response } from "express";
import { spawn, exec, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VM_DIR = path.resolve(__dirname, "..", "..", "..", "virtual_machine");

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    exec(`taskkill /pid ${pid} /T /F`, () => {});
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
}

/* ── Session state ───────────────────────────────────────── */
let activeProcess: ChildProcess | null = null;
let status: "idle" | "joining" | "running" = "idle";
let logs: string[] = [];
const sseClients: Set<Response> = new Set();

function broadcast(line: string): void {
  logs.push(line);
  if (logs.length > 500) logs = logs.slice(-400);
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }
}

/* ── POST /api/join ──────────────────────────────────────── */
router.post("/join", optionalAuth, (req: AuthRequest, res: Response): void => {
  const { url } = req.body as { url?: string };

  if (!url) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  const meetRe = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
  if (!meetRe.test(url)) {
    res.status(400).json({ error: "Invalid Google Meet URL" });
    return;
  }

  if (activeProcess) {
    res.status(409).json({ error: "A meeting session is already running" });
    return;
  }

  const userIdentifier = req.user ? `${req.user.name} (${req.user.email})` : "Anonymous user";

  status = "joining";
  logs = [];
  broadcast(`[dashboard] Starting bot for ${url} by ${userIdentifier}`);

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

  res.json({ ok: true, message: "Joining meeting..." });
});

/* ── POST /api/leave ─────────────────────────────────────── */
router.post("/leave", async (_req, res: Response): Promise<void> => {
  if (!activeProcess) {
    res.status(404).json({ error: "No active session" });
    return;
  }

  broadcast("[dashboard] Leaving meeting...");
  const proc = activeProcess;
  const pid = proc.pid;

  // 1. Attempt graceful leave via control server if available
  try {
    await fetch("http://127.0.0.1:4712/leave", {
      method: "POST",
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Fall back to signal/kill if control server is unreachable
  }

  // 2. Force-kill entire process tree if still running after 3 seconds
  const timer = setTimeout(() => {
    if (activeProcess && pid) {
      broadcast("[dashboard] Force-terminating session process tree...");
      killProcessTree(pid);
      activeProcess = null;
      status = "idle";
    }
  }, 3000);

  proc.once("close", () => {
    clearTimeout(timer);
    activeProcess = null;
    status = "idle";
  });

  res.json({ ok: true });
});

/* ── GET /api/status ─────────────────────────────────────── */
router.get("/status", (_req, res: Response): void => {
  res.json({ status });
});

/* ── GET /api/logs (SSE) ─────────────────────────────────── */
router.get("/logs", (_req, res: Response): void => {
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

export default router;
