import { useState, useEffect, useRef, useCallback } from "react";

type Status = "idle" | "joining" | "running";

const MEET_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isValidUrl = MEET_RE.test(url.trim());

  /* ── SSE log stream ───────────────── */
  const connectLogs = useCallback(() => {
    eventSourceRef.current?.close();
    const es = new EventSource("/api/logs");
    es.onmessage = (e) => {
      const line = JSON.parse(e.data) as string;
      setLogs((prev) => [...prev.slice(-200), line]);
    };
    eventSourceRef.current = es;
  }, []);

  /* ── Poll status ──────────────────── */
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/status");
        const data = (await res.json()) as { status: Status };
        setStatus(data.status);
      } catch {
        /* server down */
      }
    }, 2000);
    connectLogs();
    return () => {
      clearInterval(poll);
      eventSourceRef.current?.close();
    };
  }, [connectLogs]);

  /* ── Auto-scroll logs ─────────────── */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  /* ── Join meeting ────────────────── */
  const handleJoin = async () => {
    if (!isValidUrl || status !== "idle") return;
    setError(null);
    setLogs([]);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) setError(data.error ?? "Failed to start");
    } catch {
      setError("Cannot reach API server");
    }
  };

  /* ── Leave meeting ───────────────── */
  const handleLeave = async () => {
    try {
      await fetch("/api/leave", { method: "POST" });
    } catch {
      setError("Cannot reach API server");
    }
  };

  const statusLabel: Record<Status, string> = {
    idle: "Ready",
    joining: "Joining…",
    running: "In Meeting",
  };

  const statusColor: Record<Status, string> = {
    idle: "var(--status-idle)",
    joining: "var(--status-joining)",
    running: "var(--status-running)",
  };

  return (
    <div className="dashboard">
      {/* ── Header ────────────────── */}
      <header className="header">
        <div className="logo-row">
          <span className="logo-icon">🎙️</span>
          <h1 className="logo-text">
            Meet<span className="logo-accent">Minutes</span>
            <span className="logo-dot">.ai</span>
          </h1>
        </div>
        <p className="tagline">AI-powered meeting assistant — join, listen, summarize.</p>
      </header>

      {/* ── Main Card ─────────────── */}
      <main className="card">
        {/* Status beacon */}
        <div className="status-row">
          <span
            className={`status-dot ${status !== "idle" ? "pulse" : ""}`}
            style={{ background: statusColor[status] }}
          />
          <span className="status-label">{statusLabel[status]}</span>
        </div>

        {/* Meeting link input */}
        <div className="input-group">
          <input
            id="meeting-url"
            type="url"
            className="url-input"
            placeholder="Paste Google Meet link — https://meet.google.com/abc-defg-hij"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            disabled={status !== "idle"}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />

          {status === "idle" ? (
            <button
              id="join-btn"
              className="btn btn-primary"
              disabled={!isValidUrl}
              onClick={handleJoin}
            >
              <span className="btn-icon">▶</span>
              Join Meeting
            </button>
          ) : (
            <button id="leave-btn" className="btn btn-danger" onClick={handleLeave}>
              <span className="btn-icon">■</span>
              Leave
            </button>
          )}
        </div>

        {/* Validation / error */}
        {url && !isValidUrl && (
          <p className="hint error-hint">Enter a valid Google Meet URL</p>
        )}
        {error && <p className="hint error-hint">⚠ {error}</p>}

        {/* Log console */}
        <div className="log-section">
          <div className="log-header">
            <span className="log-title">Live Logs</span>
            {logs.length > 0 && (
              <button
                className="log-clear"
                onClick={() => setLogs([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="log-console">
            {logs.length === 0 ? (
              <p className="log-empty">Waiting for session…</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="log-line">
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </main>

      <footer className="footer">
        MeetMinutes.ai &middot; Powered by Playwright &amp; Vapi
      </footer>
    </div>
  );
}

export default App;
