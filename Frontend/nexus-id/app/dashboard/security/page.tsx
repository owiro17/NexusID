import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { ShieldCheck, KeyRound, UserCheck } from 'lucide-react';

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
  const trustScore = Math.max(0, Math.min(100, Math.round(100 - riskScore)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl nexus-card-neumorphic">
          <div className="flex items-center justify-between text-xs text-slate-700 font-semibold mb-2">
            <span>Trust score</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-950 tabular-nums">
            {trustScore} <span className="text-xs font-semibold text-slate-600">/ 100</span>
          </div>
          <div className="mt-3 text-xs text-teal-800 flex items-center gap-2 font-bold">
            <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />
            {trustScore >= 50 ? 'Protected' : 'Step-up verification active'}
          </div>
        </div>

        <div className="p-5 rounded-2xl nexus-card-neumorphic">
          <div className="flex items-center justify-between text-xs text-slate-700 font-semibold mb-2">
            <span>Sign-in protection</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-slate-950">Biometric Passkeys</div>
          <div className="mt-2 text-xs text-slate-800 font-medium leading-relaxed">
            Face ID, Touch ID, Windows Hello & email backup
          </div>
        </div>

        <div className="p-5 rounded-2xl nexus-card-neumorphic">
          <div className="flex items-center justify-between text-xs text-slate-700 font-semibold mb-2">
            <span>Signed-in account</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-slate-950 capitalize">
            {profile?.account_type || 'Business Account'}
          </div>
          <div className="mt-2 text-xs text-slate-800 font-medium truncate">{user.email}</div>
        </div>
      </div>

      <PasskeyManager />
    </div>
  );
}
