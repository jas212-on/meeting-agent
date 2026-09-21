import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IAttendanceInterval {
  joinedAt: string;
  leftAt: string;
  joinTimestamp?: number;
  leaveTimestamp?: number;
  durationSeconds: number;
}

export interface IAttendee {
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
  intervals?: IAttendanceInterval[];
}

export interface IActionItem {
  id: string;
  task: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
}

export interface IDiscussionTopic {
  time: string;
  topic: string;
  notes: string;
}

export interface IMeetingMinutes {
  summary: string;
  keyDecisions: string[];
  actionItems: IActionItem[];
  discussionTopics: IDiscussionTopic[];
}

export interface IMeeting extends Document {
  meetingId: string;
  user?: Types.ObjectId;
  title: string;
  date: string;
  time: string;
  timestamp: number;
  duration: string;
  durationSeconds: number;
  url: string;
  status: "completed" | "in-progress" | "scheduled";
  attendees: IAttendee[];
  minutes: IMeetingMinutes;
  rawLogs?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceIntervalSchema = new Schema<IAttendanceInterval>(
  {
    joinedAt: { type: String, default: "" },
    leftAt: { type: String, default: "" },
    joinTimestamp: { type: Number, default: 0 },
    leaveTimestamp: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
  },
  { _id: false }
);

const AttendeeSchema = new Schema<IAttendee>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    role: {
      type: String,
      enum: ["Host", "Co-host", "Speaker", "Attendee"],
      default: "Attendee",
    },
    avatarColor: { type: String, default: "#6366f1" },
    joinedAt: { type: String, default: "" },
    leftAt: { type: String, default: "" },
    speakingTimePct: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      enum: ["Present", "Left Early", "Joined Late", "Rejoined"],
      default: "Present",
    },
    rejoinCount: { type: Number, default: 0 },
    totalDurationSeconds: { type: Number, default: 0 },
    intervals: { type: [AttendanceIntervalSchema], default: [] },
  },
  { _id: false }
);

const ActionItemSchema = new Schema<IActionItem>(
  {
    id: { type: String, required: true },
    task: { type: String, required: true, trim: true },
    assignee: { type: String, default: "Unassigned", trim: true },
    dueDate: { type: String, default: "" },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const DiscussionTopicSchema = new Schema<IDiscussionTopic>(
  {
    time: { type: String, default: "" },
    topic: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const MeetingMinutesSchema = new Schema<IMeetingMinutes>(
  {
    summary: { type: String, default: "" },
    keyDecisions: { type: [String], default: [] },
    actionItems: { type: [ActionItemSchema], default: [] },
    discussionTopics: { type: [DiscussionTopicSchema], default: [] },
  },
  { _id: false }
);

const MeetingSchema = new Schema<IMeeting>(
  {
    meetingId: {
      type: String,
      required: [true, "Meeting ID is required"],
      unique: true,
      trim: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: false,
    },
    title: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
      default: "Untitled Meeting",
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Number,
      required: true,
      index: true,
      default: () => Date.now(),
    },
    duration: {
      type: String,
      default: "0s",
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    url: {
      type: String,
      required: [true, "Meeting URL is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["completed", "in-progress", "scheduled"],
      default: "completed",
      index: true,
    },
    attendees: {
      type: [AttendeeSchema],
      default: [],
    },
    minutes: {
      type: MeetingMinutesSchema,
      default: () => ({
        summary: "",
        keyDecisions: [],
        actionItems: [],
        discussionTopics: [],
      }),
    },
    rawLogs: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret.meetingId || ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for user query timeline
MeetingSchema.index({ user: 1, timestamp: -1 });

// Full text search index across title, summary, and decisions
MeetingSchema.index({
  title: "text",
  "minutes.summary": "text",
  "minutes.keyDecisions": "text",
});

export const Meeting: Model<IMeeting> = mongoose.model<IMeeting>("Meeting", MeetingSchema);
