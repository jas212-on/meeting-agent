import { useState } from "react";
import type { MeetingRecord } from "../types";
import { generateMeetingMinutesPDF } from "../utils/pdfGenerator";
import {
  Search,
  X,
  RotateCcw,
  FolderOpen,
  Calendar,
  Clock,
  Trash2,
  Sparkles,
  ExternalLink,
  FileText,
  Users,
  Download,
  ArrowRight,
  CheckCircle2
} from "lucide-react";

interface MeetingHistoryProps {
  meetings: MeetingRecord[];
  onSelectMeeting: (meeting: MeetingRecord, initialTab?: "attendance" | "minutes") => void;
  onDeleteMeeting: (meetingId: string) => void;
  onRestoreDefaults: () => void;
  onOpenAskAi?: (meetingId?: string) => void;
}

export function MeetingHistory({
  meetings,
  onSelectMeeting,
  onDeleteMeeting,
  onRestoreDefaults,
  onOpenAskAi,
}: MeetingHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filteredMeetings = meetings.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.date.toLowerCase().includes(q) ||
      m.attendees.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  const handleDownload = (e: React.MouseEvent, meeting: MeetingRecord) => {
    e.stopPropagation();
    setDownloadingId(meeting.id);
    try {
      generateMeetingMinutesPDF(meeting);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setTimeout(() => setDownloadingId(null), 600);
    }
  };

  return (
    <section className="history-section" aria-labelledby="history-heading">
      {/* History Header & Controls */}
      <div className="history-header">
        <div className="history-header-left">
          <div className="history-title-row">
            <h2 id="history-heading" className="history-title">
              Meeting History
            </h2>
            <span className="history-count-badge">
              {meetings.length} {meetings.length === 1 ? "Session" : "Sessions"}
            </span>
          </div>
          <p className="history-subtitle">
            Search and review recorded sessions, attendance audits, and generated minutes of meeting.
          </p>
        </div>

        <div className="history-controls">
          <div className="history-search-wrapper">
            <Search className="search-icon-svg" />
            <input
              type="text"
              className="history-search-input"
              placeholder="Search by ID, title, or participant…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                type="button"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            className="btn-ask-ai-history"
            onClick={() => onOpenAskAi?.()}
            type="button"
            title="Ask AI questions across all recorded meetings"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Ask AI</span>
          </button>

          {meetings.length === 0 && (
            <button className="btn-restore-samples" onClick={onRestoreDefaults} type="button">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Load Sample Meetings</span>
            </button>
          )}
        </div>
      </div>

      {/* Meetings List / Grid */}
      {filteredMeetings.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon-wrap">
            <FolderOpen className="empty-icon-svg" />
          </div>
          <h3 className="empty-title">
            {searchQuery ? "No matching sessions found" : "No meeting history recorded yet"}
          </h3>
          <p className="empty-desc">
            {searchQuery
              ? `No results matched "${searchQuery}". Try searching with a different name or meeting ID.`
              : "Paste a Google Meet link above to deploy your agent. Once completed, your attendance records and executive minutes will appear here."}
          </p>
          {searchQuery ? (
            <button
              className="btn-primary-ghost"
              onClick={() => setSearchQuery("")}
              type="button"
            >
              Clear Filter
            </button>
          ) : (
            <button
              className="btn-primary-ghost"
              onClick={onRestoreDefaults}
              type="button"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Load Sample Meetings</span>
            </button>
          )}
        </div>
      ) : (
        <div className="history-grid">
          {filteredMeetings.map((meeting) => {
            const isDownloading = downloadingId === meeting.id;
            const topAttendees = meeting.attendees.slice(0, 3);
            const extraAttendeesCount = meeting.attendees.length - topAttendees.length;

            return (
              <article
                key={meeting.id}
                className="meeting-card"
                onClick={() => onSelectMeeting(meeting)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectMeeting(meeting);
                  }
                }}
              >
                {/* Top bar: Meeting ID, Status, and Delete */}
                <div className="meeting-card-header">
                  <div className="meeting-id-box">
                    <span className="meeting-id-prefix">ID</span>
                    <span className="meeting-id-text">{meeting.id}</span>
                  </div>

                  <div className="meeting-card-header-actions">
                    <span className="meeting-status-tag">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Completed
                    </span>
                    <button
                      className="delete-meeting-btn"
                      title="Remove from history"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteMeeting(meeting.id);
                      }}
                      aria-label={`Delete meeting ${meeting.id}`}
                      type="button"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Meeting Title */}
                <h3 className="meeting-card-title">{meeting.title}</h3>

                {/* Meta details: Date & Duration */}
                <div className="meeting-meta-row">
                  <div className="meta-pill date-pill">
                    <Calendar className="meta-icon-svg" />
                    <span>{meeting.date}</span>
                    <span className="meta-subtime">{meeting.time}</span>
                  </div>
                  <div className="meta-pill duration-pill">
                    <Clock className="meta-icon-svg" />
                    <span>{meeting.duration}</span>
                  </div>
                </div>

                {/* Meeting Summary Preview */}
                {meeting.minutes?.summary && (
                  <div
                    className="meeting-summary-preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeeting(meeting, "minutes");
                    }}
                    title="Click to view full minutes & summary"
                  >
                    <div className="summary-preview-header">
                      <span className="summary-preview-badge">
                        <Sparkles className="w-3 h-3 text-blue-600" />
                        AI Summary
                      </span>
                      <span className="summary-preview-expand">
                        <span>Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                    <p className="summary-preview-text">{meeting.minutes.summary}</p>
                  </div>
                )}

                {/* Attendance Summary */}
                <div className="meeting-attendance-bar">
                  <div className="avatar-stack">
                    {topAttendees.map((att) => (
                      <div
                        key={att.id}
                        className="avatar-bubble"
                        style={{ backgroundColor: att.avatarColor }}
                        title={`${att.name} (${att.role})`}
                      >
                        {att.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    ))}
                    {extraAttendeesCount > 0 && (
                      <div
                        className="avatar-bubble avatar-count"
                        title={`${extraAttendeesCount} more attendees`}
                      >
                        +{extraAttendeesCount}
                      </div>
                    )}
                  </div>
                  <span className="attendee-summary-label">
                    {meeting.attendees.length} participants recorded
                  </span>
                </div>

                {/* Card Action Buttons */}
                <div className="meeting-card-actions">
                  <button
                    className="card-btn card-btn-summary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeeting(meeting, "minutes");
                    }}
                    type="button"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Minutes</span>
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </button>

                  <button
                    className="card-btn card-btn-view"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeeting(meeting, "attendance");
                    }}
                    type="button"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Attendance</span>
                  </button>

                  <button
                    className="card-btn card-btn-ask"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAskAi?.(meeting.id);
                    }}
                    type="button"
                    title={`Ask AI questions about ${meeting.title}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Ask AI</span>
                  </button>

                  <button
                    className="card-btn card-btn-pdf"
                    onClick={(e) => handleDownload(e, meeting)}
                    disabled={isDownloading}
                    title="Download minutes as PDF"
                    type="button"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isDownloading ? "Saving…" : "PDF"}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

