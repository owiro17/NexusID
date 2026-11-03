'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTelemetry } from '@/hooks/useTelemetry';
import { StepUpModal } from '@/components/auth/StepUpModal';
import type { FinancialLedger } from '@/types/auth';
import {
  Trophy,
  Sparkles,
  Keyboard,
  DollarSign,
  Send,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Fingerprint,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Zap,
  Award,
  Lock,
} from 'lucide-react';

interface ChallengeDefinition {
  id: string;
  tier: 'Bronze' | 'Silver' | 'Gold';
  title: string;
  description: string;
  promptText: string;
  pointsRequired: number;
  rewardUsd: number;
  rlEpochsBoost: number;
}

const DAILY_CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'challenge_bronze_kyc',
    tier: 'Bronze',
    title: 'Tier 1: Agency Liquidity Verification Phrase',
    description:
      'Calibrate your short-burst keystroke hold & flight cadence while earning a $50.00 Treasury Micro-Grant.',
    promptText:
      'authorize agency settlement vault 904 for immediate clearing',
    pointsRequired: 100,
    rewardUsd: 50,
    rlEpochsBoost: 3,
  },
  {
    id: 'challenge_silver_wire',
    tier: 'Silver',
    title: 'Tier 2: High-Velocity IBAN & Swift Routing Drill',
    description:
      'Train the 12-D Deep Behavioral Autoencoder on alphanumeric account transitions to reduce False Rejections (FRR).',
    promptText:
      'verify swift routing KE88NXID0045219000 and release escrow tranche',
    pointsRequired: 220,
    rewardUsd: 150,
    rlEpochsBoost: 6,
  },
  {
    id: 'challenge_gold_zero_trust',
    tier: 'Gold',
    title: 'Tier 3: Continuous Zero-Trust Operator Masterphrase',
    description:
      'Lock your deep neural manifold across extended digraphs and unlock the $500.00 Enterprise Liquidity Reward.',
    promptText:
      'continuous behavioral biometrics protect agency banking against session hijacking',
    pointsRequired: 400,
    rewardUsd: 500,
    rlEpochsBoost: 10,
  },
];

const INITIAL_CREDIT_BALANCE = 25000.0;

