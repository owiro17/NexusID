'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { signInWithPasskey } from '@/lib/supabase/passkeys';
import {
  Fingerprint,
  KeyRound,
  Mail,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Loader2,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/dashboard';
  const urlError = searchParams.get('error');

  const supabase = createClient();

  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean | null>(null);
  const [platformAuthenticatorAvailable, setPlatformAuthenticatorAvailable] = useState<boolean | null>(null);

  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [showMagicLinkForm, setShowMagicLinkForm] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'success' | 'info';
    text: string;
  } | null>(urlError ? { type: 'error', text: urlError } : null);

  useEffect(() => {
    async function checkCapabilities() {
      if (typeof window === 'undefined') return;

      if (!window.PublicKeyCredential) {
        setWebAuthnSupported(false);
        setPlatformAuthenticatorAvailable(false);
        return;
      }

      setWebAuthnSupported(true);

      try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setPlatformAuthenticatorAvailable(available);
      } catch {
        setPlatformAuthenticatorAvailable(false);
      }
    }

    checkCapabilities();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handlePasskeyLogin = async () => {
    setIsPasskeyLoading(true);
    setStatusMessage(null);

    try {
      const { data, error } = await signInWithPasskey(supabase);

      if (error) {
        if (error.name === 'NotAllowedError' || error.message?.includes('not allowed')) {
          setStatusMessage({
            type: 'info',
            text: 'Biometric verification was cancelled or timed out. Please try again.',
          });
        } else if (error.name === 'InvalidStateError') {
          setStatusMessage({
            type: 'error',
            text: 'This passkey is already active or could not be recognized on this machine.',
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: error.message || 'Passkey authentication failed. Try Magic Link recovery below.',
          });
        }
        setIsPasskeyLoading(false);
        return;
      }

      try {
        await fetch('/api/auth/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'PASSKEY_LOGIN_SUCCESS',
            metadata: { method: 'discoverable_credential' },
          }),
        });
      } catch (auditErr) {
        console.warn('Audit dispatch warning:', auditErr);
      }

      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      console.error('Passkey authentication exception:', err);
      setStatusMessage({
        type: 'error',
        text: 'An unexpected biometric verification error occurred.',
      });
      setIsPasskeyLoading(false);
    }
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || isMagicLinkLoading || resendCooldown > 0) return;

    setIsMagicLinkLoading(true);
    setStatusMessage(null);

    try {
      const origin = window.location.origin;
      const redirectUrl = `${origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        setStatusMessage({
          type: 'error',
          text: error.message,
        });
        setIsMagicLinkLoading(false);
        return;
      }

      setMagicLinkSent(true);
      setResendCooldown(60);
      setStatusMessage({
        type: 'success',
        text: 'If this email is valid, a secure login & recovery link has been dispatched.',
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Unable to dispatch Magic Link. Please check network connectivity.',
      });
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 mb-3 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
            <Fingerprint className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            NexusID <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">ZERO-TRUST</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Continuous Adaptive Identity & Passkey Portal
          </p>
        </div>

        <div className="mb-6 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span>Hardware Authenticator:</span>
          </div>
          {webAuthnSupported === null ? (
            <span className="text-slate-500 animate-pulse">Detecting...</span>
          ) : webAuthnSupported ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              {platformAuthenticatorAvailable ? 'TouchID / Hello Ready' : 'Security Key Ready'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <ShieldAlert className="w-3 h-3" />
              Unsupported Browser
            </span>
          )}
        </div>

        {statusMessage && (
          <div
            className={`mb-6 p-3.5 rounded-lg text-sm border flex items-start gap-2.5 ${
              statusMessage.type === 'error'
                ? 'bg-red-950/40 border-red-800/60 text-red-300'
                : statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-300'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            )}
            <div className="leading-snug">{statusMessage.text}</div>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handlePasskeyLogin}
            disabled={isPasskeyLoading || webAuthnSupported === false}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shadow-[0_0_25px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2.5 cursor-pointer"
          >
            {isPasskeyLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying Biometrics...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span>Sign in with Passkey</span>
              </>
            )}
          </button>

          <p className="text-xs text-center text-slate-500">
            One-click biometric verification (Face ID, Touch ID, Windows Hello, or YubiKey).
          </p>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-3 text-slate-500 font-mono">or recovery</span>
          </div>
        </div>

        {!showMagicLinkForm ? (
          <button
            onClick={() => setShowMagicLinkForm(true)}
            className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Mail className="w-4 h-4 text-slate-400" />
            <span>New to NexusID or lost your passkey device?</span>
          </button>
        ) : (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-3 bg-slate-950/60 border border-slate-800/80 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="email" className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>Email Recovery & Onboarding</span>
              </label>
              <button
                type="button"
                onClick={() => setShowMagicLinkForm(false)}
                className="text-xs text-slate-500 hover:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@nexusid.corp"
              required
              disabled={isMagicLinkLoading || magicLinkSent}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={isMagicLinkLoading || resendCooldown > 0 || !email}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-xs text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isMagicLinkLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Dispatching Magic Link...</span>
                </>
              ) : resendCooldown > 0 ? (
                <span>Resend available in {resendCooldown}s</span>
              ) : (
                <>
                  <span>Send Recovery Magic Link</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <Link
            href="/auth/signup"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
          >
            Don&apos;t have an account yet? Create account with Passkey →
          </Link>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-500" />
            FIDO2 / WebAuthn Level 3
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            Zero Phishing Surface
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}

