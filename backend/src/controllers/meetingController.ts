import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { Meeting } from "../models/Meeting.js";

/* ── GET /api/meetings ─────────────────────────────────────── */
export async function getMeetings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, status, limit = 50, page = 1 } = req.query;

    const filter: Record<string, any> = {};

    // Filter by authenticated user if logged in, otherwise allow public/guest view
    if (req.user) {
      filter.$or = [{ user: req.user._id }, { user: { $exists: false } }, { user: null }];
    }

    if (status && typeof status === "string") {
      filter.status = status;
    }

    // Text search query
    if (q && typeof q === "string" && q.trim().length > 0) {
      filter.$text = { $search: q.trim() };
    }

    const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;

    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean({ virtuals: true }),
      Meeting.countDocuments(filter),
    ]);

    // Format output with id field
    const formatted = meetings.map((m: any) => {
      return {
        id: m.meetingId || m._id.toString(),
        ...m,
        _id: undefined,
        __v: undefined,
      };
    });

    res.json({
      success: true,
      total,
      count: formatted.length,
      page: Number(page),
      meetings: formatted,
    });
  } catch (error: any) {
    console.error("Error fetching meetings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch meetings",
      details: error.message,
    });
  }
}

/* ── GET /api/meetings/:id ─────────────────────────────────── */
export async function getMeetingById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: "Invalid ID" });
      return;
    }

    // Search by meetingId or MongoDB _id
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { meetingId: id }] }
      : { meetingId: id };

    const meeting = await Meeting.findOne(query);

    if (!meeting) {
      res.status(404).json({
        success: false,
        error: "Meeting not found",
      });
      return;
    }

    res.json({
      success: true,
      meeting: meeting.toJSON(),
    });
  } catch (error: any) {
    console.error("Error fetching meeting:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch meeting details",
    });
  }
}

/* ── POST /api/meetings ────────────────────────────────────── */
export async function createMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const {
      id,
      meetingId = id,
      title,
      date,
      time,
      timestamp = Date.now(),
      duration = "0s",
      durationSeconds = 0,
      url,
      status = "completed",
      attendees = [],
      minutes = {},
      rawLogs = [],
    } = req.body;

    if (!meetingId) {
      res.status(400).json({ success: false, error: "meetingId is required" });
      return;
    }

    if (!url) {
      res.status(400).json({ success: false, error: "url is required" });
      return;
    }

    const meetingData: Record<string, any> = {
      meetingId,
      title: title || `Meeting (${meetingId})`,
      date: date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      timestamp: Number(timestamp) || Date.now(),
      duration,
      durationSeconds: Number(durationSeconds) || 0,
      url,
      status,
      attendees,
      minutes,
      rawLogs,
    };

    if (req.user) {
      meetingData.user = req.user._id;
    }

    // Upsert so if a meeting was already registered, it updates cleanly
    const meeting = await Meeting.findOneAndUpdate(
      { meetingId },
      { $set: meetingData },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({
      success: true,
      meeting: meeting.toJSON(),
    });
  } catch (error: any) {
    console.error("Error creating meeting:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save meeting record",
      details: error.message,
    });
  }
}

/* ── PUT /api/meetings/:id ─────────────────────────────────── */
export async function updateMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: "Invalid ID" });
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { meetingId: id }] }
      : { meetingId: id };

    const meeting = await Meeting.findOne(query);

    if (!meeting) {
      res.status(404).json({ success: false, error: "Meeting not found" });
      return;
    }

    // Check ownership if meeting is assigned to a user
    if (meeting.user && req.user && meeting.user.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Forbidden: Not authorized to edit this meeting" });
      return;
    }

    const allowedUpdates = [
      "title",
      "date",
      "time",
      "duration",
      "durationSeconds",
      "status",
      "attendees",
      "minutes",
    ];

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        (meeting as any)[key] = req.body[key];
      }
    }

    await meeting.save();

    res.json({
      success: true,
      meeting: meeting.toJSON(),
    });
  } catch (error: any) {
    console.error("Error updating meeting:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update meeting",
      details: error.message,
    });
  }
}

/* ── DELETE /api/meetings/:id ──────────────────────────────── */
export async function deleteMeeting(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: "Invalid ID" });
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { meetingId: id }] }
      : { meetingId: id };

    const meeting = await Meeting.findOne(query);

    if (!meeting) {
      res.status(404).json({ success: false, error: "Meeting not found" });
      return;
    }

    if (meeting.user && req.user && meeting.user.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Forbidden: Not authorized to delete this meeting" });
      return;
    }

    await meeting.deleteOne();

    res.json({
      success: true,
      message: "Meeting deleted successfully",
      meetingId: id,
    });
  } catch (error: any) {
    console.error("Error deleting meeting:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete meeting",
    });
  }
}

/* ── PATCH /api/meetings/:id/actions/:actionId ─────────────── */
export async function toggleActionItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const actionId = Array.isArray(req.params.actionId) ? req.params.actionId[0] : req.params.actionId;
    const { completed } = req.body;

    if (!id || !actionId) {
      res.status(400).json({ success: false, error: "Invalid ID or Action ID" });
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId
      ? { $or: [{ _id: id }, { meetingId: id }] }
      : { meetingId: id };

    const meeting = await Meeting.findOne(query);

    if (!meeting) {
      res.status(404).json({ success: false, error: "Meeting not found" });
      return;
    }

    const item = meeting.minutes.actionItems.find((a) => a.id === actionId);
    if (!item) {
      res.status(404).json({ success: false, error: "Action item not found" });
      return;
    }

    item.completed = typeof completed === "boolean" ? completed : !item.completed;
    meeting.markModified("minutes.actionItems");
    await meeting.save();

    res.json({
      success: true,
      actionItem: item,
      meeting: meeting.toJSON(),
    });
  } catch (error: any) {
    console.error("Error toggling action item:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update action item",
    });
  }
}
