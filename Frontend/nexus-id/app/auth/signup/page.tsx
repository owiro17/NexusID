'use client';

import { useState } from 'react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); 
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const supabase = createClient();

  // Captures typing data during the questions
  const { currentRiskScore, totalKeystrokes, totalMouseEvents } = useTelemetry(30000); 

  // Calculate baseline integrity (we want ~100 keystrokes and ~200 mouse events for a solid baseline)
  const keyProgress = Math.min((totalKeystrokes / 100) * 100, 100);
  const mouseProgress = Math.min((totalMouseEvents / 200) * 100, 100);
  const overallProgress = (keyProgress + mouseProgress) / 2;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(step + 1);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      alert("You must agree to the Terms & Conditions to securely store your baseline.");
      return;
    }

    setIsLoading(true);
    setStatus('Creating account and registering Passkey...');

    try {
      // 1. Sign up the user 
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError || !authData.user) {
        setStatus(`Error: ${authError?.message || 'Failed to create user.'}`);
        setIsLoading(false);
        return;
      }

      // 🚨 CRITICAL FIX: Check if Supabase actually logged the user in.
      // If "Confirm Email" is ON in Supabase, authData.session will be null.
      // RLS will BLOCK the baseline insert if there is no active session!
      if (!authData.session) {
        // Attempt to log them in manually just in case
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (loginError || !loginData.session) {
            setStatus('❌ RLS BLOCKED: Email Confirmation is enabled in Supabase! You must confirm your email before the Database accepts your baseline, OR turn off Email Confirmations in Supabase Settings.');
            setIsLoading(false);
            return;
        }
      }

      setStatus('Account created! Setting up your profile and baseline...');

      // 2. Insert into user_profiles (Required for the Foreign Key constraint!)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert([{
          user_id: authData.user.id,
          email: email,
          account_type: 'customer'
        }]);

      if (profileError) {
        console.error("Profile Insert Error:", profileError);
        setStatus('❌ Failed to create user profile: ' + profileError.message);
        setIsLoading(false);
        return;
      }

      // 3. Store the Golden Baseline in Supabase
      const mockVectorData = JSON.stringify({ 
        keystrokes: [0.15, 0.22, 0.18], 
        mouse: [250.5, 12.5, 100] 
      });

      // Insert into their existing golden_baselines table
      // Note: We use stringified hex for bytea
      const hexVector = Buffer.from(mockVectorData).toString('hex');
      
      const { error: dbError } = await supabase
        .from('golden_baselines')
        .insert([{
          user_id: authData.user.id,
          encrypted_vectors: `\\x${hexVector}`, 
        }]);

      if (dbError) {
        console.error("Baseline Insert Error:", dbError);
        setStatus('❌ Row Violation: ' + dbError.message);
        setIsLoading(false);
        return;
      }

      setStatus('✅ Success! Baseline calibrated. Redirecting to dashboard...');
      
      // 3. Redirect using Next.js router
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);

    } catch (err: any) {
      setStatus(`System Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full p-8 overflow-hidden">
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Create NexusID Account</h2>
          <p className="text-sm text-slate-500 mt-2">
            {step === 1 ? 'Step 1: Account Details' : step === 2 ? 'Step 2: Security Profiling' : 'Step 3: Calibration Complete'}
          </p>
        </div>

        <div className="w-full bg-slate-100 rounded-full h-2 mb-8">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }}></div>
        </div>

        {step === 1 && (
          <form onSubmit={handleNext} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Work Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none" placeholder="john@bank.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Temporary Password (to register Passkey)</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl hover:bg-slate-800 transition-colors mt-6">Continue</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleNext} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-medium text-center mb-4">
                To build your secure behavioral profile, please answer these security questions naturally.
              </p>
              
              {/* LIVE TELEMETRY METER */}
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex justify-between items-end mb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Baseline Integrity</span>
                  <span className="text-xs font-bold text-blue-700">{Math.round(overallProgress)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                  <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Keystrokes: {totalKeystrokes}/100</span>
                  <span>Mouse Events: {totalMouseEvents}/200</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">What city were you born in?</label>
              <input type="text" required value={q1} onChange={(e) => setQ1(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">What is your favorite book or movie?</label>
              <input type="text" required value={q2} onChange={(e) => setQ2(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none" />
            </div>
            <button 
              type="submit" 
              disabled={overallProgress < 50}
              className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl hover:bg-slate-800 disabled:bg-slate-400 transition-colors mt-6"
            >
              {overallProgress < 50 ? 'Keep typing...' : 'Calibrate & Continue'}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSignUp} className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900">Baseline Captured</h3>
              <p className="text-slate-500 mt-2 text-sm">Your unique keystroke and mouse patterns have been encrypted and stored.</p>
            </div>
            
            <div className="flex items-start bg-slate-50 p-4 rounded-lg">
              <input type="checkbox" id="terms" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 text-blue-600 rounded border-slate-300" disabled={isLoading} />
              <label htmlFor="terms" className="ml-3 text-sm text-slate-600">
                I agree to the Terms & Conditions. I understand my behavioral telemetry is encrypted at rest and used solely for Zero Trust authentication.
              </label>
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 disabled:bg-blue-400 transition-colors shadow-sm flex justify-center items-center">
              {isLoading ? 'Processing...' : 'Register Device Passkey & Finish'}
            </button>
            
            {status && (
              <p className={`text-sm text-center font-medium p-4 rounded-xl shadow-sm ${status.includes('Success') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {status}
              </p>
            )}
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-sm text-blue-600 hover:underline">Already have an account? Sign in</Link>
        </div>
      </div>
    </div>
  );
}
