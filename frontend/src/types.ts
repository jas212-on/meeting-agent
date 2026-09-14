export interface Attendee {
  id: string;
  name: string;
  email: string;
  role: "Host" | "Co-host" | "Speaker" | "Attendee";
  avatarColor: string;
  joinedAt: string;
  leftAt: string;
  speakingTimePct: number;
  status: "Present" | "Left Early" | "Joined Late";
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
  status: "completed" | "in-progress" | "scheduled";
}
