import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Connect to MongoDB
connectDB();

/* ── Middlewares ─────────────────────────────────────────── */
app.use(
  cors({
    origin: "*", // Allows requests from Vite dev server and production clients
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting across all API routes
app.use("/api", apiLimiter);

/* ── Health check ────────────────────────────────────────── */
app.get("/api/health", (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1
      ? "connected"
      : dbState === 2
      ? "connecting"
      : dbState === 3
      ? "disconnecting"
      : "disconnected";

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      name: mongoose.connection.name,
    },
  });
});

/* ── Route Mounts ────────────────────────────────────────── */
app.use("/api/auth", authRoutes);
app.use("/api", meetingRoutes);

/* ── 404 Not Found Handler ───────────────────────────────── */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

/* ── Global Error Handler ────────────────────────────────── */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

/* ── Start Server ────────────────────────────────────────── */
app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Meeting Agent Backend listening on http://127.0.0.1:${PORT}`);
});
