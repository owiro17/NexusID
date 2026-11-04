'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { signInWithPasskey } from '@/lib/supabase/passkeys';
import {
  ShieldAlert,
  Fingerprint,
  Mail,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export interface StepUpModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onVerified?: () => void;
  onVerify?: (method: 'passkey' | 'otp') => void;
  actionDescription?: string;
  currentRiskScore?: number;
}

export function StepUpModal({
  isOpen,
  onClose,
  onCancel,
  onVerified,
  onVerify,
  actionDescription = 'Confirm account action',
  currentRiskScore = 75,
}: StepUpModalProps) {
  const supabase = createClient();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  if (!isOpen) return null;

  const trustScore = Math.max(0, Math.min(100, Math.round(100 - currentRiskScore)));

  const handleClose = () => {
    if (onClose) onClose();
    if (onCancel) onCancel();
  };

  const handleSuccess = (method: 'passkey' | 'otp') => {
    if (onVerified) onVerified();
    if (onVerify) onVerify(method);
    handleClose();
  };

  const handlePasskeyVerification = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const { error: passkeyError } = await signInWithPasskey(supabase);

      if (passkeyError) {
        if (passkeyError.name === 'NotAllowedError') {
          setError('Passkey prompt was cancelled.');
        } else {
          setError(passkeyError.message || 'Passkey verification did not complete.');
        }
        setIsVerifying(false);
        return;
      }

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'STEP_UP_VERIFIED',
          recordedRiskScore: 0,
          metadata: {
            reason: 'behavioral_anomaly_cleared',
            action: actionDescription,
            prior_risk_score: currentRiskScore,
          },
        }),
      });

      handleSuccess('passkey');
    } catch (err: any) {
      setError(err.message || 'Verification encountered an error.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRequestOtp = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) throw new Error('Account email not found.');

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) throw otpError;
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Could not send verification code.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;
    setIsVerifying(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Session not found.');

      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: user.email,
        token: otpCode.trim(),
        type: 'email',
      });

      if (verifyErr) throw verifyErr;

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'STEP_UP_VERIFIED',
          recordedRiskScore: 0,
          metadata: {
            method: 'email_otp_fallback',
            action: actionDescription,
          },
        }),
      });

      handleSuccess('otp');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md nexus-card-neumorphic rounded-3xl p-6 sm:p-8 shadow-2xl relative">
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-slate-500 hover:text-slate-900 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-5">
          <div className="p-3 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-950 text-xl tracking-tight">Confirm it&apos;s you</h3>
            <p className="text-xs text-amber-950 font-bold tabular-nums">
              Current trust score: {trustScore} / 100
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-800 font-medium mb-5 leading-relaxed">
          To keep your account safe, please verify once with your passkey to complete:
          <span className="block mt-2 font-bold text-slate-950 nexus-well-inset p-3.5 rounded-2xl">
            {actionDescription}
          </span>
        </p>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs font-semibold flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
            <span>{error}</span>
          </div>
        )}

        {!fallbackMode ? (
          <div className="space-y-4">
            <button
              onClick={handlePasskeyVerification}
              disabled={isVerifying}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verifying passkey...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  <span>Verify with passkey</span>
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setFallbackMode(true)}
                className="text-xs font-semibold text-slate-700 hover:text-blue-700 underline cursor-pointer"
              >
                Use an email verification code instead
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!otpSent ? (
              <div className="text-center space-y-3.5">
                <p className="text-xs text-slate-800 font-medium">
                  We can send a 6-digit code to your registered email address.
                </p>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isVerifying}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isVerifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 text-blue-700" />
                  )}
                  <span>Send verification code</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                <label className="block text-xs font-bold text-slate-900">
                  Enter 6-digit email code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full nexus-input-neumorphic text-center tracking-widest text-lg font-bold tabular-nums py-2.5 rounded-xl text-slate-950"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isVerifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Confirm code</span>
                </button>
              </form>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => setFallbackMode(false)}
                className="text-xs font-semibold text-slate-700 hover:text-blue-700 underline cursor-pointer"
              >
                Back to passkey verification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StepUpModal;
