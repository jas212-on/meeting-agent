import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Mic,
  Video,
  AlertTriangle,
  X,
  Play,
  ExternalLink,
  Lock,
} from "lucide-react";

interface ConsentModalProps {
  isOpen: boolean;
  meetingUrl: string;
  onClose: () => void;
  onConfirm: (options: { recordScreen: boolean }) => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  isOpen,
  meetingUrl,
  onClose,
  onConfirm,
}) => {
  const [recordScreen, setRecordScreen] = useState<boolean>(true);
  const [hasAgreed, setHasAgreed] = useState<boolean>(true);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAllow = () => {
    if (!hasAgreed) return;
    onConfirm({ recordScreen });
  };

  return (
    <div
      id="consent-modal-overlay"
      className="modal-overlay consent-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <div
        className="modal-card consent-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          id="consent-modal-close"
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close consent dialog"
          title="Close dialog (Decline)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="consent-modal-header">
          <div className="consent-header-icon-wrapper">
            <div className="consent-header-icon-glow" />
            <div className="consent-icon-badge">
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </div>
          </div>
          <div className="consent-header-text">
            <div className="consent-badge-row">
              <span className="consent-security-badge">
                <Lock className="w-3 h-3 text-emerald-400 inline mr-1" />
                Privacy &amp; Permissions
              </span>
            </div>
            <h3 id="consent-modal-title" className="consent-modal-title">
              Meeting Recording Consent
            </h3>
            <p className="consent-modal-subtitle">
              The MeetMinutes AI bot requires your explicit authorization before joining and recording this call.
            </p>
          </div>
        </div>

        {/* Meeting Target URL Preview */}
        {meetingUrl && (
          <div className="consent-url-bar">
            <span className="consent-url-label">Target Room:</span>
            <span className="consent-url-value" title={meetingUrl}>
              {meetingUrl}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </div>
        )}

        {/* Permissions Body */}
        <div className="consent-modal-body">
          {/* Permission Item 1: Audio Recording */}
          <div className="consent-permission-card active">
            <div className="permission-icon-box permission-icon-audio">
              <Mic className="w-5 h-5" />
            </div>
            <div className="permission-content">
              <div className="permission-title-row">
                <span className="permission-title">Audio Recording &amp; Transcription</span>
                <span className="permission-badge required">Required</span>
              </div>
              <p className="permission-desc">
                Allow the bot to listen to incoming caller audio, transcribe speaker dialogue in real time, and compile structured executive minutes and action items.
              </p>
            </div>
          </div>

          {/* Permission Item 2: Screen Recording */}
          <div
            className={`consent-permission-card toggleable ${recordScreen ? "selected" : ""}`}
            onClick={() => setRecordScreen(!recordScreen)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setRecordScreen(!recordScreen);
              }
            }}
          >
            <div className="permission-icon-box permission-icon-video">
              <Video className="w-5 h-5" />
            </div>
            <div className="permission-content">
              <div className="permission-title-row">
                <span className="permission-title">Screen Recording &amp; Visual Capture</span>
                <span className="permission-badge recommended">Recommended</span>
              </div>
              <p className="permission-desc">
                Allow the bot to capture the presenter screen and shared slides for HD meeting playback archive and visual evidence.
              </p>
            </div>
            <div className="permission-checkbox-col">
              <input
                id="consent-screen-checkbox"
                type="checkbox"
                className="permission-checkbox-input"
                checked={recordScreen}
                onChange={(e) => setRecordScreen(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Compliance & Participant Notice Notice */}
          <div className="consent-notice-box">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="consent-notice-text">
              <strong>Participant Notification:</strong> By allowing the bot to join, you confirm that meeting participants are informed and consent to automated recording in accordance with applicable privacy policies.
            </div>
          </div>

          {/* Acknowledgment Agreement Checkbox */}
          <label className="consent-agreement-label" htmlFor="consent-agree-checkbox">
            <input
              id="consent-agree-checkbox"
              type="checkbox"
              className="permission-checkbox-input"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
            />
            <span className="agreement-text">
              I authorize the AI bot to join the call and record audio and screen content.
            </span>
          </label>
        </div>

        {/* Modal Footer Actions */}
        <div className="consent-modal-footer">
          <button
            id="consent-cancel-btn"
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
          >
            Don&apos;t Allow
          </button>
          <button
            id="consent-allow-btn"
            type="button"
            className="btn-consent-allow"
            disabled={!hasAgreed}
            onClick={handleAllow}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Allow &amp; Join Meeting</span>
          </button>
        </div>
      </div>
    </div>
  );
};
