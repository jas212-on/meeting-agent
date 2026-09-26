export interface AttendanceInterval {
  joinedAt: string;
  leftAt: string;
  joinTimestamp?: number;
  leaveTimestamp?: number;
  durationSeconds: number;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  role: "Host" | "Co-host" | "Speaker" | "Attendee";
  avatarColor: string;
  joinedAt: string;
  leftAt: string;
  speakingTimePct: number;
  status: "Present" | "Left Early" | "Joined Late" | "Rejoined";
  rejoinCount?: number;
  totalDurationSeconds?: number;
  intervals?: AttendanceInterval[];
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
}

export interface MeetingMinutes {
  summary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  discussionTopics: {
    time: string;
    topic: string;
    notes: string;
  }[];
}

export interface TranscriptEntry {
  id: string;
  speaker: string;
  role: "Host" | "Co-host" | "Speaker" | "Attendee" | "Assistant";
  text: string;
  timestamp: string;
  avatarColor?: string;
}

export interface MeetingRecording {
  status: "idle" | "recording" | "ready" | "uploading" | "uploaded" | "failed";
  localUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  driveUrl?: string;
  driveFileId?: string;
  uploadedAt?: string;
}

export interface MeetingRecord {
  id: string; // Meeting ID or code (e.g., 'abc-defg-hij')
  title: string;
  date: string; // Formatted date e.g. "Sep 14, 2026"
  time: string; // Formatted time e.g. "10:30 PM"
  timestamp: number; // For sorting
  duration: string; // e.g. "28m 14s"
  durationSeconds: number;
  url: string;
  attendees: Attendee[];
  minutes: MeetingMinutes;
  transcript?: TranscriptEntry[];
  status: "completed" | "in-progress" | "scheduled";
  recording?: MeetingRecording;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface GroupActiveMeeting {
  url: string;
  meetingId?: string;
  sharedAt: string;
  status: "active" | "ended";
}

export interface GroupItem {
  id: string;
  name: string;
  description?: string;
  admin: UserSummary;
  members: UserSummary[];
  activeMeeting?: GroupActiveMeeting | null;
  isAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
}

