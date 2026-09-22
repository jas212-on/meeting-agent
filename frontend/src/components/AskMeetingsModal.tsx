import { useState, useRef, useEffect, type FormEvent, type ReactNode } from "react";
import type { MeetingRecord } from "../types";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  RotateCcw,
  Calendar,
  ExternalLink,
  ChevronRight,
  Clipboard,
  Check,
  Zap,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedMeetings?: Array<{ id: string; title: string; date?: string; duration?: string }>;
  timestamp: string;
}

interface AskMeetingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetings: MeetingRecord[];
  token: string | null;
  currentUser?: { name: string; email: string } | null;
  onSelectMeeting?: (meeting: MeetingRecord) => void;
  initialMeetingId?: string | null;
}

const DEFAULT_SUGGESTED_PROMPTS = [
  "What action items are assigned across my meetings?",
  "Summarize key decisions made in recent meetings",
  "Who attended the last meeting and did anyone leave early?",
  "Give me a breakdown of all topics discussed recently",
];

export function AskMeetingsModal({
  isOpen,
  onClose,
  meetings,
  token,
  currentUser,
  onSelectMeeting,
  initialMeetingId,
}: AskMeetingsModalProps) {
  const [inputQuery, setInputQuery] = useState("");
  const [selectedMeetingFilter, setSelectedMeetingFilter] = useState<string | "all">(
    initialMeetingId || "all"
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "Hello! I am your **MeetMinutes AI Knowledge Assistant**.\n\nAsk me anything about your past Google Meet sessions, extracted action items, assigned tasks, or key decisions. Click any suggested prompt below to get started!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Sync initialMeetingId if provided
  useEffect(() => {
    if (initialMeetingId) {
      setSelectedMeetingFilter(initialMeetingId);
    }
  }, [initialMeetingId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: "Chat history cleared. How can I assist you with your meetings today?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const executeAskQuery = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: queryText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");
    setLoading(true);

    const targetMeetingId = selectedMeetingFilter === "all" ? undefined : selectedMeetingFilter;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // History payload for context
      const historyPayload = messages
        .filter((m) => m.id !== "welcome-msg")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat/ask-meetings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: queryText.trim(),
          meetingId: targetMeetingId,
          history: historyPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: data.answer,
            citedMeetings: data.citedMeetings || [],
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setLoading(false);
          return;
        }
      }

      // If backend call was not ok or returned error, execute client-side RAG fallback
      throw new Error("Backend unavailable, using client-side meeting index");
    } catch {
      // Local client-side intelligence fallback
      const localResult = answerLocallyFromState(queryText.trim(), meetings, targetMeetingId);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: localResult.answer,
        citedMeetings: localResult.citedMeetings,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    executeAskQuery(inputQuery);
  };

  const handleCitationClick = (meetingId: string) => {
    const found = meetings.find((m) => m.id === meetingId || (m as any).meetingId === meetingId);
    if (found && onSelectMeeting) {
      onSelectMeeting(found);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="ask-meetings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-meetings-heading"
      >
        {/* ── Modal Header ─────────────────────────────────── */}
        <div className="ask-modal-header">
          <div className="ask-header-left">
            <div className="ask-icon-badge">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="ask-header-title-row">
                <h3 id="ask-meetings-heading" className="ask-header-title">
                  Ask My Meetings
                </h3>
                <span className="ask-badge-ai">Groq AI</span>
              </div>
              <p className="ask-header-sub">
                Query meeting summaries, decisions, attendee participation, and action items
              </p>
            </div>
          </div>

          <div className="ask-header-actions">
            {/* Filter by specific meeting or all meetings */}
            <div className="ask-filter-container">
              <label htmlFor="meeting-filter-select" className="sr-only">
                Filter by Meeting
              </label>
              <select
                id="meeting-filter-select"
                className="ask-filter-select"
                value={selectedMeetingFilter}
                onChange={(e) => setSelectedMeetingFilter(e.target.value)}
                title="Select meeting scope"
              >
                <option value="all">🔍 All Meetings ({meetings.length})</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title.length > 28 ? m.title.substring(0, 28) + "…" : m.title} ({m.date})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="ask-btn-ghost"
              onClick={handleClearHistory}
              title="Clear conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              className="ask-btn-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Chat Messages Stream ─────────────────────────── */}
        <div className="ask-messages-scrollable">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`ask-message-row ${msg.role === "user" ? "user-row" : "assistant-row"}`}
            >
              <div className="ask-avatar-col">
                {msg.role === "user" ? (
                  <div className="ask-user-avatar">
                    {currentUser?.name ? (
                      currentUser.name[0].toUpperCase()
                    ) : (
                      <User className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                ) : (
                  <div className="ask-bot-avatar">
                    <Bot className="w-4 h-4 text-amber-300" />
                  </div>
                )}
              </div>

              <div className="ask-bubble-container">
                <div className="ask-bubble-header">
                  <span className="ask-sender-name">
                    {msg.role === "user" ? currentUser?.name || "You" : "MeetMinutes Assistant"}
                  </span>
                  <span className="ask-timestamp">{msg.timestamp}</span>

                  <button
                    type="button"
                    className="ask-bubble-copy"
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    title="Copy to clipboard"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Clipboard className="w-3 h-3 text-slate-400 hover:text-slate-200" />
                    )}
                  </button>
                </div>

                <div className="ask-bubble-content">
                  {formatMarkdownContent(msg.content, (citedId) => handleCitationClick(citedId))}
                </div>

                {/* Cited Meetings Badges */}
                {msg.citedMeetings && msg.citedMeetings.length > 0 && (
                  <div className="ask-citations-bar">
                    <span className="ask-citations-label">Sources:</span>
                    {msg.citedMeetings.map((cm) => (
                      <button
                        key={cm.id}
                        type="button"
                        className="ask-citation-chip"
                        onClick={() => handleCitationClick(cm.id)}
                        title={`Open minutes for ${cm.title}`}
                      >
                        <Calendar className="w-3 h-3 text-amber-400" />
                        <span className="ask-citation-title">{cm.title}</span>
                        {cm.date && <span className="ask-citation-date">&middot; {cm.date}</span>}
                        <ExternalLink className="w-2.5 h-2.5 text-slate-400 ml-0.5" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="ask-message-row assistant-row">
              <div className="ask-avatar-col">
                <div className="ask-bot-avatar pulse-anim">
                  <Bot className="w-4 h-4 text-amber-300" />
                </div>
              </div>
              <div className="ask-bubble-container">
                <div className="ask-typing-box">
                  <span className="ask-typing-dot dot-1" />
                  <span className="ask-typing-dot dot-2" />
                  <span className="ask-typing-dot dot-3" />
                  <span className="ask-typing-text">Analyzing meeting transcripts &amp; minutes…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Suggested Prompts Chips ──────────────────────── */}
        <div className="ask-prompt-chips-row">
          {DEFAULT_SUGGESTED_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              className="ask-prompt-chip"
              onClick={() => executeAskQuery(prompt)}
              disabled={loading}
            >
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>

        {/* ── Chat Input Bar ───────────────────────────────── */}
        <form className="ask-input-bar" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="ask-text-input"
            placeholder={
              selectedMeetingFilter === "all"
                ? "Ask anything across all meetings (e.g. 'What are my action items?')"
                : `Ask about "${meetings.find((m) => m.id === selectedMeetingFilter)?.title || "this meeting"}"`
            }
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            className="ask-send-btn"
            disabled={!inputQuery.trim() || loading}
            aria-label="Send query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Parses markdown-like text, bold tags, bullet points, and inline citations into clean JSX.
 */
function formatMarkdownContent(text: string, onCitationClick: (id: string) => void) {
  const lines = text.split("\n");

  return lines.map((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={idx} className="ask-line-break" />;
    }

    // Checkbox items e.g. - [ ] or - [x]
    if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]")) {
      const isChecked = trimmed.startsWith("- [x]");
      const itemContent = trimmed.substring(5).trim();
      return (
        <div key={idx} className="ask-action-item-line">
          <span className={`ask-check-box ${isChecked ? "checked" : ""}`}>
            {isChecked ? "✓" : "○"}
          </span>
          <span>{renderFormattedInline(itemContent, onCitationClick)}</span>
        </div>
      );
    }

    // Standard bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      return (
        <div key={idx} className="ask-bullet-line">
          <ChevronRight className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
          <span>{renderFormattedInline(trimmed.substring(2), onCitationClick)}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="ask-paragraph">
        {renderFormattedInline(line, onCitationClick)}
      </p>
    );
  });
}

/**
 * Handles bolding **text** and meeting citations `[Meeting: id | title]`
 */
function renderFormattedInline(content: string, onCitationClick: (id: string) => void) {
  // Regex matches [Meeting: id | title] or [Meeting: id]
  const citationRegex = /\[Meeting:\s*([a-zA-Z0-9_-]+)(?:\s*\|\s*([^\]]*))?\]/g;
  const parts: (string | ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(content)) !== null) {
    const beforeText = content.substring(lastIndex, match.index);
    if (beforeText) {
      parts.push(...renderBoldParts(beforeText));
    }

    const meetingId = match[1];
    const meetingTitle = match[2]?.trim() || meetingId;

    parts.push(
      <button
        key={`cit-${match.index}`}
        type="button"
        className="ask-inline-citation"
        onClick={() => onCitationClick(meetingId)}
        title={`View meeting: ${meetingTitle}`}
      >
        <Calendar className="w-2.5 h-2.5 mr-1" />
        {meetingTitle.length > 24 ? meetingTitle.substring(0, 24) + "…" : meetingTitle}
      </button>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(...renderBoldParts(content.substring(lastIndex)));
  }

  return parts;
}

