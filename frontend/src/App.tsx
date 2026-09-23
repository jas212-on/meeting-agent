import { useState, useEffect, useRef, useCallback } from "react";
import type { MeetingRecord, TranscriptEntry } from "./types";
import { INITIAL_MEETINGS, createNewMeetingRecord, formatDuration } from "./utils/mockData";
import { consolidateTranscripts } from "./utils/transcriptUtils";
import { MeetingHistory } from "./components/MeetingHistory";
import { GroupSection } from "./components/GroupSection";
import { AskMeetingsModal } from "./components/AskMeetingsModal";
import { MeetingDetailPage } from "./components/MeetingDetailPage";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import {
  Sparkles,
  Zap,
  Users,
  FileText,
  Link2,
  Clipboard,
  X,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Trash2,
  Radio,
  ArrowRight,
  AlertCircle,
  Terminal,
  Bot,
  Bell,
  Sun,
  Moon
} from "lucide-react";


type Status = "idle" | "joining" | "running";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
const LOCAL_STORAGE_KEY = "meetminutes_history_v1";

const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  if (!headers.has("ngrok-skip-browser-warning")) {
    headers.set("ngrok-skip-browser-warning", "true");
  }
  return fetch(input, { ...init, headers });
};

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

  // Selected meeting for detail view
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<"attendance" | "minutes">("minutes");
  const [liveTranscripts, setLiveTranscripts] = useState<TranscriptEntry[]>([]);

  // Ask AI Knowledge Assistant state
  const [isAskAiOpen, setIsAskAiOpen] = useState(false);
  const [askAiMeetingId, setAskAiMeetingId] = useState<string | null>(null);

  const handleOpenAskAi = (targetMeetingId?: string) => {
    setAskAiMeetingId(targetMeetingId || null);
    setIsAskAiOpen(true);
  };

  // Theme state: "light" | "dark" (persisted)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("meetminutes_theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // fallback
    }
    return "light";
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("meetminutes_theme", theme);
    } catch (e) {
      console.warn("Theme save error", e);
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // Auth states
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState<"dashboard" | "auth" | "meeting-detail">(() => {
    // If auth token exists in localStorage, start on dashboard; otherwise show auth page
    return localStorage.getItem("auth_token") ? "dashboard" : "auth";
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
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
      const res = await apiFetch("/api/meetings", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.meetings)) {
          setMeetings(data.meetings);
          // If drawer is open, refresh selected meeting with fresh data from database
          setSelectedMeeting((prev) => {
            if (!prev) return null;
            const targetId = prev.id || (prev as any).meetingId;
            const fresh = data.meetings.find(
              (m: any) => (m.meetingId || m.id) === targetId
            );
            return fresh || prev;
          });
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
        const res = await apiFetch("/api/auth/me", {
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

        // Capture live speech transcripts streamed over SSE
        if (line.startsWith("[LIVE_TRANSCRIPT] ") || line.startsWith("[LIVE_TRANSCRIPT_UPDATE] ")) {
          try {
            const isUpdate = line.startsWith("[LIVE_TRANSCRIPT_UPDATE] ");
            const rawJson = line.slice(isUpdate ? "[LIVE_TRANSCRIPT_UPDATE] ".length : "[LIVE_TRANSCRIPT] ".length);
            const entry: TranscriptEntry = JSON.parse(rawJson);
            setLiveTranscripts((prev) => {
              const existingIdx = prev.findIndex((t) => t.id === entry.id);
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = { ...updated[existingIdx], text: entry.text, timestamp: entry.timestamp };
                return consolidateTranscripts(updated);
              }
              return consolidateTranscripts([...prev, entry]);
            });
            setSelectedMeeting((prev) => {
              if (!prev) return prev;
              const prevList = prev.transcript || [];
              const existingIdx = prevList.findIndex((t) => t.id === entry.id);
              let updatedList: TranscriptEntry[];
              if (existingIdx >= 0) {
                updatedList = [...prevList];
                updatedList[existingIdx] = { ...updatedList[existingIdx], text: entry.text, timestamp: entry.timestamp };
              } else {
                updatedList = [...prevList, entry];
              }
              return {
                ...prev,
                transcript: consolidateTranscripts(updatedList),
              };
            });
          } catch (err) {
            console.warn("Could not parse LIVE_TRANSCRIPT SSE:", err);
          }
        }

        if (
          line.includes("successfully recorded in MongoDB Atlas") ||
          line.includes("Process exited with code")
        ) {
          setTimeout(() => {
            fetchMeetings();
          }, 600);
        }
      };
      es.onerror = () => {
        es.close();
      };
      eventSourceRef.current = es;
    } catch {
      // Backend not running
    }
  }, [fetchMeetings]);

  /* ── Complete meeting & record history in database ────────── */
  const finalizeMeetingSession = useCallback(
    async (meetingUrl: string, durationSecs: number) => {
      if (!meetingUrl) return;
      const effectiveSecs = Math.max(8, durationSecs);

      // Trigger immediate fetch to get latest from DB
      fetchMeetings();

      setDrawerInitialTab("attendance");
      setCurrentView("meeting-detail");
      setNotification(`Meeting concluded. Syncing attendance & AI summary...`);

      // If backend is offline, save local fallback record
      if (!isBackendOnline) {
        const fallbackRecord = createNewMeetingRecord(meetingUrl, effectiveSecs, user);
        setMeetings((prev) => [
          fallbackRecord,
          ...prev.filter((m) => m.id !== fallbackRecord.id),
        ]);
        setSelectedMeeting(fallbackRecord);
      } else {
        // Poll for 12 seconds to ensure backend DB upsert is captured
        const interval = setInterval(() => {
          fetchMeetings();
        }, 1200);
        setTimeout(() => clearInterval(interval), 12000);
      }

      // Reset timer references
      activeMeetingStartTimeRef.current = null;
      setElapsedSeconds(0);
      currentMeetingUrlRef.current = "";

      setTimeout(() => {
        setNotification(null);
      }, 5000);
    },
    [user, isBackendOnline, fetchMeetings]
  );

  /* ── Poll status & handle backend connectivity ─────────────── */
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await apiFetch("/api/status");
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
  const handleJoin = async (targetUrl?: string | unknown) => {
    const meetingUrl = (typeof targetUrl === "string" ? targetUrl : url).trim();
    if (!MEET_RE.test(meetingUrl) || status !== "idle") return;
    if (typeof targetUrl === "string") {
      setUrl(targetUrl.trim());
    }
    setError(null);
    setLogs([]);
    setLiveTranscripts([]);
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

        const res = await apiFetch("/api/join", {
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
      const demoTranscriptEntries: TranscriptEntry[] = [
        {
          id: `demo-tr-1-${Date.now()}`,
          speaker: user?.name || "Alex Morgan",
          role: "Speaker",
          text: "Hi team, let's review the architectural items and sync on delivery schedules.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          avatarColor: "#2563eb",
        },
        {
          id: `demo-tr-2-${Date.now()}`,
          speaker: "MeetMinutes AI Agent",
          role: "Assistant",
          text: "Meeting bot initialized. Voice transcribed audio streams are active and streaming live.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          avatarColor: "#10b981",
        },
      ];
      setLiveTranscripts(demoTranscriptEntries);
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
        await apiFetch("/api/leave", { method: "POST", headers });
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
  const handleSelectMeeting = (meeting: MeetingRecord, tab: "attendance" | "minutes" = "minutes") => {
    setSelectedMeeting(meeting);
    setDrawerInitialTab(tab);
    setCurrentView("meeting-detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    if (selectedMeeting?.id === meetingId) {
      setSelectedMeeting(null);
      if (currentView === "meeting-detail") {
        setCurrentView("dashboard");
      }
    }

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await apiFetch(`/api/meetings/${meetingId}`, {
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
        await apiFetch("/api/meetings", {
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
      await apiFetch(`/api/meetings/${meetingId}/actions/${actionId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ completed: nextCompleted }),
      });
    } catch (err) {
      console.warn("Failed to sync action item to backend:", err);
    }
  };

  /* ── Handle Google Sign-In Success ──────────────────────────── */
  const handleGoogleSuccess = async (credential: string) => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await apiFetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Google authentication failed. Please try again.");
        setAuthLoading(false);
        return;
      }

      localStorage.setItem("auth_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setShowAuthModal(false);
      setCurrentView("dashboard");
      setAuthError(null);
      setNotification(`Welcome, ${data.user.name || "User"}!`);
    } catch (err: any) {
      console.error("Google auth request error:", err);
      setAuthError("Failed to connect to authentication server. Please check your network.");
    } finally {
      setAuthLoading(false);
    }
  };

  /* ── Continue As Guest ─────────────────────────────────────── */
  const handleContinueAsGuest = () => {
    setShowAuthModal(false);
    setCurrentView("dashboard");
    setNotification("Continuing as Guest. You can sign in with Google anytime.");
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setCurrentView("auth");
    setNotification("Signed out successfully.");
  };

  return (
    <div className={`dashboard-container ${currentView === "meeting-detail" ? "meeting-view-active" : ""}`}>
      {/* ── Notification Banner ──────────────────────────── */}
      {notification && (
        <aside className="toast-notification" role="status" aria-live="polite">
          <Sparkles className="toast-icon" />
          <span className="toast-text">{notification}</span>
          <button
            className="toast-close"
            onClick={() => setNotification(null)}
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </aside>
      )}

      {/* ── Top Navigation Bar ────────────────────────────── */}
      <header className="top-navbar">
        <div className="nav-brand" onClick={() => setCurrentView("dashboard")} style={{ cursor: "pointer" }}>
          <div className="brand-logo-badge">
            <Bot className="brand-icon-svg" />
          </div>
          <div className="brand-text-col">
            <h1 className="brand-title">
              Meet<span className="brand-accent">Minutes</span>
              <span className="brand-tld">.ai</span>
            </h1>
            <span className="brand-subtitle">Your AI Meeting Companion</span>
          </div>
        </div>

        {/* Center Tabs: Dashboard, Meetings, Groups, Calendar */}
        <nav className="nav-center-tabs">
          <button
            type="button"
            className={`nav-tab-item ${currentView === "dashboard" && !selectedMeeting ? "active" : ""}`}
            onClick={() => {
              setSelectedMeeting(null);
              setCurrentView("dashboard");
            }}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`nav-tab-item ${currentView === "meeting-detail" ? "active" : ""}`}
            onClick={() => {
              if (selectedMeeting) {
                setCurrentView("meeting-detail");
              } else if (meetings.length > 0) {
                setSelectedMeeting(meetings[0]);
                setCurrentView("meeting-detail");
              }
            }}
          >
            Meetings
          </button>
          <button
            type="button"
            className="nav-tab-item"
            onClick={() => {
              setCurrentView("dashboard");
              setTimeout(() => {
                document.getElementById("groups-section")?.scrollIntoView({ behavior: "smooth" });
              }, 100);
            }}
          >
            Groups
          </button>
          <button
            type="button"
            className="nav-tab-item"
            onClick={() => setNotification("Calendar synchronization connected to Google Calendar.")}
          >
            Calendar
          </button>
        </nav>

        {/* Right Status Indicators & User Profile */}
        <div className="nav-actions">
          {/* Ask AI trigger */}
          <button
            className="nav-tab-item"
            onClick={() => handleOpenAskAi()}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            title="Ask AI questions across meeting minutes & decisions"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Ask AI</span>
          </button>

          {/* Live Agent Pill */}
          <div className="live-agent-pill">
            <span className="live-agent-dot" />
            <span>Live Agent</span>
          </div>

          {/* Theme Toggle Button (Light / Dark) */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={handleToggleTheme}
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            aria-label="Toggle light and dark mode"
          >
            {theme === "light" ? (
              <Moon className="theme-toggle-icon moon-icon" />
            ) : (
              <Sun className="theme-toggle-icon sun-icon" />
            )}
          </button>

          {/* Notification Bell */}
          <button
            type="button"
            className="nav-icon-btn"
            title="Notifications"
            onClick={() => setNotification("All meeting agent services are operational.")}
          >
            <Bell className="w-4 h-4 text-slate-500" />
          </button>

          {/* User Profile Menu */}
          {user ? (
            <div className="nav-user-pill" onClick={handleLogout} title="Click to Sign Out">
              <div className="user-avatar-circle overflow-hidden flex items-center justify-center">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : user.name ? (
                  user.name[0].toUpperCase()
                ) : (
                  "G"
                )}
              </div>
              <span className="user-name-label">{user.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          ) : (
            <div
              className="nav-user-pill"
              onClick={() => setShowAuthModal(true)}
              title="Click to Sign In with Google"
            >
              <div className="user-avatar-circle">G</div>
              <span className="user-name-label">Guest</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout Body ──────────────────────────────── */}
      {currentView === "auth" ? (
        <div className="auth-page-container">
          <div className="auth-card-wrapper">
            <div className="auth-header-block">
              <div className="auth-logo-badge">
                <Bot className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="auth-title">
                Meet<span className="brand-accent">Minutes</span>
                <span className="brand-tld">.ai</span>
              </h2>
              <p className="auth-subtitle">
                Sign in with Google to deploy automated meeting bots, audit attendance, and access AI minutes.
              </p>
              <div className="auth-features-preview">
                <span className="auth-feature-tag">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Live Bot
                </span>
                <span className="auth-feature-tag">
                  <Users className="w-3.5 h-3.5 text-emerald-400" /> Attendance Audit
                </span>
                <span className="auth-feature-tag">
                  <FileText className="w-3.5 h-3.5 text-cyan-400" /> Executive Minutes
                </span>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {authError && (
                <div className="form-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <GoogleSignInButton
                text="continue_with"
                onSuccess={handleGoogleSuccess}
                onError={(err) => setAuthError(err)}
                disabled={authLoading}
              />

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="guest-continue-btn"
                onClick={handleContinueAsGuest}
              >
                <span>Continue as Guest</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : currentView === "meeting-detail" && selectedMeeting ? (
        <main className="dashboard-content">
          <MeetingDetailPage
            meeting={selectedMeeting}
            onBack={() => setCurrentView("dashboard")}
            onToggleActionItem={handleToggleActionItem}
            onOpenAskAi={handleOpenAskAi}
            initialTab={drawerInitialTab}
            liveTranscript={liveTranscripts}
            botStatus={status}
          />
        </main>
      ) : (
        <main className="dashboard-content">
          {/* ── Join Meeting Command Center ─────────────────── */}
          <section className="join-hero-card" aria-label="Meeting Controls">
            <div className="hero-header">
              <div className="hero-title-group">
                <span className="hero-badge">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Autonomous Agent
                </span>
                <h2 className="hero-heading">Join Google Meet Room</h2>
                <p className="hero-tagline">
                  Deploy your AI agent to join calls, transcribe audio in real time, record attendee presence, and compile structured executive minutes.
                </p>
              </div>

              {status !== "idle" && (
                <div className="live-meeting-indicator">
                  <span className="live-pulse-dot" />
                  <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
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
                <Link2 className="input-icon-svg" />
                <input
                  id="meeting-url"
                  type="url"
                  className="meet-url-input"
                  placeholder="Paste Google Meet link (e.g. https://meet.google.com/abc-defg-hij)"
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
                    type="button"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    className="input-paste-btn"
                    onClick={handlePasteClipboard}
                    title="Paste from clipboard"
                    type="button"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>Paste</span>
                  </button>
                )}
              </div>

              {status === "idle" ? (
                <button
                  id="join-btn"
                  className="btn-join-primary"
                  disabled={!isValidUrl}
                  onClick={() => handleJoin()}
                >
                  <Play className="btn-icon-svg fill-current" />
                  <span>Join &amp; Record</span>
                </button>
              ) : (
                <button id="leave-btn" className="btn-leave-danger" onClick={handleLeave}>
                  <Square className="btn-icon-svg fill-current" />
                  <span>Leave &amp; Finalize ({formatDuration(elapsedSeconds)})</span>
                </button>
              )}
            </div>

            {/* Hints & Errors */}
            {url && !isValidUrl && (
              <p className="field-hint field-hint-error">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 inline mr-1" />
                Please enter a valid Google Meet link (format: https://meet.google.com/xxx-xxxx-xxx)
              </p>
            )}
            {error && (
              <p className="field-hint field-hint-error">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 inline mr-1" />
                {error}
              </p>
            )}

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
                      : "MeetMinutes bot is actively capturing audio and monitoring participant attendance."}
                  </span>
                  <span className="session-info-sub">
                    When the meeting concludes, click &quot;Leave &amp; Finalize&quot; to compile your minutes and generate PDF documentation.
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
                {showLogsConsole ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Agent System Logs ({logs.length} events)</span>
              </button>
              {logs.length > 0 && showLogsConsole && (
                <button className="btn-logs-clear" onClick={() => setLogs([])}>
                  <Trash2 className="w-3 h-3" />
                  <span>Clear logs</span>
                </button>
              )}
            </div>

            {/* Collapsible Log Console */}
            {showLogsConsole && (
              <div className="logs-console-box">
                {logs.length === 0 ? (
                  <p className="log-empty-msg">No logs generated yet. Join a meeting to view real-time events.</p>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-prefix">&gt;</span>
                      <span className="log-text">{line}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </section>

          {/* ── Collaboration Groups & Workspaces ───────────── */}
          <GroupSection
            token={token}
            currentUser={user}
            botStatus={status}
            onJoinMeeting={(meetUrl) => handleJoin(meetUrl)}
            onOpenAuthModal={() => {
              setShowAuthModal(true);
            }}
          />

          {/* ── Meeting History Section ─────────────────────── */}
          <MeetingHistory
            meetings={meetings}
            onSelectMeeting={handleSelectMeeting}
            onDeleteMeeting={handleDeleteMeeting}
            onRestoreDefaults={handleRestoreDefaults}
            onOpenAskAi={handleOpenAskAi}
          />
        </main>
      )}

      {/* ── Ask My Meetings AI RAG Modal ──────────────────── */}
      <AskMeetingsModal
        isOpen={isAskAiOpen}
        onClose={() => setIsAskAiOpen(false)}
        meetings={meetings}
        token={token}
        currentUser={user}
        onSelectMeeting={(m) => {
          setSelectedMeeting(m);
          setDrawerInitialTab("minutes");
          setCurrentView("meeting-detail");
          setIsAskAiOpen(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        initialMeetingId={askAiMeetingId}
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
              <X className="w-4 h-4" />
            </button>

            <div className="auth-header-block pt-6 px-6 pb-2 text-center">
              <div className="auth-logo-badge mx-auto mb-3">
                <Bot className="w-7 h-7 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-100">
                Sign in to MeetMinutes.ai
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Access your meetings, collaboration groups, and team intelligence
              </p>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {authError && (
                <div className="form-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <GoogleSignInButton
                text="continue_with"
                onSuccess={handleGoogleSuccess}
                onError={(err) => setAuthError(err)}
                disabled={authLoading}
              />

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="guest-continue-btn"
                onClick={handleContinueAsGuest}
              >
                <span>Continue as Guest</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="footer-bar">
        <p className="footer-text">
          MeetMinutes.ai &middot; Enterprise Meeting Intelligence &middot; Automated Transcripts &amp; Attendance
        </p>
      </footer>
    </div>
  );
}

export default App;

