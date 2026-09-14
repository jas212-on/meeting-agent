import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";

type Status = "idle" | "joining" | "running";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auth states
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isValidUrl = MEET_RE.test(url.trim());

  /* ── Check user session ────────────── */
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    const fetchMe = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          // Token expired or invalid
          setToken(null);
          setUser(null);
          localStorage.removeItem("auth_token");
        }
      } catch {
        // Network or server unreachable
      }
    };

    fetchMe();
  }, [token]);

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/join", {
        method: "POST",
        headers,
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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch("/api/leave", { method: "POST", headers });
    } catch {
      setError("Cannot reach API server");
    }
  };

  /* ── Handle Auth Form Submit ──────── */
  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Authentication failed. Please check your inputs.");
        setAuthLoading(false);
        return;
      }

      // Success
      localStorage.setItem("auth_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setShowAuthModal(false);
      setAuthPassword("");
      setAuthError(null);
    } catch {
      setAuthError("Unable to connect to authentication service.");
    } finally {
      setAuthLoading(false);
    }
  };

  /* ── Handle Logout ────────────────── */
  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
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

        {/* Auth status & actions */}
        <div className="auth-bar">
          {user ? (
            <>
              <div className="user-badge">
                <span className="user-avatar">
                  {user.name ? user.name[0].toUpperCase() : "U"}
                </span>
                <span>{user.name}</span>
              </div>
              <button className="auth-btn-ghost" onClick={handleLogout}>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button
                className="auth-btn-ghost"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                  setShowAuthModal(true);
                }}
              >
                Sign In
              </button>
              <button
                className="auth-btn-primary"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                  setShowAuthModal(true);
                }}
              >
                Get Started
              </button>
            </>
          )}
        </div>
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
              <button className="log-clear" onClick={() => setLogs([])}>
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

      {/* ── Auth Modal ─────────────── */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setShowAuthModal(false)}
            >
              &times;
            </button>

            <div className="modal-tabs">
              <button
                className={`modal-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
              >
                Sign In
              </button>
              <button
                className={`modal-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
              >
                Create Account
              </button>
            </div>

            <form className="modal-form" onSubmit={handleAuthSubmit}>
              {authError && <div className="form-error">{authError}</div>}

              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="auth-name">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    className="form-input"
                    placeholder="Jane Doe"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="auth-email">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  className="form-input"
                  placeholder="At least 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="form-submit-btn"
                disabled={authLoading}
              >
                {authLoading
                  ? "Processing…"
                  : authMode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="footer">
        MeetMinutes.ai &middot; Powered by Playwright &amp; Vapi
      </footer>
    </div>
  );
}

export default App;
