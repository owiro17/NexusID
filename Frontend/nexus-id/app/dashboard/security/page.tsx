import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { ShieldCheck, Activity, Lock, Cpu } from 'lucide-react';

export default async function SecurityDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const riskScore = profile?.behavioral_risk_score ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-cyan-500 text-xs font-mono mb-2">
          <Lock className="w-4 h-4" />
          <span>NEXUS-ID ADAPTIVE ACCESS CONTROL</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Security & Passkeys</h1>
        <p className="text-sm text-slate-400 mt-1">
          Review cryptographic authentication telemetry and manage registered hardware credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Zero-Trust Risk</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {riskScore} <span className="text-xs text-slate-500 font-sans">/ 100</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {riskScore <= 50 ? 'Baseline Nominal Trust' : 'Step-Up Required'}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Auth Architecture</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-semibold text-white">FIDO2 / WebAuthn</div>
          <div className="mt-2 text-[11px] text-slate-400">Passkey-First + Magic Link Recovery</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Account Type</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-semibold text-white capitalize">
            {profile?.account_type || profile?.role || 'Standard'}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 truncate">{user.email}</div>
        </div>
      </div>

      <PasskeyManager />
    </div>
  );
}
