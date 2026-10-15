import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface KeyEventData {
  key: string;
  type: 'keydown' | 'keyup';
  timestamp: number;
}

interface MouseEventData {
  x: number;
  y: number;
  type: string;
  timestamp: number;
}

// Pure TypeScript/JS mathematical feature extraction & scoring (instant, non-blocking)
function evaluateKeystrokeDynamics(keys: KeyEventData[]): number {
  if (!keys || keys.length < 3) return 0.95; // Nominal human baseline if few keys

  const intervals: number[] = [];
  for (let i = 1; i < keys.length; i++) {
    const diff = keys[i].timestamp - keys[i - 1].timestamp;
    if (diff > 0 && diff < 5000) {
      intervals.push(diff);
    }
  }

  if (intervals.length === 0) return 0.95;

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance =
    intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);

  // Bots/scripts have ultra-low stdDev (< 2ms) or inhumanly fast typing (< 20ms mean)
  if (mean < 25 || stdDev < 3) {
    return 0.15; // Highly suspicious anomaly
  }

  // Normal human typing cadence: mean between 80ms and 600ms with healthy natural variance
  if (mean >= 60 && mean <= 800 && stdDev >= 15) {
    return 0.96;
  }

  return 0.85;
}

function evaluateMouseKinematics(mouse: MouseEventData[]): number {
  if (!mouse || mouse.length < 3) return 0.92;

  const velocities: number[] = [];
  for (let i = 1; i < mouse.length; i++) {
    const dt = Math.max(1, mouse[i].timestamp - mouse[i - 1].timestamp);
    const dx = mouse[i].x - mouse[i - 1].x;
    const dy = mouse[i].y - mouse[i - 1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    velocities.push(dist / dt); // pixels per ms
  }

  if (velocities.length === 0) return 0.92;

  const maxVel = Math.max(...velocities);
  const avgVel = velocities.reduce((a, b) => a + b, 0) / velocities.length;

  // Inhuman teleportation or instant cursor snapping (> 15 px/ms without curvature)
  if (maxVel > 20) {
    return 0.25;
  }

  // Smooth, organic human movement
  return 0.94;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keys: KeyEventData[] = Array.isArray(body.keys) ? body.keys : [];
    const mouse: MouseEventData[] = Array.isArray(body.mouse) ? body.mouse : [];

    const keyConfidence = evaluateKeystrokeDynamics(keys);
    const mouseConfidence = evaluateMouseKinematics(mouse);

    // Multimodal Fusion: Weighted combination
    const pLegit = keyConfidence * 0.65 + mouseConfidence * 0.35;
    // Map legitimacy to Risk Score (0 = lowest risk, 100 = highest risk)
    const riskScore = Math.max(0, Math.min(100, Math.round((1 - pLegit) * 100)));

    // Optional: Synchronize real risk score to Supabase user profile in background
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from('user_profiles')
          .update({
            behavioral_risk_score: riskScore,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      }
    } catch (syncErr) {
      // Non-critical; do not block telemetry response
    }

    return NextResponse.json({
      success: true,
      risk_score: riskScore,
      modalities: {
        keystroke: Number(keyConfidence.toFixed(2)),
        mouse: Number(mouseConfidence.toFixed(2)),
      },
      evaluated_events: {
        keys: keys.length,
        mouse: mouse.length,
      },
    });
  } catch (error: any) {
    console.error('Error processing telemetry API:', error);
    return NextResponse.json({ success: false, error: 'Telemetry evaluation failed' }, { status: 400 });
  }
}
