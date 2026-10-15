'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { registerPasskey, updatePasskey } from '@/lib/supabase/passkeys';
import {
  Fingerprint,
  ShieldCheck,
  Laptop,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

function detectDeviceFriendlyName(): string {
  if (typeof window === 'undefined') return 'My Security Key';

  const userAgent = navigator.userAgent;
  let os = 'Hardware Key';
  let browser = 'Browser';

  if (userAgent.indexOf('Win') !== -1) os = 'Windows Hello';
  else if (userAgent.indexOf('Mac') !== -1) os = 'MacBook / Touch ID';
  else if (userAgent.indexOf('iPhone') !== -1) os = 'iPhone Face ID';
  else if (userAgent.indexOf('iPad') !== -1) os = 'iPad Touch ID';
  else if (userAgent.indexOf('Android') !== -1) os = 'Android Biometrics';
  else if (userAgent.indexOf('Linux') !== -1) os = 'Linux Authenticator';

  if (userAgent.indexOf('Chrome') !== -1 && userAgent.indexOf('Edg') === -1) browser = 'Chrome';
  else if (userAgent.indexOf('Safari') !== -1 && userAgent.indexOf('Chrome') === -1) browser = 'Safari';
  else if (userAgent.indexOf('Edg') !== -1) browser = 'Edge';
  else if (userAgent.indexOf('Firefox') !== -1) browser = 'Firefox';

  return `${os} (${browser})`;
}

export default function EnrollPasskeyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [friendlyName, setFriendlyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setFriendlyName(detectDeviceFriendlyName());
  }, []);

  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: regError } = await registerPasskey(supabase, {
        friendlyName: friendlyName.trim() || 'NexusID Passkey',
      });
      if (regError) throw regError;
      const registeredId = data?.id || null;

      if (registeredId) {
        try {
          await updatePasskey(supabase, registeredId, friendlyName.trim() || 'NexusID Passkey');
        } catch (updateErr) {
          console.warn('Friendly name sync warning:', updateErr);
        }
      }

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'PASSKEY_REGISTERED',
          metadata: {
            friendly_name: friendlyName.trim(),
            passkey_id: registeredId,
          },
        }),
      });

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1500);
    } catch (err: any) {
      console.error('Passkey registration error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Biometric registration was cancelled by user.');
      } else if (err.name === 'InvalidStateError') {
        setError('This device or security key is already registered for this account.');
      } else {
        setError(err.message || 'Failed to enroll passkey on this device.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 mb-3 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <Fingerprint className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Register Your Device
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Bind a cryptographic passkey to enable instant, passwordless logins on this device.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-sm flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Passkey bound successfully! Redirecting to dashboard...</span>
          </div>
        )}

        <form onSubmit={handleRegisterPasskey} className="space-y-4">
          <div>
            <label htmlFor="friendlyName" className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-cyan-400" />
              <span>Passkey Device Label</span>
            </label>
            <input
              id="friendlyName"
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="e.g. MacBook Pro M3 - Chrome"
              required
              disabled={isLoading || success}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || success}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 active:scale-[0.99] disabled:opacity-50 transition-all duration-200 shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating WebAuthn Key...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span>Create & Bind Passkey</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isLoading || success}
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Skip for now (Not Recommended)</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>FIDO2 Resident Credential Stored in Secure Enclave</span>
        </div>
      </div>
    </div>
  );
}
