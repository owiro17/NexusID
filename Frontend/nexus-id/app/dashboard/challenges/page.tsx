'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTelemetry } from '@/hooks/useTelemetry';
import type { FinancialLedger } from '@/types/auth';
import {
  Trophy,
  Sparkles,
  Keyboard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Award,
} from 'lucide-react';

interface ChallengeDefinition {
  id: string;
  tier: 'Bronze' | 'Silver' | 'Gold';
  title: string;
  subtitle: string;
  promptText: string;
  pointsRequired: number;
  rewardKes: number;
}

const DAILY_CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'challenge_bronze_kyc',
    tier: 'Bronze',
    title: 'Quick phrase',
    subtitle: 'Type a short everyday payment confirmation sentence.',
    promptText: 'authorize agency settlement vault 904 for immediate clearing',
    pointsRequired: 100,
    rewardKes: 50,
  },
  {
    id: 'challenge_silver_wire',
    tier: 'Silver',
    title: 'Account number practice',
    subtitle: 'Practice typing an account reference with letters and numbers.',
    promptText: 'verify swift routing KE88NXID0045219000 and release escrow tranche',
    pointsRequired: 220,
    rewardKes: 150,
  },
  {
    id: 'challenge_gold_zero_trust',
    tier: 'Gold',
    title: 'Long phrase',
    subtitle: 'Complete a full security sentence to unlock the top daily reward.',
    promptText: 'continuous behavioral biometrics protect agency banking against session hijacking',
    pointsRequired: 400,
    rewardKes: 500,
  },
];

const INITIAL_CREDIT_BALANCE = 10000.0;

