import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  evaluateTelemetry,
  KeyEventData,
  MouseEventData,
} from '@/lib/ml/onnxEngine';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const keys: KeyEventData[] = Array.isArray(body.keys) ? body.keys : [];
    const mouse: MouseEventData[] = Array.isArray(body.mouse) ? body.mouse : [];

    // Run ML Model Inference via ONNX Runtime Engine
    const inferenceResult = await evaluateTelemetry(keys, mouse);
    const riskScore = inferenceResult.risk_score;

    // Synchronize risk score to Supabase user profile in background
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
      model_inference: inferenceResult,
      evaluated_events: {
        keys: keys.length,
        mouse: mouse.length,
      },
    });
  } catch (error: any) {
    console.error('Error processing telemetry API with ML model:', error);
    return NextResponse.json(
      { success: false, error: 'Telemetry evaluation failed' },
      { status: 400 }
    );
  }
}
