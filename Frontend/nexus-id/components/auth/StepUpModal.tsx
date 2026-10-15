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
  actionDescription = 'Elevated Security Action',
  currentRiskScore = 75,
}: StepUpModalProps) {
  const supabase = createClient();
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (onClose) onClose();
    if (onCancel) onCancel();
  };

  const handleSuccess = (method: 'passkey' | 'otp') => {
    if (onVerified) onVerified();
    if (onVerify) onVerify(method);
    handleClose();
  };

  // Primary: Passkey Verification
  const handlePasskeyVerification = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const { data, error: passkeyError } = await signInWithPasskey(supabase);

      if (passkeyError) {
        if (passkeyError.name === 'NotAllowedError') {
          setError('Biometric gesture was cancelled.');
        } else {
          setError(passkeyError.message || 'Passkey re-authentication failed.');
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
      setError(err.message || 'Step-up verification encountered an error.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Fallback: OTP Verification
  const handleRequestOtp = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) throw new Error('User email not found in active session.');

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) throw otpError;
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch verification code.');
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.15)] relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-amber-400 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/30">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Step-Up Verification</h3>
            <p className="text-xs text-amber-400/80 font-mono">
              Risk Score Elevated: {currentRiskScore}/100
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-6 leading-relaxed">
          NexusID Zero-Trust engine detected anomalous behavioral telemetry. Cryptographic re-verification is required to authorize:
          <span className="block mt-1 font-semibold text-white bg-slate-950 p-2 rounded border border-slate-800">
            {actionDescription}
          </span>
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {!fallbackMode ? (
          <div className="space-y-4">
            <button
              onClick={handlePasskeyVerification}
              disabled={isVerifying}
              className="w-full py-3.5 px-4 rounded-xl font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 active:scale-[0.99] disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verifying Biometrics...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  <span>Verify with Passkey</span>
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setFallbackMode(true)}
                className="text-xs text-slate-400 hover:text-slate-300 underline cursor-pointer"
              >
                Hardware key not accessible? Use Email OTP
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!otpSent ? (
              <div className="text-center space-y-3">
                <p className="text-xs text-slate-400">
                  Send a one-time 6-digit verification code to your verified email address.
                </p>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isVerifying}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  <span>Request Verification Code</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <label className="block text-xs font-medium text-slate-300">
                  Enter 6-Digit Email Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  required
                  className="w-full text-center tracking-widest font-mono text-lg py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Confirm Step-Up Authorization</span>
                </button>
              </form>
            )}

            <div className="text-center">
              <button
                type="button"
                onClick={() => setFallbackMode(false)}
                className="text-xs text-slate-400 hover:text-slate-300 underline cursor-pointer"
              >
                Back to Passkey Biometric Verification
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StepUpModal;
