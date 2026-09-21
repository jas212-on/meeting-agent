import type { MeetingRecord, Attendee, MeetingMinutes } from "../types";

export const INITIAL_MEETINGS: MeetingRecord[] = [
  {
    id: "eng-sync-k9x",
    title: "Engineering Sprint Planning & Architecture Review",
    date: "Sep 14, 2026",
    time: "08:30 PM",
    timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
    duration: "42m 18s",
    durationSeconds: 2538,
    url: "https://meet.google.com/eng-sync-k9x",
    status: "completed",
    attendees: [
      {
        id: "att-1",
        name: "Alex Rivera",
        email: "alex.rivera@techcorp.io",
        role: "Host",
        avatarColor: "#6366f1",
        joinedAt: "08:30 PM",
        leftAt: "09:12 PM",
        speakingTimePct: 38,
        status: "Present",
        rejoinCount: 0,
        totalDurationSeconds: 2520,
        intervals: [
          {
            joinedAt: "08:30:15 PM",
            leftAt: "09:12:15 PM",
            durationSeconds: 2520,
          },
        ],
      },
      {
        id: "att-2",
        name: "Sophia Chen",
        email: "sophia.chen@techcorp.io",
        role: "Speaker",
        avatarColor: "#ec4899",
        joinedAt: "08:31 PM",
        leftAt: "09:12 PM",
        speakingTimePct: 29,
        status: "Present",
        rejoinCount: 0,
        totalDurationSeconds: 2460,
        intervals: [
          {
            joinedAt: "08:31:00 PM",
            leftAt: "09:12:00 PM",
            durationSeconds: 2460,
          },
        ],
      },
      {
        id: "att-3",
        name: "Marcus Brody",
        email: "marcus.b@techcorp.io",
        role: "Speaker",
        avatarColor: "#10b981",
        joinedAt: "08:32 PM",
        leftAt: "09:10 PM",
        speakingTimePct: 21,
        status: "Rejoined",
        rejoinCount: 1,
        totalDurationSeconds: 2040,
        intervals: [
          {
            joinedAt: "08:32:10 PM",
            leftAt: "08:50:10 PM",
            durationSeconds: 1080,
          },
          {
            joinedAt: "08:54:10 PM",
            leftAt: "09:10:10 PM",
            durationSeconds: 960,
          },
        ],
      },
      {
        id: "att-4",
        name: "Elena Rostova",
        email: "elena.r@techcorp.io",
        role: "Attendee",
        avatarColor: "#f59e0b",
        joinedAt: "08:35 PM",
        leftAt: "08:58 PM",
        speakingTimePct: 7,
        status: "Left Early",
        rejoinCount: 0,
        totalDurationSeconds: 1380,
        intervals: [
          {
            joinedAt: "08:35:00 PM",
            leftAt: "08:58:00 PM",
            durationSeconds: 1380,
          },
        ],
      },
      {
        id: "att-5",
        name: "Devon Vance",
        email: "devon.v@techcorp.io",
        role: "Attendee",
        avatarColor: "#8b5cf6",
        joinedAt: "08:30 PM",
        leftAt: "09:12 PM",
        speakingTimePct: 5,
        status: "Present",
        rejoinCount: 0,
        totalDurationSeconds: 2520,
        intervals: [
          {
            joinedAt: "08:30:10 PM",
            leftAt: "09:12:10 PM",
            durationSeconds: 2520,
          },
        ],
      },
    ],
    minutes: {
      summary:
        "The team aligned on the Q4 release roadmap, finalizing the migration of legacy audio processing pipes to WebRTC data streams and setting latency benchmarks under 120ms.",
      keyDecisions: [
        "Migrate real-time audio pipeline to WebRTC server mesh by end of week 3.",
        "Adopt Redis pub/sub for cross-node session coordination.",
        "Target client bundle budget capped at 180kb gzipped for the core agent SDK.",
      ],
      actionItems: [
        {
          id: "act-1",
          task: "Benchmark WebRTC audio packet loss on mobile networks",
          assignee: "Marcus Brody",
          dueDate: "Sep 18, 2026",
          completed: false,
        },
        {
          id: "act-2",
          task: "Complete Redis failover staging simulation",
          assignee: "Sophia Chen",
          dueDate: "Sep 20, 2026",
          completed: true,
        },
        {
          id: "act-3",
          task: "Review PR #412 for client audio buffer fallback",
          assignee: "Alex Rivera",
          dueDate: "Sep 16, 2026",
          completed: false,
        },
      ],
      discussionTopics: [
        {
          time: "00:00 - 12:00",
          topic: "Sprint retrospective & metric review",
          notes: "Reviewed uptime metrics from past sprint. 99.94% achieved.",
        },
        {
          time: "12:00 - 28:00",
          topic: "WebRTC pipeline architecture proposal",
          notes: "Sophia presented latency benchmarks and cost estimates.",
        },
        {
          time: "28:00 - 42:18",
          topic: "Action item assignment & Q&A",
          notes: "Sprint backlog finalized; tickets assigned to Marcus & Sophia.",
        },
      ],
    },
  },
  {
    id: "prd-sync-m2p",
    title: "Product Design & AI Summary UX Workshop",
    date: "Sep 13, 2026",
    time: "03:15 PM",
    timestamp: Date.now() - 1000 * 60 * 60 * 28, // yesterday
    duration: "27m 45s",
    durationSeconds: 1665,
    url: "https://meet.google.com/prd-sync-m2p",
    status: "completed",
    attendees: [
      {
        id: "att-201",
        name: "Sarah Jenkins",
        email: "sarah.j@designstudio.co",
        role: "Host",
        avatarColor: "#06b6d4",
        joinedAt: "03:15 PM",
        leftAt: "03:42 PM",
        speakingTimePct: 45,
        status: "Present",
      },
      {
        id: "att-202",
        name: "Liam O'Connor",
        email: "liam@techcorp.io",
        role: "Speaker",
        avatarColor: "#ec4899",
        joinedAt: "03:16 PM",
        leftAt: "03:42 PM",
        speakingTimePct: 35,
        status: "Present",
      },
      {
        id: "att-203",
        name: "Maya Patel",
        email: "maya.patel@designstudio.co",
        role: "Attendee",
        avatarColor: "#10b981",
        joinedAt: "03:20 PM",
        leftAt: "03:42 PM",
        speakingTimePct: 20,
        status: "Joined Late",
      },
    ],
    minutes: {
      summary:
        "UX team conducted a walkthrough of the new side drawer for meeting attendance and PDF minutes export. All key stakeholders approved the clean typography and dark-mode glass aesthetic.",
      keyDecisions: [
        "Include attendee speaking percentage bars directly in the attendance drawer.",
        "Add one-click PDF minutes export with custom brand formatting.",
        "Ensure responsive support down to 360px viewports.",
      ],
      actionItems: [
        {
          id: "act-201",
          task: "Export high-resolution icon set for action items",
          assignee: "Maya Patel",
          dueDate: "Sep 16, 2026",
          completed: true,
        },
        {
          id: "act-202",
          task: "Implement drawer slide animation curve",
          assignee: "Liam O'Connor",
          dueDate: "Sep 17, 2026",
          completed: false,
        },
      ],
      discussionTopics: [
        {
          time: "00:00 - 15:00",
          topic: "Drawer UI prototype presentation",
          notes: "Walkthrough of Figma designs and user flow.",
        },
        {
          time: "15:00 - 27:45",
          topic: "Feedback & implementation priorities",
          notes: "Prioritized PDF download speed and mobile drawer gesture.",
        },
      ],
    },
  },
];

