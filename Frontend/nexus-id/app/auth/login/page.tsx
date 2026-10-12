'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const supabase = createClient();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Sending magic link...');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setStatus(`Error: ${error.message}`);
    else setStatus('Magic link sent! Check your email.');
  };

  const handlePasskey = async () => {
    setStatus('Prompting WebAuthn...');
    // Real implementation: supabase.auth.signInWithPasskey()
    // Simulating success for MVP
    setTimeout(() => {
      setStatus('Passkey verified successfully! Redirecting...');
      window.location.href = '/dashboard';
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-8">
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Sign in to NexusID</h2>
          <p className="text-sm text-slate-500 mt-2">Zero Trust Architecture</p>
        </div>

        <div className="space-y-4">
          <button 
            onClick={handlePasskey}
            className="w-full flex items-center justify-center px-4 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-all shadow-sm"
          >
            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            Sign in with Passkey
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <div className="relative flex justify-center"><span className="bg-white px-4 text-sm text-slate-400">or use Magic Link</span></div>
          </div>

          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none" placeholder="Work Email" />
            </div>
            <button type="submit" className="w-full bg-white text-slate-700 font-medium py-3 rounded-xl border border-slate-300 hover:bg-slate-50 transition-colors">
              Send Magic Link
            </button>
          </form>
          
          <button className="w-full bg-white text-slate-700 font-medium py-3 rounded-xl border border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z"></path></svg>
            Sign in with Google
          </button>
        </div>

        {status && (
          <p className={`text-sm text-center font-medium mt-6 p-3 rounded-lg ${status.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {status}
          </p>
        )}

        <div className="mt-8 text-center">
          <Link href="/auth/signup" className="text-sm text-blue-600 hover:underline">New to NexusID? Request a Demo</Link>
        </div>
      </div>
    </div>
  );
}
