import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { Group } from "../models/Group.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

function extractMeetingId(url: string): string {
  try {
    const match = url.match(/meet\.google\.com\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return match[1].replace(/[^a-zA-Z0-9-]/g, "");
    }
  } catch {
    // fallback
  }
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const r = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${r(3)}-${r(4)}-${r(3)}`;
}

// GET /api/groups
export async function getGroups(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const userId = req.user._id;

    // Groups where user is creator/admin OR member
    const groups = await Group.find({
      $or: [{ admin: userId }, { members: userId }],
    })
      .populate("admin", "name email")
      .populate("members", "name email")
      .sort({ updatedAt: -1 })
      .lean();

    const formatted = groups.map((g: any) => ({
      id: g._id.toString(),
      name: g.name,
      description: g.description || "",
      admin: {
        id: g.admin?._id ? g.admin._id.toString() : g.admin?.toString(),
        name: g.admin?.name || "Unknown Admin",
        email: g.admin?.email || "",
      },
      members: (g.members || []).map((m: any) => ({
        id: m._id ? m._id.toString() : m.toString(),
        name: m.name || "User",
        email: m.email || "",
      })),
      activeMeeting: g.activeMeeting || null,
      isAdmin: g.admin?._id?.toString() === userId.toString(),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      groups: formatted,
    });
  } catch (error: any) {
    console.error("Error fetching groups:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch groups",
      details: error.message,
    });
  }
}

// GET /api/groups/:id
export async function getGroupById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const id = typeof req.params.id === "string" ? req.params.id : String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Invalid group ID format" });
      return;
    }

    const group: any = await Group.findById(id)
      .populate("admin", "name email")
      .populate("members", "name email")
      .lean();

    if (!group) {
      res.status(404).json({ success: false, error: "Group not found" });
      return;
    }

    const userId = req.user._id.toString();
    const adminId = group.admin?._id?.toString() || group.admin?.toString();
    const memberIds = (group.members || []).map((m: any) => (m._id ? m._id.toString() : m.toString()));

    const isMemberOrAdmin = adminId === userId || memberIds.includes(userId);
    if (!isMemberOrAdmin) {
      res.status(403).json({ success: false, error: "You are not a member of this group" });
      return;
    }

    res.status(200).json({
      success: true,
      group: {
        id: group._id.toString(),
        name: group.name,
        description: group.description || "",
        admin: {
          id: adminId,
          name: group.admin?.name || "Unknown Admin",
          email: group.admin?.email || "",
        },
        members: (group.members || []).map((m: any) => ({
          id: m._id ? m._id.toString() : m.toString(),
          name: m.name || "User",
          email: m.email || "",
        })),
        activeMeeting: group.activeMeeting || null,
        isAdmin: adminId === userId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching group:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch group",
      details: error.message,
    });
  }
}

// POST /api/groups
export async function createGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { name, description, memberIds } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: "Group name is required and must be at least 2 characters long",
      });
      return;
    }

    const currentUserId = req.user._id;

    // Validate and clean memberIds
    let validMembers: mongoose.Types.ObjectId[] = [];
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        if (mongoose.Types.ObjectId.isValid(id)) {
          // Avoid duplicating current admin user in members
          if (id.toString() !== currentUserId.toString()) {
            validMembers.push(new mongoose.Types.ObjectId(id));
          }
        }
      }
    }

    const newGroup = await Group.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      admin: currentUserId,
      members: validMembers,
      activeMeeting: null,
    });

    const populated: any = await Group.findById(newGroup._id)
      .populate("admin", "name email")
      .populate("members", "name email")
      .lean();

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      group: {
        id: populated._id.toString(),
        name: populated.name,
        description: populated.description || "",
        admin: {
          id: populated.admin._id.toString(),
          name: populated.admin.name,
          email: populated.admin.email,
        },
        members: (populated.members || []).map((m: any) => ({
          id: m._id.toString(),
          name: m.name,
          email: m.email,
        })),
        activeMeeting: populated.activeMeeting || null,
        isAdmin: true,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error creating group:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create group",
      details: error.message,
    });
  }
}

// PUT /api/groups/:id
export async function updateGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const id = typeof req.params.id === "string" ? req.params.id : String(req.params.id || "");
    const { name, description, memberIds } = req.body;

    const group = await Group.findById(id);
    if (!group) {
      res.status(404).json({ success: false, error: "Group not found" });
      return;
    }

    // Only the group's admin (creator) can modify it
    if (group.admin.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Only the group creator/admin can modify this group",
      });
      return;
    }

    if (name && typeof name === "string") {
      group.name = name.trim();
    }
    if (description !== undefined) {
      group.description = String(description).trim();
    }
    if (Array.isArray(memberIds)) {
      const validMembers: mongoose.Types.ObjectId[] = [];
      for (const mId of memberIds) {
        if (mongoose.Types.ObjectId.isValid(mId) && mId.toString() !== req.user._id.toString()) {
          validMembers.push(new mongoose.Types.ObjectId(mId));
        }
      }
      group.members = validMembers;
    }

    await group.save();

    const populated: any = await Group.findById(group._id)
      .populate("admin", "name email")
      .populate("members", "name email")
      .lean();

    res.status(200).json({
      success: true,
      message: "Group updated successfully",
      group: {
        id: populated._id.toString(),
        name: populated.name,
        description: populated.description || "",
        admin: {
          id: populated.admin._id.toString(),
          name: populated.admin.name,
          email: populated.admin.email,
        },
        members: (populated.members || []).map((m: any) => ({
          id: m._id.toString(),
          name: m.name,
          email: m.email,
        })),
        activeMeeting: populated.activeMeeting || null,
        isAdmin: true,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error updating group:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update group",
      details: error.message,
    });
  }
}

// POST /api/groups/:id/meeting - Admin shares Google Meet link with group
export async function shareMeetingLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const id = typeof req.params.id === "string" ? req.params.id : String(req.params.id || "");
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ success: false, error: "Meeting URL is required" });
      return;
    }

    const meetRe = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;
    if (!meetRe.test(url.trim())) {
      res.status(400).json({
        success: false,
        error: "Invalid Google Meet URL. Format: https://meet.google.com/xxx-xxxx-xxx",
      });
      return;
    }

    const group = await Group.findById(id);
    if (!group) {
      res.status(404).json({ success: false, error: "Group not found" });
      return;
    }

    // Only the group's admin can share/update the meeting link
    if (group.admin.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Only the group creator/admin can share meeting links for this group",
      });
      return;
    }

    const meetingId = extractMeetingId(url.trim());

    group.activeMeeting = {
      url: url.trim(),
      meetingId,
      sharedAt: new Date(),
      status: "active",
    };

    await group.save();

    res.status(200).json({
      success: true,
      message: "Meeting link shared with all group participants",
      activeMeeting: group.activeMeeting,
    });
  } catch (error: any) {
    console.error("Error sharing meeting link:", error);
    res.status(500).json({
      success: false,
      error: "Failed to share meeting link",
      details: error.message,
    });
  }
}

// DELETE /api/groups/:id/meeting - Admin ends/clears the active meeting
export async function clearMeetingLink(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const id = typeof req.params.id === "string" ? req.params.id : String(req.params.id || "");
    const group = await Group.findById(id);
    if (!group) {
      res.status(404).json({ success: false, error: "Group not found" });
      return;
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Only the group creator/admin can end meetings for this group",
      });
      return;
    }

    group.activeMeeting = undefined;
    await group.save();

    res.status(200).json({
      success: true,
      message: "Active meeting cleared for this group",
    });
  } catch (error: any) {
    console.error("Error clearing meeting link:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clear meeting link",
      details: error.message,
    });
  }
}

// DELETE /api/groups/:id - Admin deletes the group
export async function deleteGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const id = typeof req.params.id === "string" ? req.params.id : String(req.params.id || "");
    const group = await Group.findById(id);
    if (!group) {
      res.status(404).json({ success: false, error: "Group not found" });
      return;
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Only the group creator/admin can delete this group",
      });
      return;
    }

    await Group.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting group:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete group",
      details: error.message,
    });
  }
}
