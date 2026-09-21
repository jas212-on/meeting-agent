import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IGroupActiveMeeting {
  url: string;
  meetingId: string;
  sharedAt: Date;
  status: "active" | "ended";
}

export interface IGroup extends Document {
  name: string;
  description?: string;
  admin: Types.ObjectId; // The user who created this group
  members: Types.ObjectId[]; // Array of registered users in this group
  activeMeeting?: IGroupActiveMeeting;
  createdAt: Date;
  updatedAt: Date;
}

const GroupActiveMeetingSchema = new Schema<IGroupActiveMeeting>(
  {
    url: { type: String, required: true },
    meetingId: { type: String, required: true },
    sharedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["active", "ended"], default: "active" },
  },
  { _id: false }
);

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      minlength: [2, "Group name must be at least 2 characters long"],
      maxlength: [80, "Group name cannot exceed 80 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
      default: "",
    },
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Group admin/creator is required"],
      index: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    activeMeeting: {
      type: GroupActiveMeetingSchema,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Helpful index to search groups for a specific user
groupSchema.index({ admin: 1, members: 1 });

export const Group: Model<IGroup> = mongoose.model<IGroup>("Group", groupSchema);
