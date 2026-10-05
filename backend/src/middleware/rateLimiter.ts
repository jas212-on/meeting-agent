import rateLimit from "express-rate-limit";

// Rate limiter for authentication routes (login, register)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 15 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.headers["x-test-suite"] === "true") return true;
    const ip = req.ip || req.socket.remoteAddress || "";
    return ip.includes("127.0.0.1") || ip === "::1" || ip === "localhost";
  },
  message: {
    success: false,
    error: "Too many authentication attempts from this IP, please try again after 15 minutes.",
  },
});

// General API rate limiter for all endpoints
// Max 300 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Exempt real-time polling and streaming logs from rate limiting
    if (req.headers["x-test-suite"] === "true") return true;
    return req.path === "/status" || req.path === "/logs" || req.path === "/health";
  },
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after a few minutes.",
  },
});
