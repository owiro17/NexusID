'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTelemetry } from '@/hooks/useTelemetry';
import { StepUpModal } from '@/components/auth/StepUpModal';
import type { FinancialLedger, UserProfile } from '@/types/auth';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  Send,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Sparkles,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

const INITIAL_CREDIT_BALANCE = 250000.0;
const HIGH_VALUE_STEP_UP_KES = 100000.0;

function formatKes(amount: number): string {
  return `KSh ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function cleanAccountLabel(raw: string): string {
  if (!raw) return 'Account Transfer';
  return raw
    .replace(/🏆\s*/g, '')
    .replace(/\+\$/g, '+KSh ')
    .replace(/\$/g, 'KSh ');
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const recipientInputRef = useRef<HTMLInputElement | null>(null);

  const {
    currentRiskScore: liveRiskScore,
    operatorVerification,
    rewardContinualModel,
  } = useTelemetry(5000, true);

  const [simulatedRisk, setSimulatedRisk] = useState<number | null>(null);
  const activeRiskScore = simulatedRisk !== null ? simulatedRisk : liveRiskScore;
  const trustScore = Math.max(0, Math.min(100, Math.round(100 - activeRiskScore)));

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<FinancialLedger[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Transfer Form State
  const [targetAccount, setTargetAccount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMemo, setTransferMemo] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    text: string;
  } | null>(null);

  // Step-Up Verification Modal State
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [pendingTransferPayload, setPendingTransferPayload] = useState<{
    targetAccount: string;
    amount: number;
    memo?: string;
  } | null>(null);

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
      setUserEmail(user.email || '');

      let { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile && user.email) {
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: user.id,
              email: user.email,
              account_type: 'Business Account',
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

      const { data: ledgerData, error: ledgerErr } = await supabase
        .from('financial_ledgers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!ledgerErr && Array.isArray(ledgerData)) {
        setTransactions(ledgerData as FinancialLedger[]);
      }
    } catch (err) {
      console.error('Error loading account data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Financial Calculations based on live records
  const totalOutflow = transactions
    .filter((tx) => tx.status !== 'Failed')
    .reduce((sum, tx) => sum + Math.max(0, Number(tx.transaction_amount) || 0), 0);

  const totalInflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.transaction_amount) || 0), 0);

  const availableBalance = Math.max(0, INITIAL_CREDIT_BALANCE - totalOutflow + totalInflow);

  const executeDatabaseTransfer = async (
    target: string,
    amount: number,
    memo?: string
  ) => {
    if (!currentUserId) {
      setStatusMsg({ type: 'error', text: 'Your session has expired. Please sign in again.' });
      return;
    }

    setIsTransferring(true);

    try {
      const { error } = await supabase
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
        throw new Error('Transfer could not be completed right now. Please try again.');
      }

      await loadDashboardData();

      setTargetAccount('');
      setTransferAmount('');
      setTransferMemo('');

      setStatusMsg({
        type: 'success',
        text: `${formatKes(amount)} sent to ${target}.`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Transfer could not be completed.',
      });
    } finally {
      setIsTransferring(false);
      setPendingTransferPayload(null);
    }
  };

  const initiateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const amount = parseFloat(transferAmount);
    if (!targetAccount.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter a recipient account number.' });
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }
    if (amount > availableBalance) {
      setStatusMsg({
        type: 'error',
        text: `Insufficient balance. You have ${formatKes(availableBalance)} available.`,
      });
      return;
    }

    // Step-up only when behavioral risk > 70% (Trust Score < 30) or amount >= KSh 100,000
    const requiresStepUp = activeRiskScore > 70 || amount >= HIGH_VALUE_STEP_UP_KES;

    if (requiresStepUp) {
      setPendingTransferPayload({
        targetAccount: targetAccount.trim(),
        amount,
        memo: transferMemo.trim(),
      });
      setIsStepUpOpen(true);
      setStatusMsg({
        type: 'warning',
        text: 'Please confirm it is you with your passkey to complete this transfer.',
      });
      return;
    }

    await executeDatabaseTransfer(targetAccount.trim(), amount, transferMemo.trim());
  };

  const handleTopUpFloat = async () => {
    if (!currentUserId) return;
    setIsTransferring(true);
    setStatusMsg(null);
    try {
      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: 'Float Top-Up (SME Working Capital Grant)',
          transaction_amount: -50000.0,
          status: 'completed',
        },
      ]);
      if (error) throw error;
      await loadDashboardData();
      setStatusMsg({
        type: 'success',
        text: 'Account credited with KSh 50,000.00 working float.',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Could not top up float at this moment.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleStepUpVerified = async () => {
    setIsStepUpOpen(false);
    setSimulatedRisk(0);
    await rewardContinualModel(60);

    if (pendingTransferPayload) {
      await executeDatabaseTransfer(
        pendingTransferPayload.targetAccount,
        pendingTransferPayload.amount,
        pendingTransferPayload.memo
      );
    } else {
      setStatusMsg({
        type: 'success',
        text: 'Identity confirmed with passkey. Behavioral risk score cleared and trust restored.',
      });
      await loadDashboardData();
    }
  };

  const isConfirmNeeded = activeRiskScore >= 70;
  const isLearningStyle =
    !isConfirmNeeded && operatorVerification?.status !== 'enrolled';
  const learningProgressPct =
    operatorVerification?.enrollmentProgress.percentComplete ?? 40;

  const firstName = userEmail
    ? userEmail.split('@')[0].replace(/[._-]/g, ' ')
    : 'there';

  const visibleTransactions = showAllActivity
    ? transactions
    : transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 1. Greeting + Large Balance Card with Primary Send Money CTA */}
      <section className="nexus-card-neumorphic p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-sm text-slate-700 font-medium capitalize">
              Welcome back, <span className="font-bold text-slate-950">{firstName}</span>
            </p>
            <div className="mt-2.5 flex items-baseline gap-3">
              <span className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-950 tabular-nums">
                {formatKes(availableBalance)}
              </span>
              <span className="text-xs font-bold text-teal-950 bg-teal-100 border border-teal-300 px-3 py-1 rounded-full shadow-2xs">
                Available balance
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-6 text-xs text-slate-700 font-medium tabular-nums">
              <span className="flex items-center gap-1.5">
                <ArrowDownLeft className="w-4 h-4 text-teal-700" />
                <span>Rewards earned:</span>
                <strong className="text-slate-950 font-bold">{formatKes(totalInflow)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 text-blue-700" />
                <span>Total sent:</span>
                <strong className="text-slate-950 font-bold">{formatKes(totalOutflow)}</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isConfirmNeeded ? (
              <button
                type="button"
                onClick={() => {
                  setPendingTransferPayload(null);
                  setIsStepUpOpen(true);
                }}
                className="nexus-btn-neumorphic px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Fingerprint className="w-4 h-4 text-slate-950" />
                <span>Verify with passkey</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => recipientInputRef.current?.focus()}
                className="nexus-btn-neumorphic px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Send money</span>
              </button>
            )}

            {availableBalance < 5000 && (
              <button
                type="button"
                onClick={handleTopUpFloat}
                disabled={isTransferring}
                className="nexus-btn-neumorphic px-4 py-3 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-950 text-sm font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-teal-700 ${isTransferring ? 'animate-spin' : ''}`} />
                <span>Top up float</span>
              </button>
            )}

            <Link
              href="/dashboard/challenges"
              className="nexus-btn-neumorphic px-4 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-sm font-bold transition-all duration-150 flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span>Earn Ksh rewards</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Calm Security Status Chip + 0-100 Trust Score */}
      <section
        className={`nexus-card-neumorphic p-5 transition-all duration-200 ${
          isConfirmNeeded
            ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
            : isLearningStyle
            ? 'bg-blue-50/70 border-blue-300'
            : 'bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                isConfirmNeeded
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : isLearningStyle
                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                  : 'bg-teal-100 text-teal-900 border border-teal-300'
              }`}
            >
              {isConfirmNeeded ? (
                <ShieldAlert className="w-5 h-5" />
              ) : isLearningStyle ? (
                <Fingerprint className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold ${
                    isConfirmNeeded
                      ? 'bg-amber-100 text-amber-950 border border-amber-400'
                      : isLearningStyle
                      ? 'bg-blue-100 text-blue-950 border border-blue-400'
                      : 'bg-teal-100 text-teal-950 border border-teal-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConfirmNeeded
                        ? 'bg-amber-600'
                        : isLearningStyle
                        ? 'bg-blue-600'
                        : 'bg-teal-600'
                    }`}
                  />
                  {isConfirmNeeded
                    ? "Confirm it's you"
                    : isLearningStyle
                    ? 'Learning your style'
                    : 'Protected'}
                </span>

                <span className="text-xs font-semibold text-slate-800 tabular-nums">
                  Trust score:{' '}
                  <strong
                    className={`font-extrabold ${
                      isConfirmNeeded
                        ? 'text-amber-950'
                        : isLearningStyle
                        ? 'text-blue-900'
                        : 'text-teal-900'
                    }`}
                  >
                    {trustScore} / 100
                  </strong>
                </span>
              </div>

              <p className="text-xs font-medium text-slate-700 leading-relaxed">
                {isConfirmNeeded
                  ? 'Activity on this session looks unfamiliar. Verify once with your passkey to continue smoothly.'
                  : isLearningStyle
                  ? 'Silently learning how you type and navigate so we can protect your account without interrupting you.'
                  : 'Your typing rhythm and device match your personal profile.'}
              </p>

              {isLearningStyle && (
                <div className="pt-1 max-w-xs">
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(12, learningProgressPct)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
            {isConfirmNeeded ? (
              <button
                type="button"
                onClick={() => setIsStepUpOpen(true)}
                className="nexus-btn-neumorphic px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Fingerprint className="w-4 h-4" />
                <span>Verify with passkey</span>
              </button>
            ) : (
              <Link
                href="/dashboard/insights"
                className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 transition-colors duration-150 cursor-pointer"
              >
                <span>View trust insights</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Status Alert Banner */}
      {statusMsg && (
        <div
          className={`nexus-card-neumorphic p-4 text-xs font-semibold flex items-center gap-3 ${
            statusMsg.type === 'success'
              ? 'bg-teal-50/90 border-teal-300 text-teal-950'
              : statusMsg.type === 'warning'
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : 'bg-red-50/90 border-red-300 text-red-950'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 3 & 4: Two-Column Main Area — Quick Transfer Form + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3. Quick Transfer Form (5 cols) */}
        <section className="lg:col-span-5">
          <div className="nexus-card-neumorphic p-6 sm:p-7 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-950">Quick transfer</h2>
                  <p className="text-xs text-slate-700 font-medium">Send money instantly to any account</p>
                </div>
              </div>

              <form onSubmit={initiateTransfer} className="space-y-4">
                <div>
                  <label
                    htmlFor="recipient-account"
                    className="block text-xs font-bold text-slate-800 mb-1.5"
                  >
                    Recipient account
                  </label>
                  <input
                    id="recipient-account"
                    ref={recipientInputRef}
                    type="text"
                    value={targetAccount}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    placeholder="e.g. ACC-KE-01948201"
                    required
                    className="nexus-input-neumorphic w-full px-3.5 py-2.5 rounded-xl text-sm"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'ACC-KE-01948201 (Alice W.)',
                      'ACC-KE-08831044 (Brian O.)',
                      'SME-FLOAT-7740 (Wakala Float)',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTargetAccount(preset)}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 transition-colors duration-150 cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <label htmlFor="transfer-amount" className="font-bold text-slate-800">
                      Amount (KSh)
                    </label>
                    <span className="text-slate-600 font-semibold tabular-nums">
                      Max: {formatKes(availableBalance)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="text-xs font-bold text-slate-700 absolute left-3.5 top-1/2 -translate-y-1/2">
                      KSh
                    </span>
                    <input
                      id="transfer-amount"
                      type="number"
                      min="1"
                      step="any"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="500.00"
                      required
                      className="nexus-input-neumorphic w-full pl-12 pr-3.5 py-2.5 rounded-xl text-sm tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {[250, 500, 1000, 2500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTransferAmount(String(amt))}
                        className="py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-xs font-bold text-slate-800 hover:text-blue-800 tabular-nums transition-colors duration-150 cursor-pointer shadow-2xs"
                      >
                        KSh {amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="transfer-memo"
                    className="block text-xs font-bold text-slate-800 mb-1.5"
                  >
                    Note (optional)
                  </label>
                  <input
                    id="transfer-memo"
                    type="text"
                    value={transferMemo}
                    onChange={(e) => setTransferMemo(e.target.value)}
                    placeholder="e.g. Supplier invoice #402"
                    className="nexus-input-neumorphic w-full px-3.5 py-2.5 rounded-xl text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isTransferring}
                  className={`nexus-btn-neumorphic w-full py-3 px-4 rounded-xl font-bold text-sm transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${
                    isConfirmNeeded
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isTransferring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isConfirmNeeded ? 'Verifying...' : 'Sending...'}</span>
                    </>
                  ) : isConfirmNeeded ? (
                    <>
                      <Fingerprint className="w-4 h-4 text-slate-950" />
                      <span>Verify with passkey to send</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send money</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* 4. Recent Activity List (7 cols) */}
        <section className="lg:col-span-7">
          <div className="nexus-card-neumorphic p-6 sm:p-7 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Recent activity</h2>
                  <p className="text-xs text-slate-700 font-medium">
                    Your latest transfers and daily reward credits
                  </p>
                </div>

                {transactions.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllActivity((prev) => !prev)}
                    className="text-xs font-bold text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    {showAllActivity ? 'Show latest 5' : `View all (${transactions.length})`}
                  </button>
                )}
              </div>

              {isLoadingData ? (
                <div className="py-12 text-center text-sm font-medium text-slate-600">
                  Loading your recent activity...
                </div>
              ) : transactions.length === 0 ? (
                <div className="nexus-well-inset py-12 text-center p-6">
                  <p className="text-sm font-bold text-slate-900">No transactions yet</p>
                  <p className="text-xs font-medium text-slate-700 mt-1 max-w-sm mx-auto">
                    Send a transfer on the left or complete a daily reward challenge to see your activity here.
                  </p>
                </div>
              ) : (
                <div className="nexus-minimal-scroller max-h-[380px] overflow-y-auto divide-y divide-slate-200 pr-1">
                  {visibleTransactions.map((tx) => {
                    const rawAmount = Number(tx.transaction_amount) || 0;
                    const isCredit = rawAmount < 0;
                    const absAmount = Math.abs(rawAmount);

                    return (
                      <div
                        key={tx.transaction_id}
                        className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/90 px-2.5 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isCredit
                                ? 'bg-teal-100 text-teal-800 border border-teal-300'
                                : 'bg-slate-100 text-slate-800 border border-slate-300'
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-950 truncate">
                              {cleanAccountLabel(tx.target_account)}
                            </p>
                            <p className="text-xs font-medium text-slate-600">
                              {new Date(tx.created_at).toLocaleDateString('en-KE', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-bold tabular-nums ${
                              isCredit ? 'text-teal-800 font-extrabold' : 'text-slate-950'
                            }`}
                          >
                            {isCredit ? `+${formatKes(absAmount)}` : `-${formatKes(absAmount)}`}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-600 capitalize">
                            {tx.status?.toLowerCase() === 'completed' ? 'Completed' : tx.status || 'Completed'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {userProfile && !userProfile.hardware_enrolled && (
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">
                  Add a device passkey for faster one-tap verification
                </span>
                <Link
                  href="/dashboard/security"
                  className="font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>Set up passkey</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Step-Up Passkey Modal */}
      <StepUpModal
        isOpen={isStepUpOpen}
        currentRiskScore={activeRiskScore}
        actionDescription={
          pendingTransferPayload
            ? `Send ${formatKes(pendingTransferPayload.amount)} to ${pendingTransferPayload.targetAccount}`
            : 'Restore trusted operator status & approve transfers'
        }
        onVerified={handleStepUpVerified}
        onVerify={() => handleStepUpVerified()}
        onCancel={() => {
          setIsStepUpOpen(false);
          setStatusMsg({
            type: 'warning',
            text: 'Verification was cancelled.',
          });
        }}
      />
    </div>
  );
}
