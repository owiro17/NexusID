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
  type: 'mousemove' | 'mousedown' | 'mouseup';
  timestamp: number;
};

export type TelemetryWindow = {
  keys: KeyEvent[];
  mouse: MouseEventRecord[];
  windowStartTime: number;
  windowEndTime: number;
};

export function useTelemetry(windowSizeMs = 5000) {
  const [currentRiskScore, setCurrentRiskScore] = useState<number>(0); 
  const [totalKeystrokes, setTotalKeystrokes] = useState<number>(0);
  const [totalMouseEvents, setTotalMouseEvents] = useState<number>(0);
  
  const keysBuffer = useRef<KeyEvent[]>([]);
  const mouseBuffer = useRef<MouseEventRecord[]>([]);
  const windowStart = useRef<number>(Date.now());

  // Use refs for cumulative totals to avoid re-triggering the effect
  const cumulativeKeys = useRef<number>(0);
  const cumulativeMouse = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keydown', timestamp: Date.now() });
      cumulativeKeys.current += 1;
      setTotalKeystrokes(cumulativeKeys.current);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keyup', timestamp: Date.now() });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (mouseBuffer.current.length > 0) {
        const last = mouseBuffer.current[mouseBuffer.current.length - 1];
        if (Date.now() - last.timestamp < 50) return; 
      }
      mouseBuffer.current.push({ x: e.clientX, y: e.clientY, type: 'mousemove', timestamp: Date.now() });
      cumulativeMouse.current += 1;
      setTotalMouseEvents(cumulativeMouse.current);
    };

    const handleMouseClick = (e: MouseEvent) => {
      mouseBuffer.current.push({ x: e.clientX, y: e.clientY, type: e.type as 'mousedown'|'mouseup', timestamp: Date.now() });
      cumulativeMouse.current += 1;
      setTotalMouseEvents(cumulativeMouse.current);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseClick);
    window.addEventListener('mouseup', handleMouseClick);

    const intervalId = setInterval(async () => {
      const now = Date.now();
      const payload: TelemetryWindow = {
        keys: [...keysBuffer.current],
        mouse: [...mouseBuffer.current],
        windowStartTime: windowStart.current,
        windowEndTime: now,
      };

      keysBuffer.current = [];
      mouseBuffer.current = [];
      windowStart.current = now;

      if (payload.keys.length > 0 || payload.mouse.length > 0) {
        try {
          const response = await fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.risk_score !== undefined) {
              setCurrentRiskScore(data.risk_score);
            }
          }
        } catch (error) {
          console.error('Failed to send telemetry:', error);
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
  }, [windowSizeMs]);

  return { currentRiskScore, totalKeystrokes, totalMouseEvents };
}
