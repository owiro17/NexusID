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
  const [currentRiskScore, setCurrentRiskScore] = useState<number>(0); // 0-100
  const keysBuffer = useRef<KeyEvent[]>([]);
  const mouseBuffer = useRef<MouseEventRecord[]>([]);
  const windowStart = useRef<number>(Date.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keydown', timestamp: Date.now() });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysBuffer.current.push({ key: e.key, type: 'keyup', timestamp: Date.now() });
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Throttle mouse events to ~20hz to prevent overwhelming the payload
      if (mouseBuffer.current.length > 0) {
        const last = mouseBuffer.current[mouseBuffer.current.length - 1];
        if (Date.now() - last.timestamp < 50) return; 
      }
      mouseBuffer.current.push({ x: e.clientX, y: e.clientY, type: 'mousemove', timestamp: Date.now() });
    };

    const handleMouseClick = (e: MouseEvent) => {
      mouseBuffer.current.push({ x: e.clientX, y: e.clientY, type: e.type as 'mousedown'|'mouseup', timestamp: Date.now() });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseClick);
    window.addEventListener('mouseup', handleMouseClick);

    // Set up the interval to process the sliding window
    const intervalId = setInterval(async () => {
      const now = Date.now();
      const payload: TelemetryWindow = {
        keys: [...keysBuffer.current],
        mouse: [...mouseBuffer.current],
        windowStartTime: windowStart.current,
        windowEndTime: now,
      };

      // Reset buffers for the next window
      keysBuffer.current = [];
      mouseBuffer.current = [];
      windowStart.current = now;

      // Only send to the backend if there is actual activity
      if (payload.keys.length > 0 || payload.mouse.length > 0) {
        try {
          // Send data to our Next.js API route to view it in the terminal
          const response = await fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (response.ok) {
            const data = await response.json();
            // Update the UI with the mock risk score returned from the server
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

  return { currentRiskScore };
}
