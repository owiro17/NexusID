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
  ArrowLeft,
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

  // Step 1: Create Supabase Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      // 1. Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        setStatusMessage({
          type: 'error',
          text: authError?.message || 'Failed to create account.',
        });
        setIsLoading(false);
        return;
      }

      // If user session is not automatically active, sign them in with password
      if (!authData.session) {
        const { data: loginData, error: loginError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (loginError || !loginData.session) {
          // If Supabase has email confirmation enabled
          setStatusMessage({
            type: 'info',
            text: 'Confirmation link sent to your email. Please verify your email before continuing.',
          });
          setIsLoading(false);
          return;
        }
      }

      // 2. Ensure profile exists with account_type via upsert (avoids duplicate key error)
      await supabase
        .from('user_profiles')
        .upsert(
          {
            user_id: authData.user.id,
            email: email.trim(),
            account_type: 'Standard User',
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

  // Step 2: Register Biometric Device Passkey
  const handleRegisterPasskey = async () => {
    setIsLoading(true);
    setStatusMessage({
      type: 'info',
      text: 'Touch your sensor or follow your device prompt (Windows Hello / Touch ID / Face ID)...',
    });

    try {
      const { data: passkeyData, error: passkeyErr } = await registerPasskey(supabase, {
        friendlyName: 'Primary Device Passkey',
      });

      if (passkeyErr) {
        if (passkeyErr.name === 'NotAllowedError' || passkeyErr.message?.includes('not allowed')) {
          setStatusMessage({
            type: 'info',
            text: 'Biometric prompt was cancelled. You can retry below or skip to dashboard.',
          });
          setIsLoading(false);
          return;
        }
        throw passkeyErr;
      }

      // Update hardware_enrolled in user_profiles
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
        text: 'Passkey registered successfully! Redirecting to your secure dashboard...',
      });

      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1000);
    } catch (err: any) {
      console.error('Passkey enrollment error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Could not register passkey on this device. You can skip for now.',
      });
      setIsLoading(false);
    }
  };

  const handleSkipToDashboard = () => {
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-cyan-500 selection:text-black">
      {/* Background Cyber Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:24px_24px]" />

      <div className="relative w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6 text-slate-950" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white font-mono">
              Nexus<span className="text-cyan-400">ID</span>
            </span>
          </Link>
          <h1 className="text-xl font-bold text-slate-100">
            {step === 1 ? 'Create Zero-Trust Account' : 'Enroll Device Passkey'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {step === 1
              ? 'Fast onboarding for modern, passwordless enterprise banking'
              : 'Link your biometric authenticator for instantaneous passwordless access'}
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 1
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                1
              </span>
              <span className={step === 1 ? 'text-cyan-400 font-semibold' : 'text-slate-400'}>
                Credentials
              </span>
            </div>
            <div className="h-[1px] flex-1 mx-3 bg-slate-800" />
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                  step === 2
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                2
              </span>
              <span className={step === 2 ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
                Device Passkey
              </span>
            </div>
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`mb-6 p-4 rounded-xl text-xs flex items-start gap-3 border ${
                statusMessage.type === 'error'
                  ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  : statusMessage.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300'
              }`}
            >
              <div className="mt-0.5">
                {statusMessage.type === 'error' ? (
                  <Lock className="w-4 h-4 text-rose-400" />
                ) : statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Fingerprint className="w-4 h-4 text-cyan-400" />
                )}
              </div>
              <p className="flex-1 leading-relaxed">{statusMessage.text}</p>
            </div>
          )}

          {/* STEP 1: Account Setup */}
          {step === 1 && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">
                  Work / Corporate Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@enterprise-bank.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">
                  Initial Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used once to establish your cryptographic identity before passkey binding.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-sm hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Identity...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Passkey Binding</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: Biometric Device Passkey */}
          {step === 2 && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 shadow-inner">
                <Fingerprint className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-base font-semibold text-white">
                  Bind Hardware Passkey
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-sm mx-auto">
                  Register your device&apos;s built-in authenticator (Windows Hello, Touch ID, Face ID)
                  or a physical FIDO2 YubiKey for seamless, phishing-resistant logins.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={handleRegisterPasskey}
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-semibold text-sm hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Waiting for Biometric Gesture...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Register Device Passkey & Enter</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSkipToDashboard}
                  disabled={isLoading}
                  className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Skip for now, continue to Dashboard →
                </button>
              </div>
            </div>
          )}

          {/* Navigation Footer */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <Link
              href="/login"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              Already have an account? Sign in with Passkey →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