export function extractMeetingIdFromUrl(url: string): string {
  try {
    const match = url.match(/meet\.google\.com\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return match[1].replace(/[^a-zA-Z0-9-]/g, "");
    }
  } catch {
    // fallback
  }
  // Generate friendly meeting code if none matched
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const r = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${r(3)}-${r(4)}-${r(3)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m ${remSecs}s`;
  }
  return `${mins}m ${remSecs < 10 ? "0" : ""}${remSecs}s`;
}

export function createNewMeetingRecord(
  url: string,
  durationSeconds: number,
  currentUser?: { name: string; email?: string } | null
): MeetingRecord {
  const meetingId = extractMeetingIdFromUrl(url);
  const now = new Date();

  const formattedDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const durationStr = formatDuration(durationSeconds);

  const hostName = currentUser?.name || "Meeting Host";
  const hostEmail = currentUser?.email || "host@meetminutes.ai";

  const attendees: Attendee[] = [
    {
      id: `att-host-${Date.now()}`,
      name: hostName,
      email: hostEmail,
      role: "Host",
      avatarColor: "#6366f1",
      joinedAt: formattedTime,
      leftAt: "Session End",
      speakingTimePct: 55,
      status: "Present",
      rejoinCount: 0,
      totalDurationSeconds: durationSeconds,
      intervals: [
        {
          joinedAt: formattedTime,
          leftAt: "Session End",
          durationSeconds,
        },
      ],
    },
    {
      id: `att-bot-${Date.now()}`,
      name: "MeetMinutes AI Assistant",
      email: "agent@meetminutes.ai",
      role: "Speaker",
      avatarColor: "#10b981",
      joinedAt: formattedTime,
      leftAt: "Session End",
      speakingTimePct: 45,
      status: "Present",
      rejoinCount: 0,
      totalDurationSeconds: durationSeconds,
      intervals: [
        {
          joinedAt: formattedTime,
          leftAt: "Session End",
          durationSeconds,
        },
      ],
    },
  ];

  const minutes: MeetingMinutes = {
    summary: `Live meeting session on Google Meet (${meetingId}) concluded successfully after ${durationStr}. Key points were captured, transcribed, and processed with automatic action item extraction.`,
    keyDecisions: [
      `Completed live session for meeting room ${meetingId}.`,
      "Verified audio streaming and transcript synchronization with sub-second latency.",
      "Meeting minutes compiled and archived in local history record.",
    ],
    actionItems: [
      {
        id: `act-1-${Date.now()}`,
        task: `Distribute compiled minutes PDF for meeting ${meetingId}`,
        assignee: hostName,
        dueDate: new Date(Date.now() + 86400000 * 2).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        completed: false,
      },
      {
        id: `act-2-${Date.now()}`,
        task: "Review logged discussion topics and action owners",
        assignee: "Team Collaborator",
        dueDate: new Date(Date.now() + 86400000 * 3).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        completed: true,
      },
    ],
    discussionTopics: [
      {
        time: `00:00 - ${durationStr}`,
        topic: `Main Session Discussion (${meetingId})`,
        notes: "Real-time dialog, agenda points, and participant remarks recorded by MeetMinutes agent.",
      },
    ],
  };

  return {
    id: meetingId,
    title: `Google Meet Session (${meetingId})`,
    date: formattedDate,
    time: formattedTime,
    timestamp: now.getTime(),
    duration: durationStr,
    durationSeconds: Math.max(1, durationSeconds),
    url: url.trim(),
    attendees,
    minutes,
    status: "completed",
  };
}
