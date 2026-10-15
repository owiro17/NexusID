'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTelemetry } from '@/hooks/useTelemetry';
import { StepUpModal } from '@/components/auth/StepUpModal';
import type { FinancialLedger, SecurityAuditLog, UserProfile } from '@/types/auth';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Activity,
  KeyRound,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Lock,
  Cpu,
  Clock,
  History,
  PlusCircle,
  Building2,
  ChevronRight,
  TrendingDown,
  Layers,
  Sparkles,
} from 'lucide-react';

const INITIAL_CREDIT_BALANCE = 25000.0;

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  // Background Telemetry (buffered, non-blocking 5000ms window)
  const { currentRiskScore: liveRiskScore } = useTelemetry(5000, true);

  // Allow developer/tester to simulate anomaly or use live telemetry score
  const [simulatedRisk, setSimulatedRisk] = useState<number | null>(null);
  const activeRiskScore = simulatedRisk !== null ? simulatedRisk : liveRiskScore;

  // Supabase Data State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<FinancialLedger[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Transfer Form State
  const [targetAccount, setTargetAccount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMemo, setTransferMemo] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
    txId?: string;
  } | null>(null);

  // Step-Up Verification Modal State
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [pendingTransferPayload, setPendingTransferPayload] = useState<{
    targetAccount: string;
    amount: number;
    memo?: string;
  } | null>(null);

  // Load live data from Supabase
  const loadDashboardData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      // 1. Fetch User Profile
      let { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile && user.email) {
        // Self-heal profile if missing
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: user.id,
              email: user.email,
              account_type: 'Enterprise Tier',
              behavioral_risk_score: 0,
              hardware_enrolled: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .select()
          .maybeSingle();
        profile = newProfile;
      }
      if (profile) setUserProfile(profile as UserProfile);

      // 2. Fetch Financial Ledgers (real records from public.financial_ledgers)
      const { data: ledgerData, error: ledgerErr } = await supabase
        .from('financial_ledgers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!ledgerErr && Array.isArray(ledgerData)) {
        setTransactions(ledgerData as FinancialLedger[]);
      }

      // 3. Fetch Security Audit Logs (real records from public.security_audit_logs)
      const { data: logData, error: logErr } = await supabase
        .from('security_audit_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(6);

      if (!logErr && Array.isArray(logData)) {
        setAuditLogs(logData as unknown as SecurityAuditLog[]);
      }
    } catch (err) {
      console.error('Error loading dashboard data from Supabase:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Financial Calculations based on live ledger data
  const totalOutflow = transactions
    .filter((tx) => tx.status !== 'Failed')
    .reduce((sum, tx) => sum + Math.max(0, Number(tx.transaction_amount) || 0), 0);

  const totalInflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.transaction_amount) || 0), 0);

  const availableBalance = Math.max(0, INITIAL_CREDIT_BALANCE - totalOutflow + totalInflow);

  // Quick Seed Initial Transaction if ledger is empty
  const handleSeedInitialLedger = async () => {
    if (!currentUserId) return;
    setIsTransferring(true);
    setStatusMsg(null);

    try {
      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: 'Nexus Treasury Liquidity Grant (ACC-001)',
          transaction_amount: 500.0,
          status: 'completed',
        },
      ]);

      if (error) throw error;

      await loadDashboardData();
      setStatusMsg({
        type: 'success',
        text: 'Initial demonstration ledger record created in Supabase.',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Failed to seed ledger record.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Transfer Execution (Zero-Trust Logic)
  const initiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const amount = parseFloat(transferAmount);
    if (!targetAccount.trim()) {
      setStatusMsg({ type: 'error', text: 'Please specify a destination account or IBAN.' });
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid positive transfer amount.' });
      return;
    }
    if (amount > availableBalance) {
      setStatusMsg({
        type: 'error',
        text: `Insufficient funds. Available balance is $${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
      });
      return;
    }

    // Step-Up Trigger Condition:
    // 1. Behavioral Risk Score exceeds 70% threshold
    // 2. High-value transaction policy (amount >= $5,000)
    const requiresStepUp = activeRiskScore > 70 || amount >= 5000;

    if (requiresStepUp) {
      setPendingTransferPayload({
        targetAccount: targetAccount.trim(),
        amount,
        memo: transferMemo.trim(),
      });
      setIsStepUpOpen(true);
      setStatusMsg({
        type: 'warning',
        text:
          activeRiskScore > 70
            ? '⚠️ High Behavioral Risk Detected (>70%). Step-Up Biometric Verification is required.'
            : '🛡️ Elevated Transfer Policy ($5,000+). Hardware Passkey Step-Up required.',
      });
      return;
    }

    // Nominal Risk: Execute immediately
    await executeDatabaseTransfer(targetAccount.trim(), amount, transferMemo.trim());
  };

  const executeDatabaseTransfer = async (
    target: string,
    amount: number,
    memo?: string
  ) => {
    if (!currentUserId) {
      setStatusMsg({ type: 'error', text: 'Session expired. Please log in again.' });
      return;
    }

    setIsTransferring(true);

    try {
      // Direct PostgreSQL insert into public.financial_ledgers
      const { data, error } = await supabase
        .from('financial_ledgers')
        .insert([
          {
            user_id: currentUserId,
            target_account: memo ? `${target} (${memo})` : target,
            transaction_amount: amount,
            status: 'completed',
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(
          error.message.includes('row-level security') || error.message.includes('policy')
            ? `PostgreSQL RLS Enforcement Blocked Transaction: ${error.message}`
            : error.message
        );
      }

      // Re-fetch live data to update balance and transactions table
      await loadDashboardData();

      // Clear input fields
      setTargetAccount('');
      setTransferAmount('');
      setTransferMemo('');

      setStatusMsg({
        type: 'success',
        text: `Transfer authorized: $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} routed to ${target}.`,
        txId: data?.transaction_id,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Transaction could not be completed.',
      });
    } finally {
      setIsTransferring(false);
      setPendingTransferPayload(null);
    }
  };

  // Step-Up Modal verified callback
  const handleStepUpVerified = async (method: 'passkey' | 'otp') => {
    setIsStepUpOpen(false);
    setSimulatedRisk(0); // Reset risk score on cryptographic biometric success

    if (pendingTransferPayload) {
      setStatusMsg({
        type: 'info',
        text: `Biometric identity confirmed via ${method === 'passkey' ? 'FIDO2 Passkey' : 'One-Time Passcode'}. Executing transfer...`,
      });
      await executeDatabaseTransfer(
        pendingTransferPayload.targetAccount,
        pendingTransferPayload.amount,
        pendingTransferPayload.memo
      );
    }
  };

  const isRiskHigh = activeRiskScore > 70;
  const isRiskMedium = activeRiskScore > 35 && activeRiskScore <= 70;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner / System Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono mb-1">
            <Cpu className="w-3.5 h-3.5" />
            <span>CONTINUOUS ZERO-TRUST CORE • LIVE TELEMETRY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
            Banking & Liquidity Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time biometric trust scoring, hardware-bound access control, and live PostgreSQL ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboardData}
            disabled={isLoadingData}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync Supabase</span>
          </button>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Available Liquidity Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-6 shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono uppercase tracking-wider">Settled Liquidity</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-white tracking-tight">
            ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-3">
            <span className="flex items-center gap-1 text-slate-400">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              Nexus Treasury Vault
            </span>
            <span className="text-emerald-400 font-mono font-medium">FDIC Insured</span>
          </div>
        </div>

        {/* Total Outflow Volume */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono uppercase tracking-wider">Transferred Out</span>
            <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold font-mono text-white tracking-tight">
            ${totalOutflow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/60 pt-3">
            <span>{transactions.length} Ledger Records</span>
            <span className="text-cyan-400 font-mono">100% On-Chain DB</span>
          </div>
        </div>

        {/* Continuous Behavioral Trust Health */}
        <div
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border p-6 shadow-xl transition-colors ${
            isRiskHigh
              ? 'border-red-500/40 ring-1 ring-red-500/20'
              : isRiskMedium
              ? 'border-amber-500/40 ring-1 ring-amber-500/20'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono uppercase tracking-wider">Continuous Risk Score</span>
            <span
              className={`p-1.5 rounded-lg border ${
                isRiskHigh
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : isRiskMedium
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              <Activity className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <div
              className={`text-3xl font-extrabold font-mono tracking-tight ${
                isRiskHigh ? 'text-red-400' : isRiskMedium ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {activeRiskScore}%
            </div>
            <span className="text-xs text-slate-400">
              {isRiskHigh ? 'Critical Imposter Risk' : isRiskMedium ? 'Elevated Anomaly' : 'Baseline Verified'}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-slate-800/60 pt-3">
            <span className="text-slate-400">Hardware Resident Key</span>
            <span
              className={`font-mono text-xs flex items-center gap-1 ${
                userProfile?.hardware_enrolled ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <Fingerprint className="w-3.5 h-3.5" />
              {userProfile?.hardware_enrolled ? 'Bound' : 'Not Enrolled'}
            </span>
          </div>
        </div>
      </div>

      {/* Behavioral Telemetry & Testing Console */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Continuous Behavioral Telemetry</h2>
              <p className="text-xs text-slate-400">
                Background keystroke intervals and mouse smoothness analyzed in real-time.
              </p>
            </div>
          </div>

          {/* Anomaly simulation triggers for interactive verification */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono hidden md:inline">Test Zero Trust:</span>
            <button
              type="button"
              onClick={() => setSimulatedRisk(88)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950/60 border border-red-800/80 text-red-300 hover:bg-red-900/60 transition-colors cursor-pointer"
            >
              Simulate Bot Anomaly (88%)
            </button>
            {simulatedRisk !== null && (
              <button
                type="button"
                onClick={() => setSimulatedRisk(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Reset to Live Telemetry
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar of Current Risk */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Anomaly Index</span>
            <span
              className={
                isRiskHigh ? 'text-red-400 font-bold' : isRiskMedium ? 'text-amber-400' : 'text-emerald-400'
              }
            >
              {activeRiskScore}/100 {isRiskHigh ? '(Step-Up Threshold Exceeded >70)' : '(Permitted)'}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isRiskHigh ? 'bg-red-500' : isRiskMedium ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, activeRiskScore))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Interactive Grid: Transfer Wire + Ledger Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Authorized Transfer Form (5 cols) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-7 shadow-xl h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Send className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">Execute Secure Transfer</h2>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  RLS-Gated
                </span>
              </div>

              <form onSubmit={initiateTransfer} className="space-y-4">
                {/* Destination Account */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Destination IBAN / Routing Number
                  </label>
                  <input
                    type="text"
                    value={targetAccount}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    placeholder="e.g. US-ACH-8910-234"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500"
                    required
                  />
                  {/* Preset Account Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Payroll Vault (ACC-902)', 'Offshore Custody (CH-84)', 'Stripe Settlement'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTargetAccount(preset)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-slate-950/70 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">Transfer Amount ($ USD)</label>
                    <span className="text-[11px] text-slate-500 font-mono">Max: ${availableBalance.toLocaleString()}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500"
                      required
                    />
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {[100, 500, 1000, 5000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTransferAmount(amt.toString())}
                        className={`text-xs py-1 rounded-md border font-mono transition-colors cursor-pointer ${
                          amt >= 5000
                            ? 'bg-amber-950/30 border-amber-800/50 text-amber-400 hover:bg-amber-900/30'
                            : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                        title={amt >= 5000 ? 'Amounts >= $5,000 trigger Passkey Step-Up' : undefined}
                      >
                        ${amt >= 1000 ? `${amt / 1000}k` : amt}
                        {amt >= 5000 && ' 🔒'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Memo */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Memo / Transaction Purpose (Optional)
                  </label>
                  <input
                    type="text"
                    value={transferMemo}
                    onChange={(e) => setTransferMemo(e.target.value)}
                    placeholder="e.g. Q4 Infrastructure Funding"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isTransferring}
                  className={`w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${
                    isRiskHigh
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/20 font-bold'
                  }`}
                >
                  {isTransferring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Database Policy...</span>
                    </>
                  ) : isRiskHigh ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Authenticate with Passkey to Transfer</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Authorize Transfer</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Status / Feedback Banner */}
            {statusMsg && (
              <div
                className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : statusMsg.type === 'error'
                    ? 'bg-red-950/40 border-red-800 text-red-300'
                    : statusMsg.type === 'warning'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                    : 'bg-cyan-950/40 border-cyan-800 text-cyan-300'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{statusMsg.text}</p>
                  {statusMsg.txId && (
                    <p className="mt-1 font-mono text-[11px] opacity-80">TX: {statusMsg.txId}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Ledger Table from Supabase (7 cols) */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-7 shadow-xl h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Live PostgreSQL Ledger</h2>
                    <p className="text-xs text-slate-400">
                      Queried directly from <code className="text-cyan-400 font-mono">public.financial_ledgers</code>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-500">
                  {transactions.length} record{transactions.length === 1 ? '' : 's'}
                </span>
              </div>

              {isLoadingData ? (
                <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Loading ledger records from Supabase...</span>
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 my-4">
                  <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-slate-300">No Transactions Yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Your authenticated account is ready. Perform your first transfer on the left, or seed a demonstration record.
                  </p>
                  <button
                    onClick={handleSeedInitialLedger}
                    disabled={isTransferring}
                    className="mt-4 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Seed Demo Ledger Record</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-3">Target Account / Memo</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {transactions.map((tx) => (
                        <tr key={tx.transaction_id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3 font-medium text-white max-w-[200px] truncate">
                            {tx.target_account}
                          </td>
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                                tx.status?.toLowerCase() === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {tx.status || 'Settled'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-100 whitespace-nowrap">
                            -${Number(tx.transaction_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono">RLS Policy: auth.uid() = user_id</span>
              <span className="text-emerald-400 font-mono">Zero Trust Enforced</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Audit Feed from Supabase */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Cryptographic Security Audit Log</h2>
              <p className="text-xs text-slate-400">
                Fetched live from <code className="text-cyan-400 font-mono">public.security_audit_logs</code>
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/security')}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Manage Passkeys</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            No audit log entries recorded yet. Authentication events and passkey ceremonies will appear here.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {auditLogs.map((log) => (
              <div
                key={log.id || (log as any).log_id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      log.event_type.includes('SUCCESS') || log.event_type.includes('REGISTERED') || log.event_type.includes('VERIFIED')
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-mono font-semibold text-slate-200">{log.event_type}</span>
                  {log.recorded_risk_score !== undefined && (
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      Risk: {log.recorded_risk_score}%
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
                  {log.ip_address && <span>IP: {log.ip_address}</span>}
                  <span>
                    {new Date((log as any).timestamp || log.created_at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step-Up Passkey / Biometric Modal */}
      <StepUpModal
        isOpen={isStepUpOpen}
        currentRiskScore={activeRiskScore}
        actionDescription={
          pendingTransferPayload
            ? `Authorize Transfer of $${pendingTransferPayload.amount.toLocaleString()} to ${pendingTransferPayload.targetAccount}`
            : 'Elevated Risk Authorization'
        }
        onVerified={() => handleStepUpVerified('passkey')}
        onVerify={(method) => handleStepUpVerified(method)}
        onCancel={() => {
          setIsStepUpOpen(false);
          setStatusMsg({
            type: 'error',
            text: 'Transfer aborted: Step-Up biometric verification was cancelled.',
          });
        }}
      />
    </div>
  );
}
