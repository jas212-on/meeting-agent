import { Router } from "express";
import { optionalAuth } from "../middleware/auth.js";
import {
  getMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  toggleActionItem,
} from "../controllers/meetingController.js";

const router = Router();

// Meeting collection routes
router.get("/", optionalAuth, getMeetings);
router.post("/", optionalAuth, createMeeting);

// Specific meeting routes
router.get("/:id", optionalAuth, getMeetingById);
router.put("/:id", optionalAuth, updateMeeting);
router.delete("/:id", optionalAuth, deleteMeeting);

// Subdocument action item toggle
router.patch("/:id/actions/:actionId", optionalAuth, toggleActionItem);

export default router;