/**
 * Splices bold text (**bold**)
 */
function renderBoldParts(text: string): (string | ReactNode)[] {
  const parts: (string | ReactNode)[] = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(<strong key={`b-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

/**
 * Local answering fallback if backend is offline.
 */
function answerLocallyFromState(
  query: string,
  meetings: MeetingRecord[],
  targetMeetingId?: string
) {
  const q = query.toLowerCase();
  const targetList = targetMeetingId
    ? meetings.filter((m) => m.id === targetMeetingId)
    : meetings;

  const citedMeetings: Array<{ id: string; title: string; date?: string; duration?: string }> = [];

  if (q.includes("action") || q.includes("task") || q.includes("todo") || q.includes("assigned")) {
    const actions: string[] = [];
    for (const m of targetList) {
      for (const act of m.minutes?.actionItems || []) {
        actions.push(
          `- **${act.task}**\n  - Assignee: **${act.assignee || "Unassigned"}** | Due: ${act.dueDate || "TBD"} [Meeting: ${m.id} | ${m.title}]`
        );
        citedMeetings.push({ id: m.id, title: m.title, date: m.date });
      }
    }

    if (actions.length > 0) {
      return {
        answer: `Here are the action items found in your meetings:\n\n${actions.join("\n")}`,
        citedMeetings: Array.from(new Map(citedMeetings.map((c) => [c.id, c])).values()),
      };
    }
  }

  if (q.includes("decision") || q.includes("decide") || q.includes("agreed")) {
    const decisions: string[] = [];
    for (const m of targetList) {
      for (const dec of m.minutes?.keyDecisions || []) {
        decisions.push(`- ${dec} [Meeting: ${m.id} | ${m.title}]`);
        citedMeetings.push({ id: m.id, title: m.title, date: m.date });
      }
    }

    if (decisions.length > 0) {
      return {
        answer: `Here are the key decisions recorded:\n\n${decisions.join("\n")}`,
        citedMeetings: Array.from(new Map(citedMeetings.map((c) => [c.id, c])).values()),
      };
    }
  }

  if (targetList.length > 0) {
    const latest = targetList[0];
    citedMeetings.push({ id: latest.id, title: latest.title, date: latest.date });
    return {
      answer: `Here is the executive summary for **${latest.title}** (${latest.date}):\n\n${latest.minutes?.summary || "No summary recorded."}\n\n*You can ask specific questions like "What are my action items?" or "What decisions were made?"*`,
      citedMeetings,
    };
  }

  return {
    answer:
      "No meeting records were found matching your criteria. Once you record meetings, you can ask about any discussions or decisions!",
    citedMeetings: [],
  };
}
