import { Router } from "express";
import { register, login, googleLogin, getMe, getUsers } from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// Registration, Login & Google OAuth are protected by strict rate limiter
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/google", authLimiter, googleLogin);

// Profile inspection requires valid JWT
router.get("/me", authenticateToken, getMe);

// List registered users for group creation member selection
router.get("/users", authenticateToken, getUsers);

export default router;

