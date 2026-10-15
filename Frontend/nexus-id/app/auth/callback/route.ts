import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

function sanitizeRedirect(target: string | null): string {
  if (!target) return '/dashboard';
  const trimmed = target.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return '/dashboard';
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const rawNext = requestUrl.searchParams.get('next');
  const next = sanitizeRedirect(rawNext);

  const supabase = await createClient();

  try {
    let sessionEstablished = false;

    // 1. PKCE Code Exchange
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('[Auth Callback] Code exchange error:', error.message);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
        );
      }
      sessionEstablished = true;
    }
    // 2. Token Hash / Magic Link OTP verification fallback
    else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        console.error('[Auth Callback] Verify OTP error:', error.message);
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
        );
      }
      sessionEstablished = true;
    }

    if (!sessionEstablished) {
      return NextResponse.redirect(
        new URL('/login?error=Invalid+or+expired+authentication+link', request.url)
      );
    }

    // 3. Confirm active authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL('/login?error=User+session+not+found', request.url));
    }

    // 4. Passkey Count Inspection
    // If the user has 0 passkeys (new account or lost device recovery), route to passkey enrollment
    let passkeysCount = 0;
    try {
      const passkeyApi = (supabase.auth as any).passkey;
      if (passkeyApi && typeof passkeyApi.list === 'function') {
        const { data: passkeys } = await passkeyApi.list();
        if (Array.isArray(passkeys)) {
          passkeysCount = passkeys.length;
        }
      }
    } catch (err) {
      console.warn('[Auth Callback] Passkey check fallback:', err);
    }

    // 5. Ensure profile exists so foreign key constraints on audit logs succeed
    if (user.email) {
      await supabase.from('user_profiles').upsert(
        {
          user_id: user.id,
          email: user.email,
          account_type: 'Standard User',
          behavioral_risk_score: 0,
          hardware_enrolled: passkeysCount > 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    }

    // 6. Audit Callback Event
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    await supabase.from('security_audit_logs').insert({
      user_id: user.id,
      event_type: 'AUTH_CALLBACK_SUCCESS',
      recorded_risk_score: 0,
      ip_address: clientIp,
      user_agent: userAgent,
      metadata: {
        method: code ? 'pkce_code' : 'token_hash',
        passkeys_enrolled: passkeysCount,
        routed_to_enrollment: passkeysCount === 0,
      },
    });

    if (passkeysCount === 0) {
      return NextResponse.redirect(new URL('/auth/enroll-passkey', request.url));
    }

    return NextResponse.redirect(new URL(next, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown authentication error';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
