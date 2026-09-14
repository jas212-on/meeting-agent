import rateLimit from "express-rate-limit";

// Strict rate limiter for authentication routes (login, register)
// Max 10 attempts per 15 minutes per IP to prevent brute-force attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: {
    success: false,
    error: "Too many requests from this IP, please try again after a few minutes.",
  },
});
