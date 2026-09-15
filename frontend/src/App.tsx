import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import type { MeetingRecord } from "./types";
import { INITIAL_MEETINGS, createNewMeetingRecord, formatDuration } from "./utils/mockData";
import { MeetingHistory } from "./components/MeetingHistory";
import { AttendanceDrawer } from "./components/AttendanceDrawer";

type Status = "idle" | "joining" | "running";

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
const LOCAL_STORAGE_KEY = "meetminutes_history_v1";

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);
  const [showLogsConsole, setShowLogsConsole] = useState<boolean>(false);

  // Active meeting live timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const activeMeetingStartTimeRef = useRef<number | null>(null);
  const currentMeetingUrlRef = useRef<string>("");

  // History state
  const [meetings, setMeetings] = useState<MeetingRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback to initial
    }
    return INITIAL_MEETINGS;
  });

  // Selected meeting for side drawer
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Auth states
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "auth">(() => {
    // If auth token exists in localStorage, start on dashboard; otherwise show auth page
    return localStorage.getItem("auth_token") ? "dashboard" : "auth";
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef<Status>(status);
  statusRef.current = status;

  const isValidUrl = MEET_RE.test(url.trim());

  /* ── Save meetings to localStorage ───────────────────────── */
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meetings));
    } catch (e) {
      console.warn("Unable to save meeting history to localStorage", e);
    }
  }, [meetings]);

  /* ── Timer for active meeting ────────────────────────────── */
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (status === "running" || status === "joining") {
      if (!activeMeetingStartTimeRef.current) {
        activeMeetingStartTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        if (activeMeetingStartTimeRef.current) {
          const diff = Math.floor((Date.now() - activeMeetingStartTimeRef.current) / 1000);
          setElapsedSeconds(diff);
        }
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  /* ── Auto-scroll logs ────────────────────────────────────── */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  /* ── Fetch meetings from database ────────────────────────── */
  const fetchMeetings = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch("/api/meetings", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.meetings)) {
          setMeetings(data.meetings);
        }
      }
    } catch {
      // Backend offline or unreachable, fallback to localStorage
    }
  }, [token]);

  /* ── Check user session & sync database ──────────────────── */
  useEffect(() => {
    if (!token) {
      setUser(null);
      fetchMeetings();
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
          setToken(null);
          setUser(null);
          localStorage.removeItem("auth_token");
        }
      } catch {
        // Backend offline or unreachable
      }
      fetchMeetings();
    };

    fetchMe();
  }, [token, fetchMeetings]);

  /* ── SSE log stream ──────────────────────────────────────── */
  const connectLogs = useCallback(() => {
    try {
      eventSourceRef.current?.close();
      const es = new EventSource("/api/logs");
      es.onmessage = (e) => {
        const line = JSON.parse(e.data) as string;
        setLogs((prev) => [...prev.slice(-200), line]);
      };
      es.onerror = () => {
        es.close();
      };
      eventSourceRef.current = es;
    } catch {
      // Backend not running
    }
  }, []);

  /* ── Complete meeting & record history in database ────────── */
  const finalizeMeetingSession = useCallback(
    async (meetingUrl: string, durationSecs: number) => {
      if (!meetingUrl) return;
      const effectiveSecs = Math.max(8, durationSecs);
      const newRecord = createNewMeetingRecord(meetingUrl, effectiveSecs, user);

      setMeetings((prev) => [newRecord, ...prev.filter((m) => m.id !== newRecord.id)]);
      setSelectedMeeting(newRecord);
      setIsDrawerOpen(true);
      setNotification(`Meeting ${newRecord.id} completed! Attendance & minutes recorded.`);

      // Persist record to MongoDB Atlas
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers,
          body: JSON.stringify(newRecord),
        });
        if (res.ok) {
          fetchMeetings();
        }
      } catch (err) {
        console.warn("Failed to persist meeting record to backend:", err);
      }

      // Reset timer references
      activeMeetingStartTimeRef.current = null;
      setElapsedSeconds(0);
      currentMeetingUrlRef.current = "";

      setTimeout(() => {
        setNotification(null);
      }, 5000);
    },
    [user, token, fetchMeetings]
  );

  /* ── Poll status & handle backend connectivity ─────────────── */
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/status");
        if (res.ok) {
          setIsBackendOnline(true);
          const data = (await res.json()) as { status: Status };
          const prevStatus = statusRef.current;

          // If was running/joining and now became idle, complete session
          if ((prevStatus === "running" || prevStatus === "joining") && data.status === "idle") {
            const recordedUrl = currentMeetingUrlRef.current || url;
            const diff = activeMeetingStartTimeRef.current
              ? Math.floor((Date.now() - activeMeetingStartTimeRef.current) / 1000)
              : elapsedSeconds;
            finalizeMeetingSession(recordedUrl, diff);
          }

          setStatus(data.status);
        } else {
          setIsBackendOnline(false);
        }
      } catch {
        setIsBackendOnline(false);
      }
    }, 2500);

    connectLogs();

    return () => {
      clearInterval(poll);
      eventSourceRef.current?.close();
    };
  }, [connectLogs, elapsedSeconds, finalizeMeetingSession, url]);

  /* ── Join meeting ─────────────────────────────────────────── */
  const handleJoin = async () => {
    if (!isValidUrl || status !== "idle") return;
    setError(null);
    setLogs([]);
    const meetingUrl = url.trim();
    currentMeetingUrlRef.current = meetingUrl;
    activeMeetingStartTimeRef.current = Date.now();
    setElapsedSeconds(0);

    // If backend is online, invoke real endpoint
    if (isBackendOnline) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch("/api/join", {
          method: "POST",
          headers,
          body: JSON.stringify({ url: meetingUrl }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to start meeting session");
          activeMeetingStartTimeRef.current = null;
        } else {
          setStatus("joining");
        }
      } catch {
        // Fallback to simulation if backend drops
        startSimulatedSession(meetingUrl);
      }
    } else {
      // Offline / Demo Mode: simulate instant join
      startSimulatedSession(meetingUrl);
    }
  };

  /* ── Simulated meeting session (for local preview/demo) ────── */
  const startSimulatedSession = (meetingUrl: string) => {
    setStatus("joining");
    setLogs([
      `[demo-agent] Initiating simulated meeting bot for ${meetingUrl}`,
      "[demo-agent] Launching headless browser environment…",
    ]);

    setTimeout(() => {
      setStatus("running");
      setLogs((prev) => [
        ...prev,
        "[demo-agent] Successfully entered meeting lobby",
        "[demo-agent] Mic and audio routing connected (Vapi bridge active)",
        "[demo-agent] In meeting — listening and generating real-time minutes",
      ]);
    }, 1800);
  };

  /* ── Leave meeting ────────────────────────────────────────── */
  const handleLeave = async () => {
    const meetingUrl = currentMeetingUrlRef.current || url;
    const diff = activeMeetingStartTimeRef.current
      ? Math.floor((Date.now() - activeMeetingStartTimeRef.current) / 1000)
      : elapsedSeconds;

    if (isBackendOnline) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        await fetch("/api/leave", { method: "POST", headers });
      } catch {
        // continue
      }
    }

    setStatus("idle");
    finalizeMeetingSession(meetingUrl, diff);
  };

  /* ── Paste URL from clipboard helper ──────────────────────── */
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setError(null);
      }
    } catch {
      // clipboard permission denied
    }
  };

  /* ── History Actions ──────────────────────────────────────── */
  const handleSelectMeeting = (meeting: MeetingRecord) => {
    setSelectedMeeting(meeting);
    setIsDrawerOpen(true);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    if (selectedMeeting?.id === meetingId) {
      setIsDrawerOpen(false);
      setSelectedMeeting(null);
    }

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        headers,
      });
    } catch (err) {
      console.warn("Failed to delete meeting from backend:", err);
    }
  };

  const handleRestoreDefaults = async () => {
    setMeetings(INITIAL_MEETINGS);
    for (const sample of INITIAL_MEETINGS) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        await fetch("/api/meetings", {
          method: "POST",
          headers,
          body: JSON.stringify(sample),
        });
      } catch (e) {
        console.warn("Could not persist sample meeting to MongoDB:", e);
      }
    }
    fetchMeetings();
  };

  const handleToggleActionItem = async (meetingId: string, actionId: string) => {
    let nextCompleted: boolean | undefined;

    setMeetings((prev) =>
      prev.map((m) => {
        if (m.id !== meetingId) return m;
        return {
          ...m,
          minutes: {
            ...m.minutes,
            actionItems: m.minutes.actionItems.map((item) => {
              if (item.id === actionId) {
                nextCompleted = !item.completed;
                return { ...item, completed: !item.completed };
              }
              return item;
            }),
          },
        };
      })
    );

    if (selectedMeeting && selectedMeeting.id === meetingId) {
      setSelectedMeeting((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          minutes: {
            ...prev.minutes,
            actionItems: prev.minutes.actionItems.map((item) =>
              item.id === actionId ? { ...item, completed: !item.completed } : item
            ),
          },
        };
      });
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch(`/api/meetings/${meetingId}/actions/${actionId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ completed: nextCompleted }),
      });
    } catch (err) {
      console.warn("Failed to sync action item to backend:", err);
    }
  };

  /* ── Handle Auth Form Submit ──────────────────────────────── */
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

      localStorage.setItem("auth_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setShowAuthModal(false);
      setCurrentView("dashboard");
      setAuthPassword("");
      setAuthError(null);
      setNotification(`Welcome back, ${data.user.name || "User"}!`);
    } catch {
      // When offline, simulate mock user for testing
      const mockUser = {
        id: "usr-" + Date.now(),
        name: authName || (authMode === "login" ? "Jane Doe" : "New User"),
        email: authEmail || "user@example.com",
      };
      localStorage.setItem("auth_token", "demo-token-" + Date.now());
      setToken("demo-token");
      setUser(mockUser);
      setShowAuthModal(false);
      setCurrentView("dashboard");
      setAuthPassword("");
      setAuthError(null);
      setNotification(`Signed in as ${mockUser.name} (Interactive session)`);
    } finally {
      setAuthLoading(false);
    }
  };

  /* ── Quick One-Click Demo Login ───────────────────────────── */
  const handleDemoLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@meetminutes.ai", password: "demopassword123" }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("auth_token", data.token);
        setToken(data.token);
        setUser(data.user);
        setCurrentView("dashboard");
        setShowAuthModal(false);
        setNotification(`Welcome back, ${data.user.name}!`);
        setAuthLoading(false);
        return;
      }
    } catch {
      // offline fallback
    }

    const demoUser: UserProfile = {
      id: "usr-demo",
      name: "Alex Morgan",
      email: "alex@meetminutes.ai",
    };
    localStorage.setItem("auth_token", "demo-token-alex");
    setToken("demo-token-alex");
    setUser(demoUser);
    setCurrentView("dashboard");
    setShowAuthModal(false);
    setNotification("Signed in as Alex Morgan (Demo Account)");
    setAuthLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setCurrentView("auth");
    setNotification("Signed out successfully.");
  };

  return (
    <div className="dashboard-container">
      {/* ── Notification Banner ──────────────────────────── */}
      {notification && (
        <aside className="toast-notification" role="status" aria-live="polite">
          <span className="toast-icon">✨</span>
          <span>{notification}</span>
          <button
            className="toast-close"
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </aside>
      )}

      {/* ── Top Navigation Bar ────────────────────────────── */}
      <header className="top-navbar">
        <div className="nav-brand">
          <span className="brand-icon">🎙️</span>
          <div className="brand-text-col">
            <h1 className="brand-title">
              Meet<span className="brand-accent">Minutes</span>
              <span className="brand-tld">.ai</span>
            </h1>
            <span className="brand-subtitle">Autonomous Meeting Agent</span>
          </div>
        </div>

        {/* Status Indicators & Auth */}
        <div className="nav-actions">
          {/* Navigation view buttons */}
          <button
            className={`nav-link-btn ${currentView === "dashboard" ? "active" : ""}`}
            onClick={() => setCurrentView("dashboard")}
          >
            Dashboard
          </button>

          {/* Backend connectivity indicator */}
          <div
            className={`server-status-pill ${isBackendOnline ? "status-online" : "status-demo"}`}
            title={
              isBackendOnline
                ? "Connected to Meeting Agent backend (Port 3001)"
                : "Backend server offline. Interactive Demo Mode active."
            }
          >
            <span className="status-indicator-dot" />
            <span>{isBackendOnline ? "Live Agent" : "Demo Mode"}</span>
          </div>

          {user ? (
            <div className="user-profile-menu">
              <div className="user-badge">
                <span className="user-avatar">
                  {user.name ? user.name[0].toUpperCase() : "U"}
                </span>
                <span className="user-name-text">{user.name}</span>
              </div>
              <button className="nav-btn-ghost" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          ) : (
            <div className="auth-buttons-group">
              <button
                className={`nav-btn-ghost ${currentView === "auth" && authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                  setCurrentView("auth");
                }}
              >
                Sign In
              </button>
              <button
                className={`nav-btn-primary ${currentView === "auth" && authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                  setCurrentView("auth");
                }}
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout Body ──────────────────────────────── */}
      {currentView === "auth" ? (
        <div className="auth-page-container">
          <div className="auth-card-wrapper">
            <div className="auth-header-block">
              <span className="auth-logo-icon">🎙️</span>
              <h2 className="auth-title">
                Meet<span className="brand-accent">Minutes</span>
                <span className="brand-tld">.ai</span>
              </h2>
              <p className="auth-subtitle">
                {authMode === "login"
                  ? "Sign in to manage meetings, real-time agent transcripts, and attendance."
                  : "Create an account to start deploying automated meeting bots."}
              </p>
              <div className="auth-features-preview">
                <span className="auth-feature-tag">⚡ Live Bot</span>
                <span className="auth-feature-tag">👥 Attendance</span>
                <span className="auth-feature-tag">📄 PDF Minutes</span>
              </div>
            </div>

            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
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
              {authError && (
                <div className="form-error">
                  <span>⚠</span> {authError}
                </div>
              )}

              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="page-auth-name">
                    Full Name
                  </label>
                  <input
                    id="page-auth-name"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Alex Morgan"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="page-auth-email">
                  Email Address
                </label>
                <input
                  id="page-auth-email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="name@company.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="page-auth-password">
                  Password
                </label>
                <input
                  id="page-auth-password"
                  type="password"
                  required
                  minLength={6}
                  className="form-input"
                  placeholder="Minimum 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="form-submit-btn" disabled={authLoading}>
                {authLoading
                  ? "Processing…"
                  : authMode === "login"
                  ? "Sign In to Dashboard"
                  : "Create Free Account"}
              </button>
            </form>

            <div className="auth-quick-actions">
              <button
                type="button"
                className="demo-login-btn"
                onClick={handleDemoLogin}
                disabled={authLoading}
              >
                <span>✨</span> Instant Demo Login (One Click)
              </button>

              <button
                type="button"
                className="guest-continue-btn"
                onClick={() => setCurrentView("dashboard")}
              >
                Skip &amp; Explore Dashboard as Guest →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <main className="dashboard-content">
        {/* ── Join Meeting Command Center ─────────────────── */}
        <section className="join-hero-card" aria-label="Meeting Controls">
          <div className="hero-header">
            <div className="hero-title-group">
              <span className="hero-badge">AI Assistant Hub</span>
              <h2 className="hero-heading">Join Google Meet Room</h2>
              <p className="hero-tagline">
                Send your AI agent to attend, record transcripts, map attendance, and compile minutes.
              </p>
            </div>

            {status !== "idle" && (
              <div className="live-meeting-indicator">
                <span className="live-pulse-dot" />
                <span className="live-label">
                  {status === "joining" ? "CONNECTING BOT…" : "MEETING IN PROGRESS"}
                </span>
                <span className="live-timer">{formatDuration(elapsedSeconds)}</span>
              </div>
            )}
          </div>

          {/* Join Input Bar */}
          <div className="join-input-bar">
            <div className="input-wrapper">
              <span className="input-icon">🔗</span>
              <input
                id="meeting-url"
                type="url"
                className="meet-url-input"
                placeholder="Paste Google Meet link (e.g. https://meet.google.com/xyz-qwer-tyu)"
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
              {url ? (
                <button
                  className="input-clear-btn"
                  onClick={() => setUrl("")}
                  title="Clear input"
                  disabled={status !== "idle"}
                >
                  ✕
                </button>
              ) : (
                <button
                  className="input-paste-btn"
                  onClick={handlePasteClipboard}
                  title="Paste from clipboard"
                  type="button"
                >
                  📋 Paste
                </button>
              )}
            </div>

            {status === "idle" ? (
              <button
                id="join-btn"
                className="btn-join-primary"
                disabled={!isValidUrl}
                onClick={handleJoin}
              >
                <span className="btn-icon">▶</span>
                <span>Join &amp; Record</span>
              </button>
            ) : (
              <button id="leave-btn" className="btn-leave-danger" onClick={handleLeave}>
                <span className="btn-icon">■</span>
                <span>Leave &amp; Finalize ({formatDuration(elapsedSeconds)})</span>
              </button>
            )}
          </div>

          {/* Hints & Errors */}
          {url && !isValidUrl && (
            <p className="field-hint field-hint-error">
              ⚠ Please enter a valid Google Meet link (format: https://meet.google.com/xxx-xxxx-xxx)
            </p>
          )}
          {error && <p className="field-hint field-hint-error">⚠ {error}</p>}

          {/* Active Meeting Hub Live Banner */}
          {status !== "idle" && (
            <div className="active-session-hub">
              <div className="audio-wave-visualizer">
                <span className="wave-bar bar-1" />
                <span className="wave-bar bar-2" />
                <span className="wave-bar bar-3" />
                <span className="wave-bar bar-4" />
                <span className="wave-bar bar-5" />
              </div>
              <div className="active-session-info">
                <span className="session-info-title">
                  {status === "joining"
                    ? "Agent is authenticating and entering lobby…"
                    : "MeetMinutes bot is actively transcribing audio and recording attendance."}
                </span>
                <span className="session-info-sub">
                  When the meeting ends, click &quot;Leave &amp; Finalize&quot; to compile your minutes and
                  PDF.
                </span>
              </div>
            </div>
          )}

          {/* Live Diagnostic Logs Toggle */}
          <div className="logs-toggle-row">
            <button
              className="btn-logs-toggle"
              onClick={() => setShowLogsConsole(!showLogsConsole)}
            >
              <span className="toggle-icon">{showLogsConsole ? "▼" : "▶"}</span>
              <span>Agent System Logs ({logs.length} events)</span>
            </button>
            {logs.length > 0 && showLogsConsole && (
              <button className="btn-logs-clear" onClick={() => setLogs([])}>
                Clear logs
              </button>
            )}
          </div>

          {/* Collapsible Log Console */}
          {showLogsConsole && (
            <div className="logs-console-box">
              {logs.length === 0 ? (
                <p className="log-empty-msg">No logs generated yet. Join a meeting to view output.</p>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="log-entry">
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          )}
        </section>

        {/* ── Meeting History Section ─────────────────────── */}
        <MeetingHistory
          meetings={meetings}
          onSelectMeeting={handleSelectMeeting}
          onDeleteMeeting={handleDeleteMeeting}
          onRestoreDefaults={handleRestoreDefaults}
        />
      </main>
      )}

      {/* ── Slide-out Attendance & Minutes Side Drawer ──── */}
      <AttendanceDrawer
        meeting={selectedMeeting}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onToggleActionItem={handleToggleActionItem}
      />

      {/* ── Auth Modal ──────────────────────────────────── */}
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
                    placeholder="e.g. Jane Doe"
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

              <button type="submit" className="form-submit-btn" disabled={authLoading}>
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

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="footer-bar">
        <p className="footer-text">
          MeetMinutes.ai &middot; Enterprise AI Meeting Assistant with Automated Attendance &amp; Minutes
        </p>
      </footer>
    </div>
  );
}

export default App;
