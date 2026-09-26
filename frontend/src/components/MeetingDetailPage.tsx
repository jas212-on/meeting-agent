import { useState, useRef, useEffect, useMemo } from "react";
import type { MeetingRecord, TranscriptEntry } from "../types";
import { generateMeetingMinutesPDF } from "../utils/pdfGenerator";
import { generateFallbackTranscript } from "../utils/mockData";
import { consolidateTranscripts } from "../utils/transcriptUtils";
import {
  ArrowLeft,
  LayoutDashboard,
  FileText,
  ListTodo,
  Users,
  Sparkles,
  Download,
  Copy,
  Check,
  Calendar,
  Clock,
  Target,
  CheckCircle2,
  ExternalLink,
  Send,
  Bot,
  BarChart3,
  Sliders,
  CheckSquare,
  Share2,
  AlignLeft,
  Search,
  Video,
  Play,
} from "lucide-react";

type ActiveSection = "overview" | "minutes" | "actions" | "attendance" | "transcript" | "ai" | "recording";

interface MeetingDetailPageProps {
  meeting: MeetingRecord;
  onBack: () => void;
  onToggleActionItem?: (meetingId: string, actionId: string) => void;
  onOpenAskAi?: (meetingId: string) => void;
  initialTab?: "minutes" | "attendance" | "transcript";
  liveTranscript?: TranscriptEntry[];
  botStatus?: "idle" | "joining" | "running";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "N/A";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function GoogleDriveIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 10.15z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.4-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 47.9-13.75-23.8-13.75 23.8h27.5z" fill="#2684fc"/>
      <path d="m73.4 53.05-14.7-25.45-13.75 23.8 14.7 25.4h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

function GoogleMeetIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m87.3 17.6-21.8 16.3v-19.6c0-4.6-3.7-8.3-8.3-8.3h-43.6c-4.6 0-8.3 3.7-8.3 8.3v49.4c0 4.6 3.7 8.3 8.3 8.3h43.6c4.6 0 8.3-3.7 8.3-8.3v-19.6l21.8 16.3c2.4 1.8 4.7.1 4.7-2.9v-37.2c0-3-2.3-4.7-4.7-2.6z" fill="#00832d" />
      <path d="m65.5 44.1 21.8 16.3c2.4 1.8 4.7.1 4.7-2.9v-24.8l-26.5 11.4z" fill="#0066da" />
      <path d="m65.5 14.3v19.6l21.8-16.3c2.4-1.8 4.7-.1 4.7 2.9v-6.2c0-3-2.3-4.7-4.7-2.6z" fill="#e94235" />
      <path d="m5.3 14.3c0-4.6 3.7-8.3 8.3-8.3h43.6c4.6 0 8.3 3.7 8.3 8.3v19.6l-30.1-13.1-30.1 13.1v-19.6z" fill="#2684fc" />
      <path d="m5.3 33.9v29.8c0 4.6 3.7 8.3 8.3 8.3h43.6c4.6 0 8.3-3.7 8.3-8.3v-19.6l-30.1 13.1z" fill="#00ac47" />
      <path d="m65.5 33.9-30.1 13.1 30.1 13.1z" fill="#00aa47" />
      <path d="m65.5 33.9 21.8-16.3c-1.3-.9-2.9-1.2-4.5-.6l-17.3 16.9z" fill="#ffba00" />
    </svg>
  );
}

