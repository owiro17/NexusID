'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ModelInferenceResult } from '@/lib/ml/onnxEngine';

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

export function useTelemetry(windowSizeMs = 5000, enabled = true) {
  const [currentRiskScore, setCurrentRiskScore] = useState<number>(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState<number>(0);
  const [totalMouseEvents, setTotalMouseEvents] = useState<number>(0);
  const [modelInference, setModelInference] = useState<ModelInferenceResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const keysBuffer = useRef<KeyEvent[]>([]);
  const mouseBuffer = useRef<MouseEventRecord[]>([]);
  const windowStart = useRef<number>(Date.now());

  // Cumulative counters maintained in refs to avoid re-rendering components on mouse move
  const cumulativeKeys = useRef<number>(0);
  const cumulativeMouse = useRef<number>(0);
  const lastMouseSample = useRef<number>(0);

  // Dispatch telemetry to ONNX model API
  const dispatchTelemetry = useCallback(
    async (keysToSend: KeyEvent[], mouseToSend: MouseEventRecord[]) => {
      if (keysToSend.length === 0 && mouseToSend.length === 0) return;

      setIsEvaluating(true);
      try {
        const now = Date.now();
        const response = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keys: keysToSend,
            mouse: mouseToSend,
            windowStartTime: now - windowSizeMs,
            windowEndTime: now,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (typeof data.risk_score === 'number') {
            setCurrentRiskScore(data.risk_score);
          }
          if (data.model_inference) {
            setModelInference(data.model_inference as ModelInferenceResult);
          }
        }
      } catch (error) {
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
    // Synthetic robotic mouse telemetry: ultra-fast, linear teleportation
    const botMouse: MouseEventRecord[] = [];
    for (let i = 0; i < 30; i++) {
      botMouse.push({
        x: 100 + i * 250,
        y: 100 + i * 250,
        type: 'mousemove',
        timestamp: now + i * 2, // 2ms interval (inhuman speed)
      });
    }

    // Synthetic robotic keystrokes: 0.005s hold time, 0.010s DD
    const botKeys: KeyEvent[] = [];
    for (let i = 0; i < 15; i++) {
      botKeys.push({ key: 'x', type: 'keydown', timestamp: now + i * 15 });
      botKeys.push({ key: 'x', type: 'keyup', timestamp: now + i * 15 + 4 });
    }

    await dispatchTelemetry(botKeys, botMouse);
  }, [dispatchTelemetry]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keydown', timestamp: Date.now() });
      cumulativeKeys.current += 1;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keyup', timestamp: Date.now() });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      // Sample mouse at most once every 100ms
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

      // Reset buffers
      keysBuffer.current = [];
      mouseBuffer.current = [];
      windowStart.current = now;

      // Update counters once per window interval
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
    isEvaluating,
    simulateBotTelemetry,
  };
}
