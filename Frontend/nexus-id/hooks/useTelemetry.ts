'use client';

import { useEffect, useRef, useState } from 'react';

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

export type TelemetryWindow = {
  keys: KeyEvent[];
  mouse: MouseEventRecord[];
  windowStartTime: number;
  windowEndTime: number;
};

export function useTelemetry(windowSizeMs = 5000, enabled = true) {
  const [currentRiskScore, setCurrentRiskScore] = useState<number>(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState<number>(0);
  const [totalMouseEvents, setTotalMouseEvents] = useState<number>(0);

  const keysBuffer = useRef<KeyEvent[]>([]);
  const mouseBuffer = useRef<MouseEventRecord[]>([]);
  const windowStart = useRef<number>(Date.now());

  // Cumulative counters maintained in refs to avoid re-rendering components on mouse move
  const cumulativeKeys = useRef<number>(0);
  const cumulativeMouse = useRef<number>(0);
  const lastMouseSample = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture sensitive full text strings, only timing metrics
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

      // Update counters once per window interval (NOT on every mousemove)
      setTotalKeystrokes(cumulativeKeys.current);
      setTotalMouseEvents(cumulativeMouse.current);

      if (keysToSend.length > 0 || mouseToSend.length > 0) {
        try {
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
          }
        } catch (error) {
          // Non-blocking background error
        }
      }
    }, windowSizeMs);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseClick);
      window.removeEventListener('mouseup', handleMouseClick);
      clearInterval(intervalId);
    };
  }, [windowSizeMs, enabled]);

  return { currentRiskScore, totalKeystrokes, totalMouseEvents };
}
