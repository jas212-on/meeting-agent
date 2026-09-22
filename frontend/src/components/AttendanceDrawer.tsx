import { useState, useEffect } from "react";
import type { MeetingRecord } from "../types";
import { generateMeetingMinutesPDF } from "../utils/pdfGenerator";
import {
  X,
  FileText,
  Users,
  Download,
  Copy,
  Check,
  Calendar,
  Clock,
  Sparkles,
  Target,
  ListTodo,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RotateCw,
  User
} from "lucide-react";

interface AttendanceDrawerProps {
  meeting: MeetingRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleActionItem?: (meetingId: string, actionId: string) => void;
  initialTab?: "attendance" | "minutes";
}

export function AttendanceDrawer({
  meeting,
  isOpen,
  onClose,
  onToggleActionItem,
  initialTab = "minutes",
}: AttendanceDrawerProps) {
  const [activeTab, setActiveTab] = useState<"attendance" | "minutes">(initialTab);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedAttendeeId, setExpandedAttendeeId] = useState<string | null>(null);

  const formatSecs = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  };

  const handleExportCSV = () => {
    if (!meeting) return;
    const headers = [
      "Name",
      "Email",
      "Role",
      "Status",
      "First Joined At",
      "Last Left At",
      "Rejoin Count",
      "Total Active Seconds",
      "Total Active Duration",
      "Speaking Time Pct",
      "Session Intervals",
    ];

    const rows = meeting.attendees.map((att) => {
      const sessionStr = (att.intervals || [])
        .map(
          (int, i) =>
            `Session ${i + 1}: ${int.joinedAt} - ${int.leftAt} (${formatSecs(int.durationSeconds)})`
        )
        .join(" | ");

      const totalSec =
        att.totalDurationSeconds ||
        (att.intervals || []).reduce((s, i) => s + (i.durationSeconds || 0), 0);

      return [
        `"${att.name.replace(/"/g, '""')}"`,
        `"${att.email || ""}"`,
        `"${att.role}"`,
        `"${att.status}"`,
        `"${att.joinedAt}"`,
        `"${att.leftAt}"`,
        att.rejoinCount || 0,
        totalSec,
        `"${formatSecs(totalSec)}"`,
        `"${att.speakingTimePct}%"`,
        `"${sessionStr.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Attendance_${meeting.id}_${meeting.date.replace(/[^a-zA-Z0-9]/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, meeting?.id]);

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
              <span className="drawer-duration-badge">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{meeting.duration}</span>
              </span>
              <span className="drawer-date-badge">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>{meeting.date}</span>
              </span>
            </div>
            <h2 id="drawer-title" className="drawer-title">
              {meeting.title}
            </h2>
          </div>
          <button
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close panel"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab-btn ${activeTab === "minutes" ? "active" : ""}`}
            onClick={() => setActiveTab("minutes")}
            type="button"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>AI Summary &amp; Minutes</span>
          </button>
          <button
            className={`drawer-tab-btn ${activeTab === "attendance" ? "active" : ""}`}
            onClick={() => setActiveTab("attendance")}
            type="button"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Attendance Audit ({meeting.attendees.length})</span>
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
                  <span className="stat-label">Recorded Duration</span>
                  <span className="stat-value">{meeting.duration}</span>
                </div>
              </div>

              {/* Attendee List */}
              <div className="roster-header-row">
                <h3 className="section-subtitle">Participant Roster &amp; Intervals</h3>
                <button
                  className="export-attendance-btn"
                  onClick={handleExportCSV}
                  title="Export complete attendance record to CSV"
                  type="button"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="attendees-list">
                {meeting.attendees.map((attendee) => {
                  const initials = attendee.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  const isExpanded = expandedAttendeeId === attendee.id;
                  const hasIntervals =
                    attendee.intervals && attendee.intervals.length > 0;

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

                        <div className="attendee-status-group">
                          {attendee.rejoinCount && attendee.rejoinCount > 0 ? (
                            <span
                              className="rejoin-pill"
                              title={`Left and rejoined ${attendee.rejoinCount} time${
                                attendee.rejoinCount > 1 ? "s" : ""
                              }`}
                            >
                              <RotateCw className="w-3 h-3" />
                              <span>Rejoined {attendee.rejoinCount}×</span>
                            </span>
                          ) : null}
                          <span
                            className={`status-pill ${
                              attendee.status === "Present"
                                ? "status-present"
                                : attendee.status === "Rejoined"
                                ? "status-rejoined"
                                : "status-flagged"
                            }`}
                          >
                            {attendee.status}
                          </span>
                        </div>
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

                        <div className="attendee-timeline-row">
                          <div className="attendee-timeline">
                            <span>First Joined: {attendee.joinedAt}</span>
                            <span>Last Left: {attendee.leftAt}</span>
                            {attendee.totalDurationSeconds ? (
                              <span className="timeline-total-time">
                                Active: {formatSecs(attendee.totalDurationSeconds)}
                              </span>
                            ) : null}
                          </div>

                          {hasIntervals && (
                            <button
                              type="button"
                              className="session-toggle-btn"
                              onClick={() =>
                                setExpandedAttendeeId(isExpanded ? null : attendee.id)
                              }
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  <span>Hide Intervals</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  <span>
                                    {attendee.intervals!.length} Interval{attendee.intervals!.length > 1 ? "s" : ""}
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Expandable Session Timeline */}
                        {isExpanded && hasIntervals && (
                          <div className="attendee-sessions-breakdown">
                            <div className="sessions-breakdown-title">
                              Entry &amp; Exit Log
                            </div>
                            <div className="sessions-list">
                              {attendee.intervals!.map((interval, idx) => (
                                <div key={idx} className="session-item">
                                  <span className="session-tag">Session {idx + 1}</span>
                                  <div className="session-timestamps">
                                    <span className="session-in">
                                      <span className="dot-green" /> {interval.joinedAt}
                                    </span>
                                    <span className="session-arrow">→</span>
                                    <span className="session-out">
                                      <span className="dot-red" /> {interval.leftAt}
                                    </span>
                                  </div>
                                  <span className="session-duration">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span>{formatSecs(interval.durationSeconds)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
                  <Sparkles className="block-icon-svg text-amber-400" />
                  <span>Executive Summary</span>
                </h3>
                <p className="summary-text">{meeting.minutes.summary}</p>
              </div>

              {/* Key Decisions */}
              <div className="minutes-block">
                <h3 className="block-title">
                  <Target className="block-icon-svg text-emerald-400" />
                  <span>Key Decisions Made</span>
                </h3>
                <ul className="decisions-list">
                  {meeting.minutes.keyDecisions.map((decision, i) => (
                    <li key={i} className="decision-item">
                      <span className="check-bullet">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </span>
                      <span>{decision}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Items */}
              <div className="minutes-block">
                <h3 className="block-title">
                  <ListTodo className="block-icon-svg text-amber-400" />
                  <span>Action Items &amp; Deliverables</span>
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
                          <span className="action-assignee">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{item.assignee}</span>
                          </span>
                          <span className="action-due">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Due: {item.dueDate}</span>
                          </span>
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
                      <MessageSquare className="block-icon-svg text-cyan-400" />
                      <span>Agenda &amp; Discussion Topics</span>
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
            type="button"
          >
            <Download className="btn-icon-svg" />
            <span>{downloading ? "Generating PDF…" : "Download Minutes (PDF)"}</span>
          </button>

          <button className="btn-secondary-drawer" onClick={handleCopySummary} type="button">
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied to Clipboard</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Summary</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}

