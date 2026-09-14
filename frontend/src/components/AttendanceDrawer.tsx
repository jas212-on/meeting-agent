import { useState, useEffect } from "react";
import type { MeetingRecord } from "../types";
import { generateMeetingMinutesPDF } from "../utils/pdfGenerator";

interface AttendanceDrawerProps {
  meeting: MeetingRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleActionItem?: (meetingId: string, actionId: string) => void;
}

export function AttendanceDrawer({
  meeting,
  isOpen,
  onClose,
  onToggleActionItem,
}: AttendanceDrawerProps) {
  const [activeTab, setActiveTab] = useState<"attendance" | "minutes">("attendance");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !meeting) return null;

  const handleCopySummary = () => {
    const text = `Meeting: ${meeting.title}\nID: ${meeting.id}\nDate: ${meeting.date} at ${meeting.time}\nDuration: ${meeting.duration}\n\nSummary:\n${meeting.minutes.summary}\n\nKey Decisions:\n${meeting.minutes.keyDecisions.map((d) => `• ${d}`).join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const presentCount = meeting.attendees.filter((a) => a.status === "Present").length;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="drawer-badges">
              <span className="drawer-id-badge">
                <span className="dot-mini" /> {meeting.id}
              </span>
              <span className="drawer-duration-badge">⏱ {meeting.duration}</span>
              <span className="drawer-date-badge">📅 {meeting.date}</span>
            </div>
            <h2 id="drawer-title" className="drawer-title">
              {meeting.title}
            </h2>
          </div>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab-btn ${activeTab === "attendance" ? "active" : ""}`}
            onClick={() => setActiveTab("attendance")}
          >
            👥 Attendance Record ({meeting.attendees.length})
          </button>
          <button
            className={`drawer-tab-btn ${activeTab === "minutes" ? "active" : ""}`}
            onClick={() => setActiveTab("minutes")}
          >
            📄 Minutes of Meeting
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="drawer-body">
          {activeTab === "attendance" ? (
            <div className="attendance-view">
              {/* Summary Stats Cards */}
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-label">Total Participants</span>
                  <span className="stat-value">{meeting.attendees.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Present Throughout</span>
                  <span className="stat-value highlight-emerald">{presentCount}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{meeting.duration}</span>
                </div>
              </div>

              {/* Attendee List */}
              <h3 className="section-subtitle">Participant Roster & Activity</h3>
              <div className="attendees-list">
                {meeting.attendees.map((attendee) => {
                  const initials = attendee.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <div key={attendee.id} className="attendee-card">
                      <div className="attendee-card-top">
                        <div className="attendee-user">
                          <div
                            className="attendee-avatar"
                            style={{ backgroundColor: attendee.avatarColor }}
                          >
                            {initials}
                          </div>
                          <div className="attendee-info">
                            <div className="attendee-name-row">
                              <span className="attendee-name">{attendee.name}</span>
                              <span
                                className={`role-pill role-${attendee.role.toLowerCase()}`}
                              >
                                {attendee.role}
                              </span>
                            </div>
                            <span className="attendee-email">{attendee.email}</span>
                          </div>
                        </div>

                        <span
                          className={`status-pill ${
                            attendee.status === "Present"
                              ? "status-present"
                              : "status-flagged"
                          }`}
                        >
                          {attendee.status}
                        </span>
                      </div>

                      {/* Speaking activity & timeline */}
                      <div className="attendee-card-bottom">
                        <div className="activity-row">
                          <span className="activity-label">Speaking Time</span>
                          <span className="activity-pct">{attendee.speakingTimePct}%</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${attendee.speakingTimePct}%`,
                              backgroundColor: attendee.avatarColor,
                            }}
                          />
                        </div>

                        <div className="attendee-timeline">
                          <span>Joined: {attendee.joinedAt}</span>
                          <span>Left: {attendee.leftAt}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="minutes-view">
              {/* Executive Summary */}
              <div className="minutes-block summary-block">
                <h3 className="block-title">
                  <span className="block-icon">💡</span> Executive Summary
                </h3>
                <p className="summary-text">{meeting.minutes.summary}</p>
              </div>

              {/* Key Decisions */}
              <div className="minutes-block">
                <h3 className="block-title">
                  <span className="block-icon">🎯</span> Key Decisions Made
                </h3>
                <ul className="decisions-list">
                  {meeting.minutes.keyDecisions.map((decision, i) => (
                    <li key={i} className="decision-item">
                      <span className="check-bullet">✓</span>
                      <span>{decision}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Items */}
              <div className="minutes-block">
                <h3 className="block-title">
                  <span className="block-icon">⚡</span> Action Items & Deliverables
                </h3>
                <div className="action-items-list">
                  {meeting.minutes.actionItems.map((item) => (
                    <div
                      key={item.id}
                      className={`action-item-card ${item.completed ? "completed" : ""}`}
                      onClick={() =>
                        onToggleActionItem && onToggleActionItem(meeting.id, item.id)
                      }
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() =>
                          onToggleActionItem && onToggleActionItem(meeting.id, item.id)
                        }
                        className="action-checkbox"
                      />
                      <div className="action-content">
                        <span className="action-task">{item.task}</span>
                        <div className="action-meta">
                          <span className="action-assignee">👤 {item.assignee}</span>
                          <span className="action-due">📅 Due: {item.dueDate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discussion Topics */}
              {meeting.minutes.discussionTopics &&
                meeting.minutes.discussionTopics.length > 0 && (
                  <div className="minutes-block">
                    <h3 className="block-title">
                      <span className="block-icon">💬</span> Agenda & Discussion Topics
                    </h3>
                    <div className="timeline-list">
                      {meeting.minutes.discussionTopics.map((topic, i) => (
                        <div key={i} className="timeline-item">
                          <div className="timeline-time">{topic.time}</div>
                          <div className="timeline-content">
                            <div className="timeline-topic">{topic.topic}</div>
                            <div className="timeline-notes">{topic.notes}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          <button
            className="btn-download-pdf"
            onClick={handleDownloadPDF}
            disabled={downloading}
          >
            <span className="btn-icon">📥</span>
            {downloading ? "Generating PDF…" : "Download Minutes (PDF)"}
          </button>

          <button className="btn-secondary-drawer" onClick={handleCopySummary}>
            {copied ? "✓ Copied!" : "📋 Copy Summary"}
          </button>
        </div>
      </aside>
    </div>
  );
}
