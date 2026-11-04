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
      const { error } = await signInWithPasskey(supabase);

      if (error) {
        if (error.name === 'NotAllowedError' || error.message?.includes('not allowed')) {
          setStatusMessage({
            type: 'info',
            text: 'Passkey sign-in was cancelled. You can try again whenever you are ready.',
          });
        } else if (error.name === 'InvalidStateError') {
          setStatusMessage({
            type: 'error',
            text: 'This passkey could not be recognized on this device.',
          });
        } else {
          setStatusMessage({
            type: 'error',
            text: error.message || 'Passkey sign-in failed. You can use an email sign-in link below.',
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
        text: 'An unexpected error occurred during sign-in.',
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
        text: 'We have sent a secure sign-in link to your email address.',
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Could not send sign-in link. Please check your internet connection.',
      });
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md nexus-card-neumorphic rounded-3xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white mb-3 shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Sign in to NexusID
          </h1>
          <p className="text-xs text-slate-700 font-medium mt-1">
            Banking that knows it&apos;s you
          </p>
        </div>

        <div className="mb-6 p-3.5 rounded-2xl nexus-well-inset flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <KeyRound className="w-4 h-4 text-blue-700" />
            <span>Device passkey:</span>
          </div>
          {webAuthnSupported === null ? (
            <span className="text-slate-600 font-medium">Checking...</span>
          ) : webAuthnSupported ? (
            <span className="flex items-center gap-1.5 text-teal-900 font-bold">
              <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />
              {platformAuthenticatorAvailable ? 'Touch ID / Windows Hello ready' : 'Security key ready'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-900 font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              Use email link below
            </span>
          )}
        </div>

        {statusMessage && (
          <div
            className={`mb-6 p-4 rounded-xl text-xs font-semibold border flex items-start gap-2.5 ${
              statusMessage.type === 'error'
                ? 'bg-red-50 border-red-300 text-red-950'
                : statusMessage.type === 'success'
                ? 'bg-teal-50 border-teal-300 text-teal-950'
                : 'bg-blue-50 border-blue-300 text-blue-950'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-700 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700 mt-0.5" />
            )}
            <div className="leading-relaxed">{statusMessage.text}</div>
          </div>
        )}

        <div className="space-y-3.5">
          <button
            onClick={handlePasskeyLogin}
            disabled={isPasskeyLoading || webAuthnSupported === false}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPasskeyLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span>Sign in with passkey</span>
              </>
            )}
          </button>

          <p className="text-xs text-center text-slate-700 font-medium">
            Use Face ID, Touch ID, Windows Hello, or your security key.
          </p>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-300" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-600 font-medium">or</span>
          </div>
        </div>

        {!showMagicLinkForm ? (
          <button
            onClick={() => setShowMagicLinkForm(true)}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Mail className="w-4 h-4 text-slate-700" />
            <span>Sign in with an email link instead</span>
          </button>
        ) : (
          <form onSubmit={handleMagicLinkSubmit} className="space-y-3.5 nexus-well-inset rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="email" className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-700" />
                <span>Email sign-in link</span>
              </label>
              <button
                type="button"
                onClick={() => setShowMagicLinkForm(false)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.co.ke"
              required
              disabled={isMagicLinkLoading || magicLinkSent}
              className="w-full px-3.5 py-2.5 rounded-xl nexus-input-neumorphic text-xs text-slate-950 placeholder-slate-500 font-medium disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={isMagicLinkLoading || resendCooldown > 0 || !email}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-slate-950 hover:bg-slate-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {isMagicLinkLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending link...</span>
                </>
              ) : resendCooldown > 0 ? (
                <span>Resend available in {resendCooldown}s</span>
              ) : (
                <>
                  <span>Send sign-in link</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <Link
            href="/auth/signup"
            className="text-xs text-blue-700 hover:text-blue-900 font-bold transition-colors"
          >
            New to NexusID? Open an account →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center text-slate-800">
          <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
        </div>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}