export function MeetingDetailPage({
  meeting,
  onBack,
  onToggleActionItem,
  initialTab = "minutes",
  liveTranscript,
  botStatus,
}: MeetingDetailPageProps) {
  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    if (initialTab === "attendance") return "attendance";
    if (initialTab === "transcript") return "transcript";
    return "overview";
  });

  const [copiedLink, setCopiedLink] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionFilter, setActionFilter] = useState<"all" | "pending" | "completed">("all");
  const [expandedAttendeeId, setExpandedAttendeeId] = useState<string | null>(null);

  // Transcript state hooks
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isLiveMeeting = meeting.status === "in-progress" || botStatus === "running" || botStatus === "joining";

  const baseTranscripts = useMemo(() => {
    const raw = (meeting.transcript && meeting.transcript.length > 0)
      ? meeting.transcript
      : generateFallbackTranscript(meeting);
    return consolidateTranscripts(raw);
  }, [meeting]);

  const combinedTranscripts = useMemo(() => {
    if (!liveTranscript || liveTranscript.length === 0) return baseTranscripts;
    const ids = new Set(baseTranscripts.map((t) => t.id));
    const merged = [...baseTranscripts];
    for (const item of liveTranscript) {
      if (!ids.has(item.id)) {
        merged.push(item);
        ids.add(item.id);
      }
    }
    return consolidateTranscripts(merged);
  }, [baseTranscripts, liveTranscript]);

  const filteredTranscripts = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return combinedTranscripts;
    return combinedTranscripts.filter(
      (t) => t.speaker.toLowerCase().includes(q) || t.text.toLowerCase().includes(q)
    );
  }, [combinedTranscripts, transcriptSearch]);

  useEffect(() => {
    if (autoScroll && activeSection === "transcript") {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedTranscripts, autoScroll, activeSection]);

  const handleCopyTranscript = () => {
    const text = combinedTranscripts
      .map((t) => `[${t.timestamp}] ${t.speaker} (${t.role}):\n${t.text}\n`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleDownloadTranscriptTxt = () => {
    const text = `${meeting.title}\nDate: ${meeting.date} | Duration: ${meeting.duration}\nMeeting ID: ${meeting.id}\n${"=".repeat(60)}\n\n` +
      combinedTranscripts
        .map((t) => `[${t.timestamp}] ${t.speaker} (${t.role}):\n${t.text}\n`)
        .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `transcript-${meeting.id}.txt`;
    link.click();
    URL.revokeObjectURL(fileUrl);
  };

  // Inline AI Chat state
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-ai",
      role: "assistant",
      content: `Hello! I have analyzed the transcript and minutes for **"${meeting.title}"**.\n\nAsk me anything specific about what was discussed, decisions made, or action items assigned!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSection === "ai") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiMessages, aiLoading, activeSection]);

  const formatSecs = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${mins}m ${rem < 10 ? "0" + rem : rem}s` : `${mins}m 00s`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(meeting.url || window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadPDF = () => {
    setDownloading(true);
    try {
      generateMeetingMinutesPDF(meeting);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setTimeout(() => setDownloading(false), 600);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "Name",
      "Role",
      "Attendance",
      "Join Time",
      "Leave Time",
      "Duration",
    ];

    const rows = meeting.attendees.map((att) => [
      `"${att.name}"`,
      `"${att.role || "Attendee"}"`,
      `"${att.status || "Present"}"`,
      `"${att.joinedAt || "10:00 AM"}"`,
      `"${att.leftAt || "10:02 AM"}"`,
      `"${att.totalDurationSeconds ? formatSecs(att.totalDurationSeconds) : meeting.duration}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${meeting.id}_attendance_log.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAiSend = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || aiLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setAiQuery("");
    setAiLoading(true);

    try {
      const history = aiMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat/ask-meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          question: trimmed,
          meetingId: meeting.id,
          history,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: data.answer || "I could not find a relevant answer in the meeting minutes.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      let fallback = `Based on ${meeting.title}: ${meeting.minutes.summary}`;
      const qLower = trimmed.toLowerCase();
      if (qLower.includes("action") || qLower.includes("task")) {
        fallback = meeting.minutes.actionItems.length > 0
          ? `Action items from ${meeting.title}:\n` + meeting.minutes.actionItems.map(a => `• ${a.task} (${a.assignee || "Unassigned"})`).join("\n")
          : `No action items were recorded in ${meeting.title}.`;
      } else if (qLower.includes("decision") || qLower.includes("outcome")) {
        fallback = meeting.minutes.keyDecisions.length > 0
          ? `Key decisions:\n` + meeting.minutes.keyDecisions.map(d => `• ${d}`).join("\n")
          : `No explicit key decisions were recorded for ${meeting.title}.`;
      }
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: fallback,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const presentCount = meeting.attendees.filter((a) => a.status === "Present" || !a.status).length;
  const attendanceRate = meeting.attendees.length > 0
    ? Math.round((presentCount / meeting.attendees.length) * 100)
    : 100;
  const completedActionsCount = meeting.minutes.actionItems.filter((a) => a.completed).length;
  const totalActionsCount = meeting.minutes.actionItems.length;
  const actionCompletionRate = totalActionsCount > 0
    ? Math.round((completedActionsCount / totalActionsCount) * 100)
    : 0;

  const filteredActionItems = meeting.minutes.actionItems.filter((item) => {
    if (actionFilter === "pending") return !item.completed;
    if (actionFilter === "completed") return item.completed;
    return true;
  });

  return (
    <div className="meeting-page-container">
      {/* ══════════════════════════════════════════════════════
          LEFT SIDEBAR (Light Enterprise)
         ══════════════════════════════════════════════════════ */}
      <aside className="meeting-sidebar">
        {/* Back to Dashboard link */}
        <button className="back-link-btn" onClick={onBack} type="button">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        {/* Meeting Identity White Card */}
        <div className="sidebar-white-card">
          <div className="sidebar-meet-top">
            <GoogleMeetIcon className="w-6 h-6" />
            <span className="status-pill-green">Completed</span>
          </div>

          <h2 className="sidebar-meet-title">
            {meeting.title}
          </h2>

          <div className="sidebar-meta-line">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{meeting.date}</span>
          </div>

          <div className="sidebar-meta-line">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{meeting.duration}</span>
          </div>

          {meeting.url && (
            <a
              href={meeting.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-open-meet"
              title="Open in Google Meet"
            >
              <span>Open in Google Meet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Navigation Section Menu */}
        <div className="sidebar-group-label">Meeting</div>
        <nav className="sidebar-menu-list" aria-label="Meeting Navigation">
          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "overview" ? "active" : ""}`}
            onClick={() => setActiveSection("overview")}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="menu-item-text">Overview &amp; Stats</span>
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "minutes" ? "active" : ""}`}
            onClick={() => setActiveSection("minutes")}
          >
            <FileText className="w-4 h-4" />
            <span className="menu-item-text">Minutes &amp; Topics</span>
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "actions" ? "active" : ""}`}
            onClick={() => setActiveSection("actions")}
          >
            <ListTodo className="w-4 h-4" />
            <span className="menu-item-text">Action Items</span>
            <span className="menu-badge-count">{meeting.minutes.actionItems.length}</span>
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "attendance" ? "active" : ""}`}
            onClick={() => setActiveSection("attendance")}
          >
            <Users className="w-4 h-4" />
            <span className="menu-item-text">Attendance</span>
            <span className="menu-badge-count">{meeting.attendees.length}</span>
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "transcript" ? "active" : ""}`}
            onClick={() => setActiveSection("transcript")}
          >
            <AlignLeft className="w-4 h-4" />
            <span className="menu-item-text">Transcript</span>
            {isLiveMeeting ? (
              <span className="live-mini-pill" title="Live audio stream active">
                LIVE
              </span>
            ) : combinedTranscripts.length > 0 ? (
              <span className="menu-badge-count">{combinedTranscripts.length}</span>
            ) : null}
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "ai" ? "active" : ""}`}
            onClick={() => setActiveSection("ai")}
          >
            <Sparkles className="w-4 h-4" />
            <span className="menu-item-text">Ask Meeting AI</span>
          </button>

          <button
            type="button"
            className={`sidebar-menu-item ${activeSection === "recording" ? "active" : ""}`}
            onClick={() => setActiveSection("recording")}
          >
            <Video className="w-4 h-4" />
            <span className="menu-item-text">Screen Recording</span>
            {meeting.recording?.status === "ready" || meeting.recording?.status === "uploaded" ? (
              <span className="live-mini-pill" style={{ background: "#10b981", color: "#fff", fontSize: "10px", padding: "2px 6px" }}>
                HD
              </span>
            ) : meeting.recording?.status === "uploading" ? (
              <span className="live-mini-pill" style={{ background: "#f59e0b", color: "#fff", fontSize: "10px", padding: "2px 6px" }}>
                SYNC
              </span>
            ) : null}
          </button>
        </nav>

        {/* Quick Export & Share Section */}
        <div className="sidebar-group-label">Export &amp; Share</div>
        <div className="sidebar-export-group">
          <button
            type="button"
            className="btn-primary-blue"
            onClick={handleDownloadPDF}
            disabled={downloading}
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? "Generating PDF…" : "Export PDF"}</span>
          </button>

          <div className="sidebar-row-btns">
            <button
              type="button"
              className="btn-white-secondary"
              onClick={handleCopyLink}
              title="Copy meeting link"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-white-secondary"
              onClick={handleExportCSV}
              title="Download attendee log as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV Log</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT CANVAS (Light Enterprise)
         ══════════════════════════════════════════════════════ */}
      <main className="meeting-main-canvas">
        {/* Top Breadcrumb Header Bar */}
        <div className="canvas-top-row">
          <div className="canvas-breadcrumbs">
            <span className="crumb-part" onClick={onBack}>Dashboard</span>
            <span>/</span>
            <span className="crumb-part" onClick={onBack}>Meetings</span>
            <span>/</span>
            <span className="crumb-part" onClick={() => setActiveSection("overview")}>{meeting.id}</span>
            <span>/</span>
            <span className="crumb-current">
              {activeSection === "overview" && "Overview"}
              {activeSection === "minutes" && "Minutes & Topics"}
              {activeSection === "actions" && "Action Items"}
              {activeSection === "attendance" && "Attendance"}
              {activeSection === "transcript" && "Transcript"}
              {activeSection === "ai" && "Ask AI"}
            </span>
          </div>

          <div className="canvas-top-actions">
            <button
              type="button"
              className="btn-white-secondary"
              onClick={handleCopyLink}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? "Link Copied" : "Share"}</span>
            </button>

            <button
              type="button"
              className="btn-primary-blue"
              onClick={handleDownloadPDF}
              disabled={downloading}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 1: OVERVIEW & STATS (Matching Screenshot)
           ══════════════════════════════════════════════════════ */}
        {activeSection === "overview" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Section Heading Banner */}
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Overview &amp; Stats</h1>
                <p className="section-sub-heading">A summary of your meeting, key insights, and participant details.</p>
              </div>
            </div>

            {/* 4 KPI Overview Cards */}
            <div className="kpi-cards-grid">
              {/* Card 1: Recorded Participants */}
              <div className="kpi-white-card">
                <div className="kpi-circle-icon blue">
                  <Users className="w-5 h-5" />
                </div>
                <div className="kpi-card-content">
                  <span className="kpi-card-val">{meeting.attendees.length}</span>
                  <span className="kpi-card-label">Recorded Participants</span>
                </div>
              </div>

              {/* Card 2: Full Attendance */}
              <div className="kpi-white-card">
                <div className="kpi-circle-icon green">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="kpi-card-content">
                  <span className="kpi-card-val">{presentCount}</span>
                  <span className="kpi-card-label">Full Attendance ({attendanceRate}%)</span>
                </div>
              </div>

              {/* Card 3: Actions Completed */}
              <div className="kpi-white-card">
                <div className="kpi-circle-icon amber">
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="kpi-card-content">
                  <span className="kpi-card-val">{completedActionsCount}/{totalActionsCount}</span>
                  <span className="kpi-card-label">Actions Completed ({actionCompletionRate}%)</span>
                </div>
              </div>

              {/* Card 4: Key Decisions */}
              <div className="kpi-white-card">
                <div className="kpi-circle-icon cyan">
                  <Target className="w-5 h-5" />
                </div>
                <div className="kpi-card-content">
                  <span className="kpi-card-val">{meeting.minutes.keyDecisions.length}</span>
                  <span className="kpi-card-label">Key Decisions</span>
                </div>
              </div>
            </div>

            {/* Quick Recording Banner if available */}
            {meeting.recording && (meeting.recording.status === "ready" || meeting.recording.status === "uploaded" || meeting.recording.localUrl || meeting.recording.driveUrl) && (
              <div className="overview-recording-banner">
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div className="rec-banner-icon">
                    <Video className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 600, color: "#1e293b" }}>
                      Meeting Screen Recording Available
                    </h4>
                    <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "#64748b" }}>
                      Watch HD video playback of screens and presentations recorded live during this session.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {meeting.recording.driveUrl && (
                    <a
                      href={meeting.recording.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-drive-link-sm"
                      style={{ textDecoration: "none" }}
                    >
                      <GoogleDriveIcon className="w-3.5 h-3.5" />
                      <span>Drive Link</span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-primary-blue"
                    onClick={() => setActiveSection("recording")}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Watch Recording</span>
                  </button>
                </div>
              </div>
            )}

            {/* Summary Card */}
            <div className="white-panel-card">
              <div className="panel-card-header">
                <div className="panel-header-icon">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="panel-card-title">Summary</h3>
              </div>
              <p className="panel-body-p">
                {meeting.minutes.summary || "The meeting consisted of a brief introductory exchange between participants. No substantive business topics were discussed, and no decisions or action items were established."}
              </p>
            </div>

            {/* 2-Column: Key Decisions & Action Items & Tasks */}
            <div className="two-col-cards-grid">
              {/* Left Column: Key Decisions */}
              <div className="white-panel-card">
                <div className="panel-card-header">
                  <div className="panel-header-icon circle">
                    <Target className="w-4 h-4" />
                  </div>
                  <h3 className="panel-card-title">Key Decisions</h3>
                </div>

                {meeting.minutes.keyDecisions.length === 0 ? (
                  <div className="empty-state-card">
                    <div className="empty-state-icon-box">
                      <FileText className="w-5 h-5" />
                    </div>
                    <p className="empty-state-msg">No explicit key decisions logged.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {meeting.minutes.keyDecisions.map((dec, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.5" }}>{dec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Action Items & Tasks */}
              <div className="white-panel-card">
                <div className="panel-card-header">
                  <div className="panel-header-icon circle">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <h3 className="panel-card-title">Action Items &amp; Tasks</h3>
                </div>

                {meeting.minutes.actionItems.length === 0 ? (
                  <div className="empty-state-card">
                    <div className="empty-state-icon-box">
                      <ListTodo className="w-5 h-5" />
                    </div>
                    <p className="empty-state-msg">No action items assigned in this meeting.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {meeting.minutes.actionItems.map((item) => (
                      <div
                        key={item.id}
                        style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", cursor: "pointer" }}
                        onClick={() => onToggleActionItem && onToggleActionItem(meeting.id, item.id)}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => onToggleActionItem && onToggleActionItem(meeting.id, item.id)}
                          style={{ width: "16px", height: "16px", accentColor: "#2563eb", marginTop: "2px", cursor: "pointer" }}
                        />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "13px", fontWeight: 500, color: item.completed ? "#94a3b8" : "#0f172a", textDecoration: item.completed ? "line-through" : "none" }}>
                            {item.task}
                          </span>
                          <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            Assignee: {item.assignee || "Unassigned"} {item.dueDate && `• Due: ${item.dueDate}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Participants Table Card */}
            <div className="white-panel-card">
              <div className="panel-card-header">
                <div className="panel-header-icon circle">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="panel-card-title">Participants</h3>
              </div>

              <div className="participants-table-wrap">
                <table className="data-table-clean">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Attendance</th>
                      <th>Join Time</th>
                      <th>Leave Time</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.attendees.map((att) => {
                      const joinTime = att.joinedAt || "10:00 AM";
                      const leaveTime = att.leftAt || "10:02 AM";
                      const totalSecs = att.totalDurationSeconds || (att.intervals && att.intervals.length > 0
                        ? att.intervals.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0)
                        : 122);
                      const dur = formatSecs(totalSecs);
                      const initial = att.name ? att.name[0].toUpperCase() : "U";

                      return (
                        <tr key={att.id}>
                          <td>
                            <div className="table-row-user">
                              <div className="table-avatar-circle">
                                {initial}
                              </div>
                              <span className="table-user-name">{att.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className="table-role-badge">{att.role || "Attendee"}</span>
                          </td>
                          <td>
                            <span className="attendance-status-live">
                              <span className="attendance-live-dot" />
                              <span>{att.status || "Present"}</span>
                            </span>
                          </td>
                          <td>{joinTime}</td>
                          <td>{leaveTime}</td>
                          <td>{dur}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 2: MINUTES & TOPICS
           ══════════════════════════════════════════════════════ */}
        {activeSection === "minutes" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <FileText className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Minutes &amp; Topics</h1>
                <p className="section-sub-heading">Detailed breakdown of discussion topics, takeaways, and formal outcomes.</p>
              </div>
            </div>

            {/* Executive Summary Card */}
            <div className="white-panel-card">
              <div className="panel-card-header">
                <div className="panel-header-icon">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="panel-card-title">Executive Summary</h3>
              </div>
              <p className="panel-body-p">
                {meeting.minutes.summary}
              </p>
            </div>

            {/* Discussion Topics */}
            <div className="white-panel-card">
              <div className="panel-card-header">
                <div className="panel-header-icon">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="panel-card-title">Chronological Discussion Topics</h3>
              </div>

              {meeting.minutes.discussionTopics.length === 0 ? (
                <div className="empty-state-card">
                  <div className="empty-state-icon-box">
                    <Clock className="w-5 h-5" />
                  </div>
                  <p className="empty-state-msg">No agenda topics were recorded for this session.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
                  {meeting.minutes.discussionTopics.map((topic, i) => (
                    <div key={i} style={{ display: "flex", gap: "14px", padding: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                      <span style={{ height: "fit-content", padding: "3px 8px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", color: "#2563eb", fontSize: "11px", fontWeight: 600 }}>
                        {topic.time}
                      </span>
                      <div>
                        <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                          {topic.topic}
                        </h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                          {topic.notes}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 3: ACTION ITEMS
           ══════════════════════════════════════════════════════ */}
        {activeSection === "actions" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <ListTodo className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Action Items &amp; Deliverables</h1>
                <p className="section-sub-heading">Track tasks, responsibilities, and completion milestones.</p>
              </div>
            </div>

            <div className="white-panel-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Task Completion Progress</h3>
                  <span style={{ fontSize: "12.5px", color: "#64748b" }}>{completedActionsCount} of {totalActionsCount} tasks finished ({actionCompletionRate}%)</span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(["all", "pending", "completed"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActionFilter(filter)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        background: actionFilter === filter ? "#2563eb" : "#f1f5f9",
                        color: actionFilter === filter ? "#ffffff" : "#475569",
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {filteredActionItems.length === 0 ? (
                <div className="empty-state-card" style={{ marginTop: "16px" }}>
                  <div className="empty-state-icon-box">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <p className="empty-state-msg">No tasks found matching the selected filter.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
                  {filteredActionItems.map((item) => (
                    <div
                      key={item.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", cursor: "pointer" }}
                      onClick={() => onToggleActionItem && onToggleActionItem(meeting.id, item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => onToggleActionItem && onToggleActionItem(meeting.id, item.id)}
                        style={{ width: "16px", height: "16px", accentColor: "#2563eb", marginTop: "2px", cursor: "pointer" }}
                      />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "13.5px", fontWeight: 500, color: item.completed ? "#94a3b8" : "#0f172a", textDecoration: item.completed ? "line-through" : "none" }}>
                          {item.task}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px", fontSize: "11.5px", color: "#64748b" }}>
                          <span>Assignee: <strong>{item.assignee || "Unassigned"}</strong></span>
                          {item.dueDate && <span>Due: <strong>{item.dueDate}</strong></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 4: ATTENDANCE AUDIT
           ══════════════════════════════════════════════════════ */}
        {activeSection === "attendance" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <Users className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Attendance Audit</h1>
                <p className="section-sub-heading">Detailed verification of participation, join/leave intervals, and speaking duration.</p>
              </div>
            </div>

            <div className="white-panel-card">
              <div className="participants-table-wrap">
                <table className="data-table-clean">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Attendance</th>
                      <th>Join Time</th>
                      <th>Leave Time</th>
                      <th>Duration</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.attendees.map((att) => {
                      const joinTime = att.joinedAt || "10:00 AM";
                      const leaveTime = att.leftAt || "10:02 AM";
                      const totalSecs = att.totalDurationSeconds || 122;
                      const isExpanded = expandedAttendeeId === att.id;

                      return (
                        <>
                          <tr key={att.id}>
                            <td>
                              <div className="table-row-user">
                                <div className="table-avatar-circle">
                                  {att.name ? att.name[0].toUpperCase() : "U"}
                                </div>
                                <span className="table-user-name">{att.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="table-role-badge">{att.role || "Attendee"}</span>
                            </td>
                            <td>
                              <span className="attendance-status-live">
                                <span className="attendance-live-dot" />
                                <span>{att.status || "Present"}</span>
                              </span>
                            </td>
                            <td>{joinTime}</td>
                            <td>{leaveTime}</td>
                            <td>{formatSecs(totalSecs)}</td>
                            <td>
                              <button
                                type="button"
                                style={{ background: "transparent", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                                onClick={() => setExpandedAttendeeId(isExpanded ? null : att.id)}
                              >
                                {isExpanded ? "Hide Logs ▲" : "View Logs ▼"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${att.id}-expanded`}>
                              <td colSpan={7} style={{ background: "#f8fafc", padding: "12px 18px" }}>
                                <div style={{ fontSize: "12px", color: "#475569" }}>
                                  <strong>Session Intervals:</strong>
                                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                    {(att.intervals && att.intervals.length > 0 ? att.intervals : [
                                      { joinedAt: joinTime, leftAt: leaveTime, durationSeconds: totalSecs }
                                    ]).map((interval, idx) => (
                                      <span key={idx}>
                                        Interval {idx + 1}: Joined at {interval.joinedAt}, Left at {interval.leftAt} ({formatSecs(interval.durationSeconds)})
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 5: TRANSCRIPT (Live Streaming & Verbatim Speech)
           ══════════════════════════════════════════════════════ */}
        {activeSection === "transcript" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <AlignLeft className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h1 className="section-main-heading">Meeting Transcript</h1>
                  {isLiveMeeting && (
                    <span className="transcript-live-pill">
                      <span className="live-pulse-dot" />
                      <span>LIVE TRANSCRIPTION</span>
                    </span>
                  )}
                </div>
                <p className="section-sub-heading">
                  {isLiveMeeting
                    ? "Live real-time spoken dialogue captured through the autonomous Google Meet audio bridge."
                    : "Full verbatim spoken dialogue recorded during the call with speaker identification and timestamps."}
                </p>
              </div>
            </div>

            {/* Live Streaming Audio Waveform Banner (shown when call is live) */}
            {isLiveMeeting && (
              <div className="live-audio-stream-card">
                <div className="live-audio-left">
                  <div className="live-wave-animation">
                    <span className="wave-bar bar-1" />
                    <span className="wave-bar bar-2" />
                    <span className="wave-bar bar-3" />
                    <span className="wave-bar bar-4" />
                    <span className="wave-bar bar-5" />
                  </div>
                  <div className="live-audio-text">
                    <strong>Autonomous Audio Stream Active</strong>
                    <span>Listening to Google Meet room • Real-time transcription is streaming</span>
                  </div>
                </div>
                <div className="live-audio-actions">
                  <button
                    type="button"
                    className={`btn-transcript-control ${autoScroll ? "active" : ""}`}
                    onClick={() => setAutoScroll(!autoScroll)}
                    title={autoScroll ? "Auto-scroll is on" : "Auto-scroll is paused"}
                  >
                    <span>Auto-scroll: {autoScroll ? "ON" : "PAUSED"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Transcript Toolbar */}
            <div className="transcript-toolbar-row">
              <div className="transcript-search-wrap">
                <Search className="transcript-search-icon" />
                <input
                  type="text"
                  className="transcript-search-input"
                  placeholder="Search transcript by speaker or keyword..."
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                />
                {transcriptSearch && (
                  <button
                    type="button"
                    className="transcript-search-clear"
                    onClick={() => setTranscriptSearch("")}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="transcript-toolbar-actions">
                <span className="transcript-turns-pill">
                  {filteredTranscripts.length} {filteredTranscripts.length === 1 ? "turn" : "turns"}
                </span>

                <button
                  type="button"
                  className="btn-transcript-action"
                  onClick={handleCopyTranscript}
                  title="Copy full transcript to clipboard"
                >
                  {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTranscript ? "Copied!" : "Copy"}</span>
                </button>

                <button
                  type="button"
                  className="btn-transcript-action"
                  onClick={handleDownloadTranscriptTxt}
                  title="Download transcript as .TXT file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export TXT</span>
                </button>
              </div>
            </div>

            {/* Dialogue Turns List */}
            <div className="transcript-stream-container">
              {filteredTranscripts.length === 0 ? (
                <div className="transcript-empty-state">
                  <AlignLeft className="w-8 h-8 text-slate-400" />
                  <p>No speech turns match your filter <strong>"{transcriptSearch}"</strong>.</p>
                  <button
                    type="button"
                    className="btn-white-secondary"
                    onClick={() => setTranscriptSearch("")}
                    style={{ width: "fit-content", marginTop: "8px" }}
                  >
                    Clear Filter
                  </button>
                </div>
              ) : (
                <div className="transcript-turns-list">
                  {filteredTranscripts.map((entry, idx) => {
                    const isBot = entry.role === "Assistant" || entry.speaker.toLowerCase().includes("agent") || entry.speaker.toLowerCase().includes("assistant");
                    const roleColor = isBot
                      ? "role-badge-assistant"
                      : entry.role === "Host"
                      ? "role-badge-host"
                      : "role-badge-speaker";

                    return (
                      <div
                        key={entry.id || idx}
                        className={`transcript-turn-card ${isBot ? "bot-turn" : "speaker-turn"}`}
                      >
                        <div
                          className="table-avatar-circle"
                          style={{
                            background: entry.avatarColor || (isBot ? "#10b981" : "#2563eb"),
                            flexShrink: 0,
                          }}
                        >
                          {entry.speaker[0].toUpperCase()}
                        </div>

                        <div className="transcript-turn-body">
                          <div className="transcript-turn-header">
                            <div className="transcript-speaker-meta">
                              <strong className="transcript-speaker-name">{entry.speaker}</strong>
                              <span className={`transcript-role-badge ${roleColor}`}>
                                {entry.role || (isBot ? "Assistant" : "Speaker")}
                              </span>
                            </div>
                            <span className="transcript-turn-time">{entry.timestamp}</span>
                          </div>

                          <p className="transcript-turn-text">{entry.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION 6: ASK MEETING AI
           ══════════════════════════════════════════════════════ */}
        {activeSection === "ai" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="canvas-section-header">
              <div className="section-icon-box">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Ask Meeting AI</h1>
                <p className="section-sub-heading">Ask questions directly about discussions, tasks, decisions, and attendees from this session.</p>
              </div>
            </div>

            <div className="white-panel-card" style={{ display: "flex", flexDirection: "column", minHeight: "480px" }}>
              {/* Message Stream */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "16px" }}>
                {aiMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <div className="table-avatar-circle" style={{ background: "#2563eb", width: "30px", height: "30px", fontSize: "11px", flexShrink: 0 }}>
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: "12px",
                        background: msg.role === "user" ? "#2563eb" : "#f1f5f9",
                        color: msg.role === "user" ? "#ffffff" : "#0f172a",
                        fontSize: "13.5px",
                        lineHeight: "1.55",
                      }}
                    >
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                      <span style={{ fontSize: "10px", opacity: 0.7, marginTop: "4px", display: "block" }}>{msg.timestamp}</span>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: "flex", gap: "10px", alignSelf: "flex-start" }}>
                    <div className="table-avatar-circle" style={{ background: "#2563eb", width: "30px", height: "30px" }}>
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#f1f5f9", fontSize: "13px", color: "#64748b" }}>
                      Consulting meeting records with Groq…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Prompt Chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "10px 0", borderTop: "1px solid #e2e8f0" }}>
                {[
                  "What were the key decisions in this meeting?",
                  "Who has pending action items?",
                  "Summarize this session in 3 executive bullet points."
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAiSend(chip)}
                    disabled={aiLoading}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "9999px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#2563eb",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer"
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAiSend(aiQuery);
                }}
                style={{ display: "flex", gap: "8px", marginTop: "8px" }}
              >
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Ask a question about this meeting..."
                  disabled={aiLoading}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13.5px",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!aiQuery.trim() || aiLoading}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "8px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            SECTION: SCREEN RECORDING & PLAYBACK
           ══════════════════════════════════════════════════════ */}
        {activeSection === "recording" && (
          <div className="canvas-body fade-in-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Section Header */}
            <div className="canvas-section-header">
              <div className="section-icon-box" style={{ background: "#fef3c7", color: "#d97706" }}>
                <Video className="w-5 h-5" />
              </div>
              <div className="section-title-col">
                <h1 className="section-main-heading">Meeting Screen Recording</h1>
                <p className="section-sub-heading">High-definition video playback captured live by your meeting bot.</p>
              </div>

              {/* Action Buttons: Google Drive / Download */}
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
                {meeting.recording?.driveUrl && (
                  <a
                    href={meeting.recording.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-drive-link"
                    style={{ textDecoration: "none" }}
                  >
                    <GoogleDriveIcon className="w-4 h-4" />
                    <span>Open in Google Drive</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {meeting.recording?.localUrl && (
                  <a
                    href={meeting.recording.localUrl}
                    download={meeting.recording.fileName || `meeting-${meeting.id}.webm`}
                    className="btn-outline-gray"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </a>
                )}
              </div>
            </div>

            {meeting.recording && (meeting.recording.status === "ready" || meeting.recording.status === "uploaded" || meeting.recording.localUrl || meeting.recording.driveUrl) ? (
              <div className="white-panel-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
                {/* Status Badges Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="status-pill-green" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready for Playback</span>
                    </span>
                    {meeting.recording.driveUrl ? (
                      <span className="drive-synced-badge">
                        <GoogleDriveIcon className="w-3.5 h-3.5" />
                        <span>Google Drive Synced</span>
                      </span>
                    ) : meeting.recording.status === "uploading" ? (
                      <span className="drive-uploading-badge">
                        <GoogleDriveIcon className="w-3.5 h-3.5 animate-pulse" />
                        <span>Uploading to Drive...</span>
                      </span>
                    ) : (
                      <span className="local-storage-badge">
                        <span>Local HD Storage</span>
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "16px", color: "#64748b", fontSize: "13px" }}>
                    <span><strong>Duration:</strong> {meeting.recording.durationSeconds ? `${Math.floor(meeting.recording.durationSeconds / 60)}m ${meeting.recording.durationSeconds % 60}s` : meeting.duration}</span>
                    {meeting.recording.fileSizeBytes ? (
                      <span><strong>Size:</strong> {formatBytes(meeting.recording.fileSizeBytes)}</span>
                    ) : null}
                    <span><strong>Resolution:</strong> 720p HD</span>
                  </div>
                </div>

                {/* Video Player */}
                <div className="video-player-container">
                  <video
                    controls
                    preload="metadata"
                    className="screen-recording-video"
                    src={meeting.recording.localUrl || meeting.recording.driveUrl}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Google Drive Direct Share Banner */}
                {meeting.recording.driveUrl && (
                  <div className="drive-share-callout">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <GoogleDriveIcon className="w-6 h-6 flex-shrink-0" />
                      <div>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>
                          Shared on Google Drive
                        </h4>
                        <p style={{ margin: "2px 0 0 0", fontSize: "12.5px", color: "#64748b" }}>
                          Anyone with this Google Drive link can stream or download this recording.
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn-outline-gray"
                        onClick={() => {
                          if (meeting.recording?.driveUrl) {
                            navigator.clipboard.writeText(meeting.recording.driveUrl);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }
                        }}
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? "Copied!" : "Copy Drive Link"}</span>
                      </button>
                      <a
                        href={meeting.recording.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary-blue"
                        style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <span>Open Drive</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="white-panel-card" style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Video className="w-6 h-6 text-slate-400" />
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#1e293b", margin: "0 0 8px" }}>
                  No Screen Recording Available
                </h3>
                <p style={{ fontSize: "13.5px", color: "#64748b", maxWidth: "420px", margin: "0 auto" }}>
                  Screen recording was not activated during this call. To capture high-definition video in your next meeting, click <strong>&quot;Record Screen&quot;</strong> in the top meeting control bar.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
