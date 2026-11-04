'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { registerPasskey } from '@/lib/supabase/passkeys';
import {
  Fingerprint,
  ShieldCheck,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Lock,
  Mail,
  KeyRound,
} from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'success' | 'info';
    text: string;
  } | null>(null);

  const [createdUser, setCreatedUser] = useState<any>(null);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        setStatusMessage({
          type: 'error',
          text: authError?.message || 'Could not create account.',
        });
        setIsLoading(false);
        return;
      }

      if (!authData.session) {
        const { data: loginData, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (loginError || !loginData.session) {
          setStatusMessage({
            type: 'info',
            text: 'We sent a confirmation link to your email. Please verify your email to continue.',
          });
          setIsLoading(false);
          return;
        }
      }

      await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: authData.user.id,
            email: email.trim(),
            account_type: 'Business Account',
            behavioral_risk_score: 0,
            hardware_enrolled: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      setCreatedUser(authData.user);
      setStep(2);
      setStatusMessage(null);
    } catch (err: any) {
      console.error('Account creation error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'An unexpected error occurred during signup.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setIsLoading(true);
    setStatusMessage({
      type: 'info',
      text: 'Follow your device prompt (Windows Hello, Touch ID, or Face ID) to save your passkey...',
    });

    try {
      const { data: passkeyData, error: passkeyErr } = await registerPasskey(supabase, {
        friendlyName: 'Primary Device Passkey',
      });

      if (passkeyErr) {
        if (passkeyErr.name === 'NotAllowedError' || passkeyErr.message?.includes('not allowed')) {
          setStatusMessage({
            type: 'info',
            text: 'Passkey setup was skipped. You can try again below or continue to your account.',
          });
          setIsLoading(false);
          return;
        }
        throw passkeyErr;
      }

      if (createdUser?.id) {
        await supabase
          .from('user_profiles')
          .update({
            hardware_enrolled: true,
            last_verified_at: new Date().toISOString(),
          })
          .eq('user_id', createdUser.id);

        try {
          await fetch('/api/auth/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventType: 'PASSKEY_REGISTERED',
              metadata: {
                friendly_name: 'Primary Device Passkey',
                passkey_id: passkeyData?.id,
              },
            }),
          });
        } catch (auditErr) {
          console.warn('Audit error:', auditErr);
        }
      }

      setStatusMessage({
        type: 'success',
        text: 'Passkey saved! Opening your account...',
      });

      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 900);
    } catch (err: any) {
      console.error('Passkey enrollment error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Could not save passkey on this device. You can skip for now.',
      });
      setIsLoading(false);
    }
  };

  const handleSkipToDashboard = () => {
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white mb-3 shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-extrabold text-slate-950">
            {step === 1 ? 'Open your NexusID account' : 'Set up your passkey'}
          </h1>
          <p className="text-xs text-slate-700 font-medium mt-1">
            {step === 1
              ? 'Banking that knows it’s you — start with KSh 10,000.00 demo balance'
              : 'Use Face ID, Touch ID, or Windows Hello for one-tap sign-in'}
          </p>
        </div>

        <div className="nexus-card-neumorphic rounded-3xl p-6 sm:p-8">
          {/* Step Indicator */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-teal-50 text-teal-800 border border-teal-300'
                }`}
              >
                1
              </span>
              <span className={step === 1 ? 'text-slate-950 font-bold' : 'text-slate-600 font-medium'}>
                Account details
              </span>
            </div>
            <div className="h-[1px] flex-1 mx-3 bg-slate-300" />
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 2
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                2
              </span>
              <span className={step === 2 ? 'text-slate-950 font-bold' : 'text-slate-600 font-medium'}>
                Device passkey
              </span>
            </div>
          </div>

          {statusMessage && (
            <div
              className={`mb-6 p-4 rounded-xl text-xs font-semibold flex items-start gap-2.5 border ${
                statusMessage.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-950'
                  : statusMessage.type === 'success'
                  ? 'bg-teal-50 border-teal-300 text-teal-950'
                  : 'bg-blue-50 border-blue-300 text-blue-950'
              }`}
            >
              <div className="mt-0.5">
                {statusMessage.type === 'error' ? (
                  <Lock className="w-4 h-4 text-red-700" />
                ) : statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-teal-700" />
                ) : (
                  <Fingerprint className="w-4 h-4 text-blue-700" />
                )}
              </div>
              <p className="flex-1 leading-relaxed">{statusMessage.text}</p>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1.5">
                  Work or business email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.co.ke"
                    className="w-full nexus-input-neumorphic rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-950 placeholder-slate-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1.5">
                  Create a backup password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full nexus-input-neumorphic rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-950 placeholder-slate-500 font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-700">
                <Fingerprint className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Enable passkey sign-in
                </h3>
                <p className="text-xs text-slate-800 font-medium mt-1.5 leading-relaxed max-w-sm mx-auto">
                  Link this device&apos;s fingerprint or facial recognition so you can sign in and approve transfers with a single touch.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Waiting for device prompt...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Set up passkey & continue</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSkipToDashboard}
                  disabled={isLoading}
                  className="w-full py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  Skip for now →
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <Link
              href="/login"
              className="text-xs text-blue-700 hover:text-blue-900 font-bold transition-colors"
            >
              Already have an account? Sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
