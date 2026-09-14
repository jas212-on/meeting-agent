import { useState } from "react";
import type { MeetingRecord } from "../types";
import { generateMeetingMinutesPDF } from "../utils/pdfGenerator";

interface MeetingHistoryProps {
  meetings: MeetingRecord[];
  onSelectMeeting: (meeting: MeetingRecord) => void;
  onDeleteMeeting: (meetingId: string) => void;
  onRestoreDefaults: () => void;
}

export function MeetingHistory({
  meetings,
  onSelectMeeting,
  onDeleteMeeting,
  onRestoreDefaults,
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
            Recorded sessions, attendance rosters, and AI-generated minutes of meetings.
          </p>
        </div>

        <div className="history-controls">
          <div className="history-search-wrapper">
            <span className="search-icon">🔍</span>
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
              >
                ✕
              </button>
            )}
          </div>

          {meetings.length === 0 && (
            <button className="btn-restore-samples" onClick={onRestoreDefaults}>
              ⚡ Load Sample Meetings
            </button>
          )}
        </div>
      </div>

      {/* Meetings List / Grid */}
      {filteredMeetings.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon">📂</div>
          <h3 className="empty-title">
            {searchQuery ? "No matching meetings found" : "No meeting history recorded yet"}
          </h3>
          <p className="empty-desc">
            {searchQuery
              ? `No results matched "${searchQuery}". Try a different keyword.`
              : "Paste a Google Meet link above and join a session. When the meeting ends, your attendance records and minutes will appear right here."}
          </p>
          {searchQuery ? (
            <button
              className="btn-primary-ghost"
              onClick={() => setSearchQuery("")}
            >
              Clear Search Filter
            </button>
          ) : (
            <button
              className="btn-primary-ghost"
              onClick={onRestoreDefaults}
            >
              Load Sample Meetings
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
                    <span className="meeting-id-prefix">ID:</span>
                    <span className="meeting-id-text">{meeting.id}</span>
                  </div>

                  <div className="meeting-card-header-actions">
                    <span className="meeting-status-tag">Completed</span>
                    <button
                      className="delete-meeting-btn"
                      title="Remove from history"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteMeeting(meeting.id);
                      }}
                      aria-label={`Delete meeting ${meeting.id}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Meeting Title */}
                <h3 className="meeting-card-title">{meeting.title}</h3>

                {/* Meta details: Date & Duration */}
                <div className="meeting-meta-row">
                  <div className="meta-pill date-pill">
                    <span className="meta-icon">📅</span>
                    <span>{meeting.date}</span>
                    <span className="meta-subtime">{meeting.time}</span>
                  </div>
                  <div className="meta-pill duration-pill">
                    <span className="meta-icon">⏱</span>
                    <span>{meeting.duration}</span>
                  </div>
                </div>

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
                    className="card-btn card-btn-view"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeeting(meeting);
                    }}
                  >
                    <span>👥 View Attendance</span>
                    <span className="arrow-icon">→</span>
                  </button>

                  <button
                    className="card-btn card-btn-pdf"
                    onClick={(e) => handleDownload(e, meeting)}
                    disabled={isDownloading}
                    title="Download minutes as PDF"
                  >
                    <span>📥</span>
                    <span>{isDownloading ? "Saving…" : "Minutes PDF"}</span>
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