export default function DailyChallengesPage() {
  const router = useRouter();
  const supabase = createClient();

  const {
    currentRiskScore: liveRiskScore,
    totalKeystrokes,
    operatorVerification,
    activeSessionId,
    rewardContinualModel,
  } = useTelemetry(5000, true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<FinancialLedger[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Challenge Progress State
  const [activeChallengeId, setActiveChallengeId] = useState<string>(DAILY_CHALLENGES[0].id);
  const [typedInput, setTypedInput] = useState<string>('');
  const [completedChallenges, setCompletedChallenges] = useState<string[]>([]);
  const [localTelemetryPoints, setLocalTelemetryPoints] = useState<number>(120);
  const [isClaimingReward, setIsClaimingReward] = useState<boolean>(false);

  // Instant P2P Account Transfer State
  const [recipientAccount, setRecipientAccount] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [isSendingTransfer, setIsSendingTransfer] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  // Step-Up Modal State
  const [isStepUpOpen, setIsStepUpOpen] = useState<boolean>(false);
  const [pendingP2P, setPendingP2P] = useState<{
    account: string;
    amount: number;
    note: string;
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
        // Detect already claimed challenges today
        const claimedIds: string[] = [];
        for (const ch of DAILY_CHALLENGES) {
          if (ledgerData.some((tx) => tx.target_account?.includes(ch.title))) {
            claimedIds.push(ch.id);
          }
        }
        setCompletedChallenges(claimedIds);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Sync telemetry points from backend RL state
  const serverPoints = operatorVerification?.continualLearning?.telemetryPoints ?? 0;
  const effectivePoints = Math.max(localTelemetryPoints, serverPoints);
  const maxGoalPoints = 500;
  const progressBarPct = Math.min(100, Math.round((effectivePoints / maxGoalPoints) * 100));

  // Calculate live balance (negative transaction_amount in financial_ledgers = inflow reward credit!)
  const totalOutflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.transaction_amount), 0);

  const totalRewardsInflow = transactions
    .filter((tx) => tx.status !== 'Failed' && Number(tx.transaction_amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.transaction_amount)), 0);

  const availableBalance = Math.max(0, INITIAL_CREDIT_BALANCE - totalOutflow + totalRewardsInflow);

  // Typing Accuracy & Match Progress for Active Challenge
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
    const val = e.target.value;
    setTypedInput(val);
    setLocalTelemetryPoints((prev) => prev + 3);
  };

  // Claim Challenge Reward -> Credits money to Supabase `financial_ledgers` + RL Autoencoder Training!
  const handleCompleteChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPromptMatched || !currentUserId) return;

    setIsClaimingReward(true);
    setStatusBanner(null);

    try {
      // 1. Trigger Online Deep Autoencoder + Contextual Bandit RL positive reinforcement
      await rewardContinualModel(activeChallenge.pointsRequired);
      setLocalTelemetryPoints((prev) => prev + activeChallenge.pointsRequired);

      // 2. Credit Money Reward into `public.financial_ledgers` (negative amount = Credit Inflow in Dashboard calculation)
      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: `🏆 Reward Credit: ${activeChallenge.title} (+$${activeChallenge.rewardUsd})`,
          transaction_amount: -activeChallenge.rewardUsd,
          status: 'completed',
        },
      ]);

      if (error) throw error;

      // 3. Log Audit Event with Session ID
      await fetch('/api/auth/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          eventType: 'STEP_UP_VERIFIED',
          recordedRiskScore: liveRiskScore,
          metadata: {
            challenge_id: activeChallenge.id,
            reward_usd: activeChallenge.rewardUsd,
            rl_epochs_boost: activeChallenge.rlEpochsBoost,
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
        text: `Challenge Completed! +$${activeChallenge.rewardUsd.toFixed(2)} credited to your balance & Autoencoder trained (+${activeChallenge.rlEpochsBoost} RL epochs).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Could not credit challenge reward.',
      });
    } finally {
      setIsClaimingReward(false);
    }
  };

  // P2P Transfer to Another Account Number
  const executeP2PTransfer = async (account: string, amount: number, note: string) => {
    if (!currentUserId) return;
    setIsSendingTransfer(true);

    try {
      const label = note
        ? `P2P Account ${account} (${note})`
        : `P2P Account Transfer -> ${account}`;

      const { error } = await supabase.from('financial_ledgers').insert([
        {
          user_id: currentUserId,
          target_account: label,
          transaction_amount: amount,
          status: 'completed',
        },
      ]);

      if (error) throw error;

      await loadLedger();
      setRecipientAccount('');
      setTransferAmount('');
      setTransferNote('');

      setStatusBanner({
        type: 'success',
        text: `Instant P2P Transfer of $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} sent to Account #${account}!`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Transfer failed.',
      });
    } finally {
      setIsSendingTransfer(false);
      setPendingP2P(null);
    }
  };

  const handleInitiateP2P = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const amt = parseFloat(transferAmount);
    if (!recipientAccount.trim()) {
      setStatusBanner({ type: 'error', text: 'Please enter a recipient Account Number.' });
      return;
    }
    if (isNaN(amt) || amt <= 0 || amt > availableBalance) {
      setStatusBanner({
        type: 'error',
        text: `Enter a valid amount up to $${availableBalance.toLocaleString()}.`,
      });
      return;
    }

    if (liveRiskScore > 70 || amt >= 5000) {
      setPendingP2P({
        account: recipientAccount.trim(),
        amount: amt,
        note: transferNote.trim(),
      });
      setIsStepUpOpen(true);
      return;
    }

    await executeP2PTransfer(recipientAccount.trim(), amt, transferNote.trim());
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono mb-1">
            <Trophy className="w-3.5 h-3.5" />
            <span>CONTINUAL RL BIOMETRIC CALIBRATION • GAMIFIED REWARDS HUB</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Daily Telemetry Challenges & P2P Rewards
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Complete typing challenges to earn real liquidity rewards while training your personal Deep Behavioral Autoencoder to eliminate false positives.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>Back to Overview</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Telemetry Points Bar & RL Model Health Strip */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-6 shadow-xl space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[11px] font-mono text-slate-400 uppercase block">
              Available Balance (incl. Rewards)
            </span>
            <span className="text-2xl font-extrabold font-mono text-white mt-1 block">
              ${availableBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] font-mono text-emerald-400 mt-1 block">
              +${totalRewardsInflow.toFixed(2)} Earned from Challenges
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[11px] font-mono text-slate-400 uppercase block">
              Telemetry Points Progress
            </span>
            <span className="text-2xl font-extrabold font-mono text-cyan-400 mt-1 block">
              {effectivePoints} <span className="text-sm text-slate-500">/ {maxGoalPoints} PTS</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400 mt-1 block">
              {totalKeystrokes} Keystrokes Captured
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[11px] font-mono text-slate-400 uppercase block">
              Deep Autoencoder RL Epochs
            </span>
            <span className="text-2xl font-extrabold font-mono text-emerald-400 mt-1 block">
              {operatorVerification?.continualLearning?.epochsTrained ?? 6} Epochs
            </span>
            <span className="text-[11px] font-mono text-slate-400 mt-1 block">
              Recon Error: {(operatorVerification?.reconstructionError ?? 0.14).toFixed(3)}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
            <span className="text-[11px] font-mono text-slate-400 uppercase block">
              FRR Reduction Multiplier
            </span>
            <span className="text-2xl font-extrabold font-mono text-amber-400 mt-1 block">
              {(operatorVerification?.continualLearning?.adaptiveMultiplier ?? 1.0).toFixed(2)}x
            </span>
            <span className="text-[11px] font-mono text-emerald-400 mt-1 block">
              Synced to Supabase Cloud
            </span>
          </div>
        </div>

        {/* Master Telemetry Points Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Daily Telemetry Points Bar (Unlocks Tiered Money Rewards & Neural Precision)</span>
            </span>
            <span className="text-cyan-400 font-bold">
              {effectivePoints} / {maxGoalPoints} Telemetry Points ({progressBarPct}%)
            </span>
          </div>
          <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400 transition-all duration-300"
              style={{ width: `${Math.max(5, progressBarPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>0 PTS (Start)</span>
            <span className={effectivePoints >= 100 ? 'text-emerald-400 font-bold' : ''}>
              100 PTS ($50 Bronze)
            </span>
            <span className={effectivePoints >= 220 ? 'text-cyan-400 font-bold' : ''}>
              220 PTS ($150 Silver)
            </span>
            <span className={effectivePoints >= 400 ? 'text-amber-400 font-bold' : ''}>
              400+ PTS ($500 Gold)
            </span>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
              : 'bg-red-950/50 border-red-700 text-red-200'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium">{statusBanner.text}</span>
        </div>
      )}

      {/* Main Two-Column Grid: Left = Interactive Typing Challenges | Right = Instant Account Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: 3 Tiered Challenges + Interactive Typing Box (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Select a Reward Tier & Type Phrase
                  </h2>
                  <p className="text-xs text-slate-400">
                    Each keystroke feeds your Online Autoencoder and adds +3 Telemetry Points
                  </p>
                </div>
              </div>
            </div>

            {/* Challenge Tier Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 ring-1 ring-cyan-500/30'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          ch.tier === 'Gold'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : ch.tier === 'Silver'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {ch.tier} Tier
                      </span>
                      <span className="text-sm font-extrabold font-mono text-emerald-400">
                        +${ch.rewardUsd}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-white line-clamp-1">{ch.title}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>+{ch.pointsRequired} PTS</span>
                      {isDone && (
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          ✓ Claimed
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Challenge Typing Arena */}
            <form onSubmit={handleCompleteChallenge} className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-400">{activeChallenge.title}</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    Reward: ${activeChallenge.rewardUsd.toFixed(2)} USD
                  </span>
                </div>
                <p className="text-xs text-slate-400">{activeChallenge.description}</p>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-sm text-emerald-300 select-none tracking-wide">
                  {activeChallenge.promptText}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label className="font-medium text-slate-300 flex items-center gap-1.5">
                    <Keyboard className="w-4 h-4 text-cyan-400" />
                    <span>Type the phrase above naturally to calibrate your neural profile:</span>
                  </label>
                  <span className="font-mono text-cyan-400">{typingMatchPct}% Match</span>
                </div>
                <input
                  type="text"
                  value={typedInput}
                  onChange={handleTypingChange}
                  placeholder={activeChallenge.promptText}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTypedInput(activeChallenge.promptText);
                    setLocalTelemetryPoints((prev) => prev + 45);
                  }}
                  className="text-xs font-mono text-slate-400 hover:text-cyan-400 underline cursor-pointer"
                >
                  Quick-Fill Phrase (Demo Assist)
                </button>

                <button
                  type="submit"
                  disabled={!isPromptMatched || isClaimingReward}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-slate-950 disabled:opacity-40 transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  {isClaimingReward ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Crediting Reward & Training RL...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        Claim +${activeChallenge.rewardUsd} Reward & Train Model
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Transfer Rewards to Another Person by Account Number (5 cols) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl h-full flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      Transfer to Account Number
                    </h2>
                    <p className="text-xs text-slate-400">
                      Send earned rewards or liquidity to any peer account
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  P2P Instant
                </span>
              </div>

              <form onSubmit={handleInitiateP2P} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Recipient Account Number
                  </label>
                  <input
                    type="text"
                    value={recipientAccount}
                    onChange={(e) => setRecipientAccount(e.target.value)}
                    placeholder="e.g. ACC-KE-01948201"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      'ACC-KE-01948201 (Alice W.)',
                      'ACC-KE-08831044 (Brian O.)',
                      'SME-WAKALA-7740 (Agency Float)',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRecipientAccount(preset)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <label className="font-medium text-slate-300">Amount ($ USD)</label>
                    <span className="font-mono text-slate-400">
                      Available: ${availableBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="50.00"
                      required
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {[50, 150, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTransferAmount(String(amt))}
                        className="py-1 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-mono text-cyan-300 cursor-pointer"
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Payment Reference / Note
                  </label>
                  <input
                    type="text"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="e.g. Agency Commission Payout"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSendingTransfer}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSendingTransfer ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Settling on Supabase Ledger...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Instant Account Transfer</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Session ID:</span>
                <span className="text-cyan-400">{activeSessionId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Bound Client IP:</span>
                <span className="text-emerald-400">
                  {operatorVerification?.sessionSecurity?.boundIp || '127.0.0.1'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <StepUpModal
        isOpen={isStepUpOpen}
        currentRiskScore={liveRiskScore}
        actionDescription={
          pendingP2P
            ? `Authorize P2P Transfer of $${pendingP2P.amount.toLocaleString()} to Account ${pendingP2P.account}`
            : 'Verify Identity'
        }
        onVerified={async () => {
          setIsStepUpOpen(false);
          await rewardContinualModel(75);
          if (pendingP2P) {
            await executeP2PTransfer(pendingP2P.account, pendingP2P.amount, pendingP2P.note);
          }
        }}
        onCancel={() => {
          setIsStepUpOpen(false);
          setPendingP2P(null);
        }}
      />
    </div>
  );
}
