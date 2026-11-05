'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTelemetry } from '@/hooks/useTelemetry';
import { TRAINING_PHRASES, type TrainingPhrase } from '@/lib/data/trainingPhrases';
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
  Shuffle,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from 'lucide-react';

const INITIAL_CREDIT_BALANCE = 250000.0;

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

  // Phrase selection & filter state
  const [selectedTier, setSelectedTier] = useState<'All' | 'Bronze' | 'Silver' | 'Gold'>('Bronze');
  const [activePhraseId, setActivePhraseId] = useState<string>(TRAINING_PHRASES[0].id);

  const [typedInput, setTypedInput] = useState<string>('');
  const [completedPhrases, setCompletedPhrases] = useState<string[]>([]);
  const [localPoints, setLocalPoints] = useState<number>(120);
  const [isClaimingReward, setIsClaimingReward] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filtered phrase pool based on active tier tab
  const tierPhrases = useMemo(() => {
    if (selectedTier === 'All') return TRAINING_PHRASES;
    return TRAINING_PHRASES.filter((p) => p.tier === selectedTier);
  }, [selectedTier]);

  // Current active phrase definition
  const activePhrase: TrainingPhrase = useMemo(() => {
    const found = TRAINING_PHRASES.find((p) => p.id === activePhraseId);
    return found || tierPhrases[0] || TRAINING_PHRASES[0];
  }, [activePhraseId, tierPhrases]);

  // Index of active phrase in current filtered list
  const currentFilteredIndex = useMemo(() => {
    const idx = tierPhrases.findIndex((p) => p.id === activePhrase.id);
    return idx >= 0 ? idx : 0;
  }, [tierPhrases, activePhrase.id]);

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
        for (const p of TRAINING_PHRASES) {
          if (
            ledgerData.some(
              (tx) =>
                tx.target_account?.includes(p.title) ||
                tx.target_account?.includes(p.id) ||
                tx.target_account?.includes(`+KSh ${p.rewardKes}`)
            )
          ) {
            claimedIds.push(p.id);
          }
        }
        setCompletedPhrases(claimedIds);
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
  const targetClean = activePhrase.promptText.trim().toLowerCase();
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
  const isPromptMatched = typingMatchPct >= 96 || typedClean === targetClean;

  const handleTypingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedInput(e.target.value);
    setLocalPoints((prev) => prev + 3);
  };

  // Switch to next phrase in library
  const handleNextPhrase = () => {
    const nextIdx = (currentFilteredIndex + 1) % tierPhrases.length;
    setActivePhraseId(tierPhrases[nextIdx].id);
    setTypedInput('');
    setStatusBanner(null);
  };

  // Switch to previous phrase
  const handlePrevPhrase = () => {
    const prevIdx = (currentFilteredIndex - 1 + tierPhrases.length) % tierPhrases.length;
    setActivePhraseId(tierPhrases[prevIdx].id);
    setTypedInput('');
    setStatusBanner(null);
  };

  // Shuffle a random phrase from current tier or all 101 phrases
  const handleShufflePhrase = () => {
    const pool = tierPhrases.length > 1 ? tierPhrases : TRAINING_PHRASES;
    let randomIdx = Math.floor(Math.random() * pool.length);
    if (pool[randomIdx].id === activePhrase.id && pool.length > 1) {
      randomIdx = (randomIdx + 1) % pool.length;
    }
    setActivePhraseId(pool[randomIdx].id);
    setTypedInput('');
    setStatusBanner(null);
  };

  const handleCompleteChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPromptMatched || !currentUserId) return;

    setIsClaimingReward(true);
    setStatusBanner(null);

    try {
      await rewardContinualModel(activePhrase.pointsRequired);
      setLocalPoints((prev) => prev + activePhrase.pointsRequired);

      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: `Biometric Training Reward: ${activePhrase.title} (+KSh ${activePhrase.rewardKes})`,
          transaction_amount: -activePhrase.rewardKes,
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
            phrase_id: activePhrase.id,
            phrase_tier: activePhrase.tier,
            reward_kes: activePhrase.rewardKes,
          },
        }),
      });

      setCompletedPhrases((prev) =>
        prev.includes(activePhrase.id) ? prev : [...prev, activePhrase.id]
      );
      setTypedInput('');
      await loadLedger();

      setStatusBanner({
        type: 'success',
        text: `Excellent! ${formatKes(activePhrase.rewardKes)} credited. Your biometric baseline has been updated.`,
      });

      // Automatically advance to the next phrase to keep the typing flow smooth!
      setTimeout(() => {
        handleNextPhrase();
      }, 1600);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Could not claim reward right now. Please try again.',
      });
    } finally {
      setIsClaimingReward(false);
    }
  };

  const isCurrentDone = completedPhrases.includes(activePhrase.id);

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
                100+ Behavioral Biometric Training Challenges
              </h2>
              <p className="text-xs text-slate-700 font-medium mt-0.5">
                Practice varied typing rhythms, account routing codes, and regulatory sentences to train your personal profile and earn real KSh rewards.
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
            <span className="text-xs text-amber-950 font-bold block">Phrases mastered</span>
            <span className="text-xl font-extrabold text-amber-800 tabular-nums mt-1 block">
              {completedPhrases.length} of {TRAINING_PHRASES.length} phrases
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
              Bronze (33 phrases) • KSh 50
            </span>
            <span className={effectivePoints >= 220 ? 'text-blue-900 font-bold' : ''}>
              Silver (34 phrases) • KSh 150
            </span>
            <span className={effectivePoints >= 400 ? 'text-amber-900 font-bold' : ''}>
              Gold (34 phrases) • KSh 500
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

      {/* Tier Filter Tabs & Navigation Strip */}
      <section className="nexus-card-neumorphic p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950">Training Phrase Library</h3>
              <p className="text-xs text-slate-700 font-medium">
                101 diverse phrases designed to test dwell times, flight latencies, and capitalization rhythms
              </p>
            </div>
          </div>

          {/* Quick Action Buttons: Prev, Shuffle, Next */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handlePrevPhrase}
              title="Previous phrase"
              className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleShufflePhrase}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Shuffle className="w-3.5 h-3.5 text-blue-700" />
              <span>Shuffle</span>
            </button>
            <button
              type="button"
              onClick={handleNextPhrase}
              title="Next phrase"
              className="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tier Tabs: Bronze, Silver, Gold, All */}
        <div className="flex flex-wrap items-center gap-2">
          {(['Bronze', 'Silver', 'Gold', 'All'] as const).map((tier) => {
            const isTabActive = selectedTier === tier;
            const count =
              tier === 'All'
                ? TRAINING_PHRASES.length
                : TRAINING_PHRASES.filter((p) => p.tier === tier).length;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  setSelectedTier(tier);
                  const firstOfTier = tier === 'All' ? TRAINING_PHRASES[0] : TRAINING_PHRASES.find((p) => p.tier === tier);
                  if (firstOfTier) {
                    setActivePhraseId(firstOfTier.id);
                    setTypedInput('');
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isTabActive
                    ? 'bg-blue-600 text-white shadow-2xs ring-2 ring-blue-600/20'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                <span>{tier}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isTabActive ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Phrase Card Header */}
        <div className="nexus-card-neumorphic p-4 bg-slate-50/50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  activePhrase.tier === 'Gold'
                    ? 'bg-amber-100 text-amber-950 border border-amber-300'
                    : activePhrase.tier === 'Silver'
                    ? 'bg-blue-100 text-blue-950 border border-blue-300'
                    : 'bg-teal-100 text-teal-950 border border-teal-300'
                }`}
              >
                {activePhrase.tier}
              </span>
              <span className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 rounded-full">
                {activePhrase.category}
              </span>
              <span className="text-xs text-slate-600 font-medium">
                Phrase {currentFilteredIndex + 1} of {tierPhrases.length}
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-950 pt-0.5">
              {activePhrase.title}
            </h4>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isCurrentDone && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-100 border border-teal-300 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Claimed</span>
              </span>
            )}
            <span className="text-xs font-bold text-amber-950 bg-amber-100 border border-amber-300 px-3 py-1 rounded-full tabular-nums">
              Reward: {formatKes(activePhrase.rewardKes)}
            </span>
          </div>
        </div>

        {/* Phrase Selector Quick-Jump Dropdown */}
        <div className="flex items-center gap-2 text-xs">
          <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
          <label htmlFor="phrase-select" className="font-bold text-slate-700 shrink-0">
            Jump to phrase:
          </label>
          <select
            id="phrase-select"
            value={activePhrase.id}
            onChange={(e) => {
              setActivePhraseId(e.target.value);
              setTypedInput('');
              setStatusBanner(null);
            }}
            className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
          >
            {tierPhrases.map((p, idx) => (
              <option key={p.id} value={p.id}>
                #{idx + 1} [{p.tier}] {p.title} ({p.promptText.length} chars)
              </option>
            ))}
          </select>
        </div>

        {/* Typing Box with Live Character Highlighting */}
        <form onSubmit={handleCompleteChallenge} className="space-y-4 pt-1">
          <div className="nexus-well-inset p-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900">
                Target phrase ({activePhrase.promptText.length} characters)
              </span>
              <span className="text-slate-600 font-medium">
                Type naturally — your rhythm trains the behavioral autoencoder
              </span>
            </div>

            {/* Live Character Highlighting Display */}
            <div
              className="p-4 rounded-xl bg-white border border-slate-300 text-base font-semibold leading-relaxed select-none tracking-normal shadow-2xs break-words"
              aria-label="Target phrase to type"
            >
              {activePhrase.promptText.split('').map((char, idx) => {
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
                <span>Type the sentence above</span>
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
              placeholder={activePhrase.promptText}
              autoComplete="off"
              className="nexus-input-neumorphic w-full px-4 py-3 rounded-xl text-sm font-medium"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-600 font-medium">
              Press Enter or click the button once matched
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleNextPhrase}
                className="nexus-btn-neumorphic px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Skip / Next phrase
              </button>

              <button
                type="submit"
                disabled={!isPromptMatched || isClaimingReward}
                className="nexus-btn-neumorphic w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isClaimingReward ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Crediting reward...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Claim +{formatKes(activePhrase.rewardKes)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
