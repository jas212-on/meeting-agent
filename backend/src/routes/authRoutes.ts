import { Router } from "express";
import { register, login, getMe } from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// Registration & Login are protected by strict rate limiter
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

// Profile inspection requires valid JWT
router.get("/me", authenticateToken, getMe);

export default router;
