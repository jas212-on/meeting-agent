import { Router, Response } from "express";
import { optionalAuth, AuthRequest } from "../middleware/auth.js";
import { askMeetings } from "../services/ragService.js";

const router = Router();

/**
 * POST /api/chat/ask-meetings
 * Ask natural language questions across recorded meeting history or about a specific meeting.
 */
router.post("/ask-meetings", optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { question, meetingId, history } = req.body as {
      question?: string;
      meetingId?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!question || typeof question !== "string" || !question.trim()) {
      res.status(400).json({
        success: false,
        error: "Question is required and must be a non-empty string.",
      });
      return;
    }

    const userId = req.user?._id?.toString();

    const result = await askMeetings({
      question: question.trim(),
      userId,
      meetingId: meetingId?.trim() || undefined,
      history: Array.isArray(history) ? history : [],
    });

    res.json({
      success: true,
      answer: result.answer,
      citedMeetings: result.citedMeetings,
    });
  } catch (err: any) {
    console.error("[ChatRoutes] Error processing ask-meetings request:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to process question. Please try again.",
    });
  }
});

export default router;
