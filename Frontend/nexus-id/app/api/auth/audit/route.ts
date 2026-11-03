import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import type { AuditApiPayload, SecurityEventType } from '@/types/auth';

const VALID_EVENT_TYPES: SecurityEventType[] = [
  'PASSKEY_LOGIN_SUCCESS',
  'PASSKEY_REGISTERED',
  'PASSKEY_REVOKED',
  'PASSKEY_RENAMED',
  'MAGIC_LINK_REQUESTED',
  'MAGIC_LINK_RECOVERY',
  'STEP_UP_VERIFIED',
  'STEP_UP_FAILED',
  'AUTH_CALLBACK_SUCCESS',
];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid user session required' },
        { status: 401 }
      );
    }

    const body: AuditApiPayload & { sessionId?: string } = await request.json();

    if (!body.eventType || !VALID_EVENT_TYPES.includes(body.eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType: '${body.eventType}'` },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const riskScore = body.recordedRiskScore !== undefined ? body.recordedRiskScore : 0;

    const dayBucket = new Date().toISOString().slice(0, 10);
    const deterministicSessionId =
      body.sessionId ||
      (body.metadata?.session_id as string) ||
      `sess_${crypto
        .createHash('sha256')
        .update(`${user.id}:${clientIp}:${dayBucket}`)
        .digest('hex')
        .slice(0, 12)}`;

    // 1. Insert audit record with guaranteed non-empty session_id and bound IP metadata
    const { data: logEntry, error: logError } = await supabase
      .from('security_audit_logs')
      .insert({
        user_id: user.id,
        event_type: body.eventType,
        recorded_risk_score: riskScore,
        ip_address: clientIp,
        user_agent: userAgent,
        metadata: {
          ...(body.metadata || {}),
          session_id: deterministicSessionId,
          bound_ip: clientIp,
        },
      })
      .select('id, created_at')
      .single();

    if (logError) {
      console.error('[Audit API] Insert error:', logError);
      return NextResponse.json({ error: 'Failed to record audit log' }, { status: 500 });
    }

    // 2. Cryptographic verification resets baseline risk score to 0
    if (
      body.eventType === 'STEP_UP_VERIFIED' ||
      body.eventType === 'PASSKEY_LOGIN_SUCCESS' ||
      body.eventType === 'PASSKEY_REGISTERED'
    ) {
      await supabase
        .from('user_profiles')
        .update({
          behavioral_risk_score: 0,
          hardware_enrolled: true,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .or(`user_id.eq.${user.id},id.eq.${user.id}`);
    }

    return NextResponse.json({
      success: true,
      sessionId: deterministicSessionId,
      clientIp,
      logId: logEntry?.id,
      timestamp: logEntry?.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
