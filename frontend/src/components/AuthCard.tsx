import React, { useState } from "react";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Bot,
  Zap,
  Users,
  FileText,
  Loader2,
  X,
  ShieldCheck,
} from "lucide-react";
import { GoogleSignInButton } from "./GoogleSignInButton";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthCardProps {
  onSuccess: (token: string, user: UserProfile, message?: string) => void;
  onContinueAsGuest?: () => void;
  onClose?: () => void;
  isModal?: boolean;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

type PasswordMode = "login" | "register";

export const AuthCard: React.FC<AuthCardProps> = ({
  onSuccess,
  onContinueAsGuest,
  onClose,
  isModal = false,
  apiFetch,
}) => {
  // Mode: Sign In vs Create Account
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("login");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /* ── Form validation ───────────────────────────────────────── */
  const validateForm = (): boolean => {
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address (e.g. name@company.com).");
      return false;
    }

    if (!password) {
      setError("Please enter your password.");
      return false;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return false;
    }

    if (passwordMode === "register") {
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length < 2) {
        setError("Please enter your full name (at least 2 characters).");
        return false;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please re-enter your password.");
        return false;
      }
    }

    return true;
  };

  /* ── Handle Normal Email & Password Submit ─────────────────── */
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (passwordMode === "login") {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || "Login failed. Please check your credentials.");
          return;
        }

        onSuccess(data.token, data.user, `Welcome back, ${data.user.name || "User"}!`);
      } else {
        // Register mode
        const res = await apiFetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || "Registration failed. Please try again.");
          return;
        }

        onSuccess(data.token, data.user, `Account created! Welcome to MeetMinutes.ai, ${data.user.name}!`);
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      setError("Failed to connect to authentication server. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Handle Google Sign-In Success ─────────────────────────── */
  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Google authentication failed. Please try again.");
        return;
      }

      onSuccess(data.token, data.user, `Signed in with Google as ${data.user.name || "User"}!`);
    } catch (err: any) {
      console.error("Google auth request error:", err);
      setError("Failed to connect to authentication server. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-card-wrapper ${isModal ? "modal-mode" : ""}`}>
      {/* ── Header ────────────────────────────────────────── */}
      <div className="auth-header-block relative">
        {isModal && onClose && (
          <button
            type="button"
            className="modal-close-btn absolute top-4 right-4 text-slate-400 hover:text-slate-800 dark:hover:text-white"
            onClick={onClose}
            aria-label="Close authentication dialog"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="auth-logo-badge auth-logo-badge-blue">
          <Bot className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="auth-title">
          Meet<span className="brand-accent">Minutes</span>
          <span className="brand-tld">.ai</span>
        </h2>
        <p className="auth-subtitle">
          {passwordMode === "login"
            ? "Sign in with your email and password or Google to access your workspace."
            : "Create an account to deploy automated meeting bots and AI minutes."}
        </p>

        {!isModal && (
          <div className="auth-features-preview">
            <span className="auth-feature-tag">
              <Zap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Live Bot
            </span>
            <span className="auth-feature-tag">
              <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Attendance Audit
            </span>
            <span className="auth-feature-tag">
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Executive Minutes
            </span>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* ── Mode Toggle: Sign In vs Create Account in Blue Theme ── */}
        <div className="auth-sub-toggle auth-sub-toggle-blue">
          <button
            type="button"
            className={`auth-sub-toggle-btn ${passwordMode === "login" ? "active" : ""}`}
            onClick={() => {
              setPasswordMode("login");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-sub-toggle-btn ${passwordMode === "register" ? "active" : ""}`}
            onClick={() => {
              setPasswordMode("register");
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* ── Error Banner ─────────────────────────────────── */}
        {error && (
          <div className="form-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Success Banner ───────────────────────────────── */}
        {successMsg && (
          <div className="form-alert form-alert-success">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ── Option 1: Normal Login / Register Form ────────── */}
        <form noValidate onSubmit={handlePasswordSubmit} className="flex flex-col gap-3.5">
          {/* Name field (Registration only) */}
          {passwordMode === "register" && (
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="auth-name">
                Full Name <span className="required-star">*</span>
              </label>
              <div className="auth-input-wrapper">
                <User className="auth-input-icon" />
                <input
                  id="auth-name"
                  type="text"
                  className="auth-text-input"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div className="auth-input-group">
            <label className="auth-input-label" htmlFor="auth-email">
              Email Address <span className="required-star">*</span>
            </label>
            <div className="auth-input-wrapper">
              <Mail className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                className="auth-text-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="auth-input-group">
            <div className="flex justify-between items-center">
              <label className="auth-input-label" htmlFor="auth-password">
                Password <span className="required-star">*</span>
              </label>
              <span className="auth-hint-text">Min 6 characters</span>
            </div>
            <div className="auth-input-wrapper">
              <Lock className="auth-input-icon" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                className="auth-text-input pr-10"
                placeholder={passwordMode === "login" ? "Enter your password" : "At least 6 characters"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                autoComplete={passwordMode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className="auth-password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (Registration only) */}
          {passwordMode === "register" && (
            <div className="auth-input-group">
              <label className="auth-input-label" htmlFor="auth-confirm-password">
                Confirm Password <span className="required-star">*</span>
              </label>
              <div className="auth-input-wrapper">
                <ShieldCheck className="auth-input-icon" />
                <input
                  id="auth-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="auth-text-input pr-10"
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Primary Submit Button in Blue Theme */}
          <button
            type="submit"
            className="auth-primary-submit-btn auth-btn-blue"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{passwordMode === "login" ? "Signing In..." : "Creating Account..."}</span>
              </>
            ) : (
              <>
                <span>{passwordMode === "login" ? "Sign In with Password" : "Create Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* ── Divider ──────────────────────────────────────── */}
        <div className="auth-divider">
          <span>or sign in with</span>
        </div>

        {/* ── Option 2: Sign in with Google Button with Google Icon ── */}
        <div className="google-auth-button-row">
          <GoogleSignInButton
            text={passwordMode === "register" ? "signup_with" : "signin_with"}
            onSuccess={handleGoogleSuccess}
            onError={(err) => setError(err)}
            disabled={loading}
          />
        </div>

        {/* ── Guest Divider & Action ────────────────────────── */}
        {onContinueAsGuest && (
          <>
            <div className="auth-divider">
              <span>or continue without account</span>
            </div>

            <button
              type="button"
              className="guest-continue-btn"
              onClick={onContinueAsGuest}
            >
              <span>Continue as Guest</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
