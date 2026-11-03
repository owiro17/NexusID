'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ModelInferenceResult } from '@/lib/ml/onnxEngine';
import type { OperatorVerificationResult } from '@/lib/ml/operatorProfileEngine';

export type KeyEvent = {
  key: string;
  type: 'keydown' | 'keyup';
  timestamp: number;
};

export type MouseEventRecord = {
  x: number;
  y: number;
  type: string;
  timestamp: number;
};

const SESSION_STORAGE_KEY = 'nexusid_active_session_id';

function getOrGenerateClientSessionId(): string {
  if (typeof window === 'undefined') return 'sess_server_init';
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.startsWith('sess_')) return existing;
    const randomHex = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const newId = `sess_${randomHex}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    return newId;
  } catch {
    return 'sess_browser_fallback';
  }
}

export function useTelemetry(windowSizeMs = 5000, enabled = true) {
  const [currentRiskScore, setCurrentRiskScore] = useState<number>(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState<number>(0);
  const [totalMouseEvents, setTotalMouseEvents] = useState<number>(0);
  const [modelInference, setModelInference] = useState<ModelInferenceResult | null>(null);
  const [operatorVerification, setOperatorVerification] =
    useState<OperatorVerificationResult | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>('sess_initializing');
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const keysBuffer = useRef<KeyEvent[]>([]);
  const mouseBuffer = useRef<MouseEventRecord[]>([]);
  const windowStart = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>('sess_initializing');

  const cumulativeKeys = useRef<number>(0);
  const cumulativeMouse = useRef<number>(0);
  const lastMouseSample = useRef<number>(0);

  useEffect(() => {
    const sid = getOrGenerateClientSessionId();
    sessionIdRef.current = sid;
    setActiveSessionId(sid);
  }, []);

  // Dispatch telemetry to ONNX + Continual Autoencoder & RL API
  const dispatchTelemetry = useCallback(
    async (
      keysToSend: KeyEvent[],
      mouseToSend: MouseEventRecord[],
      profileAction?:
        | 'reset'
        | 'instant_enroll'
        | 'rl_stepup_reward'
        | 'simulate_ip_drift',
      forceDispatch = false,
      bonusTelemetryPoints = 0
    ) => {
      if (
        !forceDispatch &&
        !profileAction &&
        bonusTelemetryPoints === 0 &&
        keysToSend.length === 0 &&
        mouseToSend.length === 0
      ) {
        return;
      }

      setIsEvaluating(true);
      try {
        const now = Date.now();
        const sid = sessionIdRef.current || getOrGenerateClientSessionId();
        const response = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sid,
            keys: keysToSend,
            mouse: mouseToSend,
            profileAction,
            bonusTelemetryPoints,
            windowStartTime: now - windowSizeMs,
            windowEndTime: now,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (typeof data.session_id === 'string') {
            sessionIdRef.current = data.session_id;
            setActiveSessionId(data.session_id);
          }
          if (typeof data.risk_score === 'number') {
            setCurrentRiskScore(data.risk_score);
          }
          if (data.model_inference) {
            setModelInference(data.model_inference as ModelInferenceResult);
          }
          if (data.operator_verification) {
            setOperatorVerification(data.operator_verification as OperatorVerificationResult);
          }
        }
      } catch {
        // Non-blocking background error
      } finally {
        setIsEvaluating(false);
      }
    },
    [windowSizeMs]
  );

  // Trigger simulated bot telemetry through the real ONNX model API
  const simulateBotTelemetry = useCallback(async () => {
    const now = Date.now();
    const botMouse: MouseEventRecord[] = [];
    for (let i = 0; i < 30; i++) {
      botMouse.push({
        x: 100 + i * 250,
        y: 100 + i * 250,
        type: 'mousemove',
        timestamp: now + i * 2,
      });
    }

    const botKeys: KeyEvent[] = [];
    for (let i = 0; i < 15; i++) {
      botKeys.push({ key: 'x', type: 'keydown', timestamp: now + i * 15 });
      botKeys.push({ key: 'x', type: 'keyup', timestamp: now + i * 15 + 4 });
    }

    await dispatchTelemetry(botKeys, botMouse, undefined, true);
  }, [dispatchTelemetry]);

  // Trigger a realistic Human Impostor (Operator B taking over Alice's unlocked terminal)
  const simulateHumanImpostorSwap = useCallback(async () => {
    const now = Date.now();
    const impostorKeys: KeyEvent[] = [];
    let cursorTime = now;
    const keysSeq = ['t', 'r', 'a', 'n', 's', 'f', 'e', 'r', '5', '0', '0', '0'];
    for (let i = 0; i < keysSeq.length; i++) {
      const holdMs = 245 + ((i * 19) % 35);
      const flightMs = 660 + ((i * 47) % 140);
      impostorKeys.push({ key: keysSeq[i], type: 'keydown', timestamp: cursorTime });
      impostorKeys.push({ key: keysSeq[i], type: 'keyup', timestamp: cursorTime + holdMs });
      cursorTime += holdMs + flightMs;
    }

    const impostorMouse: MouseEventRecord[] = [];
    for (let i = 0; i < 20; i++) {
      impostorMouse.push({
        x: 200 + i * 12 + (i % 3) * 4,
        y: 300 + i * 8 - (i % 2) * 3,
        type: 'mousemove',
        timestamp: now + i * 110,
      });
    }

    await dispatchTelemetry(impostorKeys, impostorMouse, undefined, true);
  }, [dispatchTelemetry]);

  const simulateIpHijackDrift = useCallback(async () => {
    await dispatchTelemetry([], [], 'simulate_ip_drift', true);
  }, [dispatchTelemetry]);

  const instantEnrollProfile = useCallback(async () => {
    await dispatchTelemetry([], [], 'instant_enroll', true);
  }, [dispatchTelemetry]);

  const rewardContinualModel = useCallback(
    async (bonusPoints = 50) => {
      await dispatchTelemetry(
        [...keysBuffer.current],
        [...mouseBuffer.current],
        'rl_stepup_reward',
        true,
        bonusPoints
      );
    },
    [dispatchTelemetry]
  );

  const resetOperatorProfile = useCallback(async () => {
    await dispatchTelemetry([], [], 'reset', true);
  }, [dispatchTelemetry]);

  useEffect(() => {
    if (!enabled) return;

    dispatchTelemetry([], [], undefined, true);

    const handleKeyDown = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keydown', timestamp: Date.now() });
      cumulativeKeys.current += 1;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keyup', timestamp: Date.now() });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastMouseSample.current < 100) return;
      lastMouseSample.current = now;

      mouseBuffer.current.push({
        x: e.clientX,
        y: e.clientY,
        type: 'mousemove',
        timestamp: now,
      });
      cumulativeMouse.current += 1;
    };

    const handleMouseClick = (e: MouseEvent) => {
      mouseBuffer.current.push({
        x: e.clientX,
        y: e.clientY,
        type: e.type,
        timestamp: Date.now(),
      });
      cumulativeMouse.current += 1;
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseClick, { passive: true });
    window.addEventListener('mouseup', handleMouseClick, { passive: true });

    const intervalId = setInterval(async () => {
      const now = Date.now();
      const keysToSend = [...keysBuffer.current];
      const mouseToSend = [...mouseBuffer.current];

      keysBuffer.current = [];
      mouseBuffer.current = [];
      windowStart.current = now;

      setTotalKeystrokes(cumulativeKeys.current);
      setTotalMouseEvents(cumulativeMouse.current);

      await dispatchTelemetry(keysToSend, mouseToSend);
    }, windowSizeMs);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseClick);
      window.removeEventListener('mouseup', handleMouseClick);
      clearInterval(intervalId);
    };
  }, [windowSizeMs, enabled, dispatchTelemetry]);

  return {
    currentRiskScore,
    totalKeystrokes,
    totalMouseEvents,
    modelInference,
    operatorVerification,
    activeSessionId,
    isEvaluating,
    simulateBotTelemetry,
    simulateHumanImpostorSwap,
    simulateIpHijackDrift,
    instantEnrollProfile,
    rewardContinualModel,
    resetOperatorProfile,
  };
}
