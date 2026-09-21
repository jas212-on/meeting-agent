import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  shareMeetingLink,
  clearMeetingLink,
} from "../controllers/groupController.js";

const router = Router();

// All group endpoints require a valid authenticated user
router.use(authenticateToken);

// Collection routes
router.get("/", getGroups);
router.post("/", createGroup);

// Single group routes
router.get("/:id", getGroupById);
router.put("/:id", updateGroup);
router.delete("/:id", deleteGroup);

// Meeting sharing within group
router.post("/:id/meeting", shareMeetingLink);
router.delete("/:id/meeting", clearMeetingLink);

export default router;
