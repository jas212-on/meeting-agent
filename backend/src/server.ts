import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB, closeDB, getDBStatus } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import meetingDataRoutes from "./routes/meetingDataRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import { apiLimiter } from "./middleware/rateLimiter.js";


// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Trust proxy header for Ngrok / reverse proxy support
app.set("trust proxy", 1);

// Connect to MongoDB
connectDB();

/* ── Middlewares ─────────────────────────────────────────── */
app.use(
  cors({
    origin: "*", // Allows requests from Vite dev server and production clients
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply general rate limiting across all API routes
app.use("/api", apiLimiter);

/* ── Health check ────────────────────────────────────────── */
app.get("/api/health", (_req: Request, res: Response) => {
  const dbInfo = getDBStatus();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: {
      status: dbInfo.state,
      name: dbInfo.dbName,
      host: dbInfo.host,
    },
  });
});

/* ── Route Mounts ────────────────────────────────────────── */
app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/meetings", meetingDataRoutes);
app.use("/api/chat", chatRoutes);
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
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 Meeting Agent Backend listening on http://127.0.0.1:${PORT}`);
});

/* ── Graceful Shutdown ───────────────────────────────────── */
async function handleShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await closeDB();
    process.exit(0);
  });
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