function formatKes(amount: number): string {
  return `KSh ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DailyChallengesPage() {
  const router = useRouter();
  const supabase = createClient();

  const {
    currentRiskScore: liveRiskScore,
    operatorVerification,
    activeSessionId,
    rewardContinualModel,
  } = useTelemetry(5000, true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<FinancialLedger[]>([]);

  const [activeChallengeId, setActiveChallengeId] = useState<string>(DAILY_CHALLENGES[0].id);
  const [typedInput, setTypedInput] = useState<string>('');
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [localPoints, setLocalPoints] = useState<number>(120);
  const [isClaimingReward, setIsClaimingReward] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const activeChallenge =
    DAILY_CHALLENGES.find((c) => c.id === activeChallengeId) || DAILY_CHALLENGES[0];

  const loadLedger = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUserId(user.id);

      const { data: ledgerData } = await supabase
        .from('financial_ledgers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (Array.isArray(ledgerData)) {
        setTransactions(ledgerData as FinancialLedger[]);
        const claimedIds: string[] = [];
        for (const ch of DAILY_CHALLENGES) {
          if (
            ledgerData.some(
              (tx) =>
                tx.target_account?.includes(ch.title) ||
                tx.target_account?.includes(`Tier ${ch.tier}`) ||
                tx.target_account?.includes(`+KSh ${ch.rewardKes}`) ||
                tx.target_account?.includes(`+$${ch.rewardKes}`)
            )
          ) {
            claimedIds.push(ch.id);
          }
        }
        setCompletedChallenges(claimedIds);
      }
    } catch {
      // ignore
    }
  }, [supabase, router]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const serverPoints = operatorVerification?.continualLearning?.telemetryPoints ?? 0;
  const effectivePoints = Math.max(localPoints, serverPoints);
  const maxGoalPoints = 500;
  const progressBarPct = Math.min(100, Math.round((effectivePoints / maxGoalPoints) * 100));

  const totalOutflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.transaction_amount), 0);

  const totalRewardsInflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.transaction_amount)), 0);

  const availableBalance = Math.max(0, INITIAL_CREDIT_BALANCE - totalOutflow + totalRewardsInflow);

  // Character-by-character matching
  const targetClean = activeChallenge.promptText.trim().toLowerCase();
  const typedClean = typedInput.trim().toLowerCase();

  let matchedChars = 0;
  for (let i = 0; i < Math.min(targetClean.length, typedClean.length); i++) {
    if (typedClean[i] === targetClean[i]) {
      matchedChars += 1;
    } else {
      break;
    }
  }
  const typingMatchPct = Math.min(
    100,
    Math.round((matchedChars / Math.max(1, targetClean.length)) * 100)
  );
  const isPromptMatched = typingMatchPct >= 95 || typedClean === targetClean;

  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedInput(e.target.value);
    setLocalPoints((prev) => prev + 3);
  };

  const handleCompleteChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPromptMatched || !currentUserId) return;

    setIsClaimingReward(true);
    setStatusBanner(null);

    try {
      await rewardContinualModel(activeChallenge.pointsRequired);
      setLocalPoints((prev) => prev + activeChallenge.pointsRequired);

      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: `Daily Reward: ${activeChallenge.title} (+KSh ${activeChallenge.rewardKes})`,
          transaction_amount: -activeChallenge.rewardKes,
          status: 'completed',
        },
      ]);

      if (error) throw error;

      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          eventType: 'STEP_UP_VERIFIED',
          recordedRiskScore: liveRiskScore,
          metadata: {
            challenge_id: activeChallenge.id,
            reward_kes: activeChallenge.rewardKes,
          },
        }),
      });

      setCompletedChallenges((prev) =>
        prev.includes(activeChallenge.id) ? prev : [...prev, activeChallenge.id]
      );
      setTypedInput('');
      await loadLedger();

      setStatusBanner({
        type: 'success',
        text: `Well done! ${formatKes(activeChallenge.rewardKes)} has been added to your balance.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Could not claim reward right now. Please try again.',
      });
    } finally {
      setIsClaimingReward(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Progress & Balance Summary Card */}
      <section className="nexus-card-neumorphic p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0 shadow-2xs">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Earn daily KSh rewards while we learn your style
              </h2>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Each short typing exercise helps NexusID recognize you more smoothly and credits real rewards to your account.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="nexus-btn-neumorphic px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-900 text-xs font-bold flex items-center gap-1.5 self-start sm:self-center shrink-0 transition-colors cursor-pointer"
          >
            <span>Send money</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Summary Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="nexus-well-inset p-4">
            <span className="text-xs text-slate-700 font-bold block">Available balance</span>
            <span className="text-xl font-extrabold text-slate-950 tabular-nums mt-1 block">
              {formatKes(availableBalance)}
            </span>
          </div>

          <div className="nexus-well-inset p-4 bg-teal-50/80 border-teal-200">
            <span className="text-xs text-teal-950 font-bold block">Total rewards earned</span>
            <span className="text-xl font-extrabold text-teal-800 tabular-nums mt-1 block">
              +{formatKes(totalRewardsInflow)}
            </span>
          </div>

          <div className="nexus-well-inset p-4 bg-amber-50/80 border-amber-200">
            <span className="text-xs text-amber-950 font-bold block">Completed today</span>
            <span className="text-xl font-extrabold text-amber-800 tabular-nums mt-1 block">
              {completedChallenges.length} of {DAILY_CHALLENGES.length} rewards
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">
              Daily reward progress
            </span>
            <span className="font-extrabold text-blue-700 tabular-nums">
              {progressBarPct}% complete
            </span>
          </div>
          <div className="nexus-well-inset w-full h-3.5 p-0.5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-teal-600 to-amber-500 transition-all duration-300"
              style={{ width: `${Math.max(6, progressBarPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-700 font-semibold tabular-nums">
            <span>Start</span>
            <span className={effectivePoints >= 100 ? 'text-teal-900 font-bold' : ''}>
              Bronze • KSh 50
            </span>
            <span className={effectivePoints >= 220 ? 'text-blue-900 font-bold' : ''}>
              Silver • KSh 150
            </span>
            <span className={effectivePoints >= 400 ? 'text-amber-900 font-bold' : ''}>
              Gold • KSh 500
            </span>
          </div>
        </div>
      </section>

      {statusBanner && (
        <div
          className={`nexus-card-neumorphic p-4 text-xs font-semibold flex items-center gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-teal-50 border-teal-300 text-teal-950'
              : 'bg-red-50 border-red-300 text-red-950'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
          )}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* 3 Simple Reward Tier Cards + Clean Typing Box */}
      <section className="nexus-card-neumorphic p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-950">Choose a reward challenge</h3>
            <p className="text-xs text-slate-700 font-medium">
              Select a card below and type the phrase at your natural pace
            </p>
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {DAILY_CHALLENGES.map((ch) => {
            const isSelected = ch.id === activeChallengeId;
            const isDone = completedChallenges.includes(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  setActiveChallengeId(ch.id);
                  setTypedInput('');
                }}
                className={`nexus-card-neumorphic-hover p-4 text-left cursor-pointer ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-600/25 bg-blue-50/40'
                    : 'hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      ch.tier === 'Gold'
                        ? 'bg-amber-100 text-amber-950 border border-amber-300'
                        : ch.tier === 'Silver'
                        ? 'bg-blue-100 text-blue-950 border border-blue-300'
                        : 'bg-teal-100 text-teal-950 border border-teal-300'
                    }`}
                  >
                    {ch.tier}
                  </span>
                  <span className="text-sm font-extrabold text-slate-950 tabular-nums">
                    +KSh {ch.rewardKes}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-950">{ch.title}</p>
                <p className="text-xs text-slate-700 font-medium mt-1 line-clamp-2">{ch.subtitle}</p>
                {isDone && (
                  <div className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-teal-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                    <span>Claimed</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Typing Box with Live Character Highlighting */}
        <form onSubmit={handleCompleteChallenge} className="space-y-4 pt-2">
          <div className="nexus-well-inset p-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">
                {activeChallenge.tier} • {activeChallenge.title}
              </span>
              <span className="font-bold text-amber-950 bg-amber-100 border border-amber-300 px-3 py-0.5 rounded-full tabular-nums">
                Reward: {formatKes(activeChallenge.rewardKes)}
              </span>
            </div>

            {/* Live Character Highlighting Display */}
            <div
              className="p-4 rounded-xl bg-white border border-slate-300 text-base font-semibold leading-relaxed select-none tracking-normal shadow-2xs"
              aria-label="Target phrase to type"
            >
              {activeChallenge.promptText.split('').map((char, idx) => {
                const typedChar = typedInput[idx];
                let charClass = 'text-slate-400';
                if (typedChar !== undefined) {
                  if (typedChar.toLowerCase() === char.toLowerCase()) {
                    charClass = 'text-teal-900 bg-teal-100/90 font-bold';
                  } else {
                    charClass = 'text-red-900 bg-red-100 underline font-bold';
                  }
                }
                return (
                  <span key={idx} className={`${charClass} rounded-xs px-0.5 transition-colors`}>
                    {char}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <label
                htmlFor="challenge-typing-input"
                className="font-bold text-slate-800 flex items-center gap-1.5"
              >
                <Keyboard className="w-4 h-4 text-blue-700" />
                <span>Type the sentence above at your normal speed</span>
              </label>
              <span className="font-extrabold text-blue-700 tabular-nums">
                {typingMatchPct}% matched
              </span>
            </div>
            <input
              id="challenge-typing-input"
              type="text"
              value={typedInput}
              onChange={handleTypingChange}
              placeholder={activeChallenge.promptText}
              autoComplete="off"
              className="nexus-input-neumorphic w-full px-4 py-3 rounded-xl text-sm"
            />
          </div>

          <div className="flex items-center justify-end pt-1">
            <button
              type="submit"
              disabled={!isPromptMatched || isClaimingReward}
              className="nexus-btn-neumorphic w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isClaimingReward ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Crediting reward...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Claim +{formatKes(activeChallenge.rewardKes)} reward</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
