import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User.js";
import { AuthRequest } from "../middleware/auth.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function generateToken(id: string, email: string): string {
  const secret = process.env.JWT_SECRET || "default_jwt_secret_fallback";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign({ id, email }, secret, { expiresIn: expiresIn as any });
}

// POST /api/auth/register
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        error: "Please provide name, email, and password.",
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long.",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: "Please provide a valid email address.",
      });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: "An account with this email already exists.",
      });
      return;
    }

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
    });

    const token = generateToken(user._id.toString(), user.email);

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during registration.",
    });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: "Please provide both email and password.",
      });
      return;
    }

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
      return;
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password.",
      });
      return;
    }

    const token = generateToken(user._id.toString(), user.email);

    res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error during login.",
    });
  }
}

// GET /api/auth/me
export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "User not authenticated.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error: any) {
    console.error("GetMe error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve user profile.",
    });
  }
}

// GET /api/auth/users - list registered users for group selection
export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q } = req.query;
    const filter: Record<string, any> = {};

    if (q && typeof q === "string" && q.trim()) {
      const searchRegex = new RegExp(q.trim(), "i");
      filter.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    // Seed a few sample colleagues if none or few exist, ensuring quick collaboration testing
    const count = await User.countDocuments();
    if (count < 4) {
      const sampleUsers = [
        { name: "Sarah Chen", email: "sarah.chen@techcorp.io", password: "password123" },
        { name: "Marcus Vance", email: "marcus.vance@techcorp.io", password: "password123" },
        { name: "Elena Rostova", email: "elena.rostova@techcorp.io", password: "password123" },
        { name: "David Kim", email: "david.kim@techcorp.io", password: "password123" },
      ];
      for (const su of sampleUsers) {
        const exists = await User.findOne({ email: su.email });
        if (!exists) {
          await User.create(su).catch(() => {});
        }
      }
    }

    // Exclude current requesting user if needed, or include them so groups can list all
    const users = await User.find(filter)
      .select("name email createdAt")
      .sort({ name: 1 })
      .limit(100)
      .lean();


    const formatted = users.map((u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      users: formatted,
    });
  } catch (error: any) {
    console.error("GetUsers error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve registered users.",
    });
  }
}

// POST /api/auth/google
export async function googleLogin(req: Request, res: Response): Promise<void> {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({
        success: false,
        error: "Missing Google credential token.",
      });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(500).json({
        success: false,
        error: "Server Google Client ID is not configured.",
      });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({
        success: false,
        error: "Invalid Google token payload.",
      });
      return;
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const name = payload.name?.trim() || email.split("@")[0];
    const avatar = payload.picture;

    // Find user by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      let needsSave = false;
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }
      if (avatar && !user.avatar) {
        user.avatar = avatar;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    } else {
      user = await User.create({
        name,
        email,
        googleId,
        avatar,
        authProvider: "google",
      });
    }

    const token = generateToken(user._id.toString(), user.email);

    res.status(200).json({
      success: true,
      message: "Google login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    console.error("Google login error:", error);
    res.status(401).json({
      success: false,
      error: "Google authentication failed. Please verify your credentials and try again.",
    });
  }
}



