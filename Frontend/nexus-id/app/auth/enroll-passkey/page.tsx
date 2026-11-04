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
  if (typeof window === 'undefined') return 'My Device Passkey';

  const userAgent = navigator.userAgent;
  let os = 'Security Key';
  let browser = 'Browser';

  if (userAgent.indexOf('Win') !== -1) os = 'Windows Hello';
  else if (userAgent.indexOf('Mac') !== -1) os = 'MacBook Touch ID';
  else if (userAgent.indexOf('iPhone') !== -1) os = 'iPhone Face ID';
  else if (userAgent.indexOf('iPad') !== -1) os = 'iPad Touch ID';
  else if (userAgent.indexOf('Android') !== -1) os = 'Android Biometrics';
  else if (userAgent.indexOf('Linux') !== -1) os = 'Linux Passkey';

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
      }, 1200);
    } catch (err: any) {
      console.error('Passkey registration error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Passkey setup was cancelled.');
      } else if (err.name === 'InvalidStateError') {
        setError('This device is already registered as a passkey for your account.');
      } else {
        setError(err.message || 'Could not register passkey on this device.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md nexus-card-neumorphic rounded-3xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 mb-3 shadow-xs">
            <Fingerprint className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
            Add a device passkey
          </h1>
          <p className="text-xs text-slate-800 font-medium mt-1.5 leading-relaxed">
            Sign in and confirm transfers with a single biometric touch on this device.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs font-semibold flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-700 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-teal-50 border border-teal-300 text-teal-950 text-xs font-semibold flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Passkey added! Returning to your account...</span>
          </div>
        )}

        <form onSubmit={handleRegisterPasskey} className="space-y-4">
          <div>
            <label htmlFor="friendlyName" className="block text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <Laptop className="w-3.5 h-3.5 text-blue-700" />
              <span>Device name</span>
            </label>
            <input
              id="friendlyName"
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="e.g. Office Laptop"
              required
              disabled={isLoading || success}
              className="w-full px-3.5 py-2.5 rounded-xl nexus-input-neumorphic text-xs text-slate-950 placeholder-slate-500 font-medium disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || success}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving passkey...</span>
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                <span>Save passkey</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isLoading || success}
            className="text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Return to dashboard</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-700 font-semibold">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <span>Protected by NexusID</span>
        </div>
      </div>
    </div>
  );
}
