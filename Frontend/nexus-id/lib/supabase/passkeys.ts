import { SupabaseClient } from '@supabase/supabase-js';

// Base64URL helper utilities for WebAuthn Level 3 conversions
export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof window !== 'undefined' ? window.btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deserializeRequestOptions(options: any): PublicKeyCredentialRequestOptions {
  if (
    typeof PublicKeyCredential !== 'undefined' &&
    'parseRequestOptionsFromJSON' in PublicKeyCredential &&
    typeof (PublicKeyCredential as any).parseRequestOptionsFromJSON === 'function'
  ) {
    return (PublicKeyCredential as any).parseRequestOptionsFromJSON(options);
  }

  const result: any = {
    challenge: typeof options.challenge === 'string' ? base64UrlToBuffer(options.challenge) : options.challenge,
    timeout: options.timeout,
    rpId: options.rpId,
    userVerification: options.userVerification || 'preferred',
  };

  if (options.allowCredentials && Array.isArray(options.allowCredentials)) {
    result.allowCredentials = options.allowCredentials.map((cred: any) => ({
      type: cred.type || 'public-key',
      id: typeof cred.id === 'string' ? base64UrlToBuffer(cred.id) : cred.id,
      transports: cred.transports,
    }));
  }

  return result;
}

export function serializeAssertion(credential: any): any {
  if ('toJSON' in credential && typeof credential.toJSON === 'function') {
    return credential.toJSON();
  }

  const rawResponse = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: credential.id,
    type: credential.type || 'public-key',
    response: {
      authenticatorData: bufferToBase64Url(rawResponse.authenticatorData),
      clientDataJSON: bufferToBase64Url(rawResponse.clientDataJSON),
      signature: bufferToBase64Url(rawResponse.signature),
      userHandle: rawResponse.userHandle ? bufferToBase64Url(rawResponse.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
  };
}

export function deserializeCreationOptions(options: any): PublicKeyCredentialCreationOptions {
  if (
    typeof PublicKeyCredential !== 'undefined' &&
    'parseCreationOptionsFromJSON' in PublicKeyCredential &&
    typeof (PublicKeyCredential as any).parseCreationOptionsFromJSON === 'function'
  ) {
    return (PublicKeyCredential as any).parseCreationOptionsFromJSON(options);
  }

  const result: any = {
    challenge: typeof options.challenge === 'string' ? base64UrlToBuffer(options.challenge) : options.challenge,
    rp: options.rp,
    user: {
      ...options.user,
      id: typeof options.user.id === 'string' ? base64UrlToBuffer(options.user.id) : options.user.id,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation,
    authenticatorSelection: options.authenticatorSelection,
  };

  if (options.excludeCredentials && Array.isArray(options.excludeCredentials)) {
    result.excludeCredentials = options.excludeCredentials.map((cred: any) => ({
      type: cred.type || 'public-key',
      id: typeof cred.id === 'string' ? base64UrlToBuffer(cred.id) : cred.id,
      transports: cred.transports,
    }));
  }

  return result;
}

export function serializeAttestation(credential: any): any {
  if ('toJSON' in credential && typeof credential.toJSON === 'function') {
    return credential.toJSON();
  }

  const rawResponse = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: credential.id,
    type: credential.type || 'public-key',
    response: {
      attestationObject: bufferToBase64Url(rawResponse.attestationObject),
      clientDataJSON: bufferToBase64Url(rawResponse.clientDataJSON),
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    authenticatorAttachment: credential.authenticatorAttachment || undefined,
  };
}

/**
 * Perform discoverable WebAuthn login (Passkey-First)
 * Safely tries:
 * 1. Native supabase.auth.signInWithPasskey()
 * 2. Two-step supabase.auth.passkey API
 * 3. Direct Supabase Auth REST ceremony with session sync
 */
export async function signInWithPasskey(supabase: SupabaseClient): Promise<{
  data: { session: any; user: any } | null;
  error: any;
}> {
  // 1. Try SDK's high-level signInWithPasskey if present
  if (typeof (supabase.auth as any).signInWithPasskey === 'function') {
    try {
      const res = await (supabase.auth as any).signInWithPasskey();
      if (res && (res.data || res.error)) {
        return res;
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError' || e?.message?.includes('not allowed')) {
        return { data: null, error: e };
      }
      console.warn('SDK signInWithPasskey failed, falling back to WebAuthn ceremony:', e);
    }
  }

  // 2. Try SDK's two-step auth.passkey if available
  const passkeyApi = (supabase.auth as any).passkey;
  if (passkeyApi && typeof passkeyApi.startAuthentication === 'function' && typeof passkeyApi.verifyAuthentication === 'function') {
    try {
      const { data: optionsData, error: optErr } = await passkeyApi.startAuthentication();
      if (optErr || !optionsData) {
        return { data: null, error: optErr || new Error('Failed to obtain passkey challenge') };
      }
      const publicKey = deserializeRequestOptions(optionsData.options || optionsData);
      const credential = await navigator.credentials.get({ publicKey });
      if (!credential) {
        return { data: null, error: new Error('Biometric ceremony did not return credentials') };
      }
      const serialized = serializeAssertion(credential);
      const verifyRes = await passkeyApi.verifyAuthentication({
        challengeId: optionsData.challenge_id,
        credential: serialized,
      });
      return verifyRes;
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
        return { data: null, error: e };
      }
      console.warn('SDK passkey.startAuthentication failed, falling back to direct endpoint:', e);
    }
  }

  // 3. Direct Supabase WebAuthn HTTP ceremony (Universal Fallback)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const optResponse = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/options`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!optResponse.ok) {
      const errJson = await optResponse.json().catch(() => ({}));
      return { data: null, error: new Error(errJson.msg || errJson.error_description || 'Passkey options failed') };
    }

    const optData = await optResponse.json();
    const challengeId = optData.challenge_id;
    const publicKey = deserializeRequestOptions(optData.options);

    const credential = await navigator.credentials.get({ publicKey });
    if (!credential) {
      return { data: null, error: new Error('Biometric verification cancelled') };
    }

    const serialized = serializeAssertion(credential);

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/passkeys/authentication/verify`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        challenge_id: challengeId,
        credential: serialized,
      }),
    });

    if (!verifyResponse.ok) {
      const errJson = await verifyResponse.json().catch(() => ({}));
      return { data: null, error: new Error(errJson.msg || errJson.error_description || 'Passkey verification failed') };
    }

    const sessionData = await verifyResponse.json();

    if (sessionData.access_token && sessionData.refresh_token) {
      const { data: setSessionData, error: setSessionErr } = await supabase.auth.setSession({
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
      });
      if (setSessionErr) {
        return { data: null, error: setSessionErr };
      }
      return { data: setSessionData, error: null };
    }

    return { data: { session: sessionData, user: sessionData.user }, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Register a new passkey for the current authenticated user
 */
export async function registerPasskey(
  supabase: SupabaseClient,
  options?: { friendlyName?: string }
): Promise<{
  data: { id: string; friendly_name?: string; created_at?: string } | null;
  error: any;
}> {
  // 1. Try SDK's high-level registerPasskey
  if (typeof (supabase.auth as any).registerPasskey === 'function') {
    try {
      const res = await (supabase.auth as any).registerPasskey();
      if (res && (res.data || res.error)) {
        return res;
      }
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
        return { data: null, error: e };
      }
      console.warn('SDK registerPasskey failed, falling back to WebAuthn ceremony:', e);
    }
  }

  // 2. Try SDK's two-step auth.passkey
  const passkeyApi = (supabase.auth as any).passkey;
  if (passkeyApi && typeof passkeyApi.startRegistration === 'function' && typeof passkeyApi.verifyRegistration === 'function') {
    try {
      const { data: optionsData, error: optErr } = await passkeyApi.startRegistration();
      if (optErr || !optionsData) {
        return { data: null, error: optErr || new Error('Failed to obtain passkey registration challenge') };
      }
      const publicKey = deserializeCreationOptions(optionsData.options || optionsData);
      const credential = await navigator.credentials.create({ publicKey });
      if (!credential) {
        return { data: null, error: new Error('Biometric ceremony did not return credential') };
      }
      const serialized = serializeAttestation(credential);
      const verifyRes = await passkeyApi.verifyRegistration({
        challengeId: optionsData.challenge_id,
        credential: serialized,
      });
      return verifyRes;
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
        return { data: null, error: e };
      }
      console.warn('SDK passkey.startRegistration failed, falling back to direct endpoint:', e);
    }
  }

  // 3. Direct Supabase WebAuthn HTTP registration
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { data: null, error: new Error('User must be signed in to register a passkey') };
    }

    const optResponse = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/options`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!optResponse.ok) {
      const errJson = await optResponse.json().catch(() => ({}));
      return { data: null, error: new Error(errJson.msg || errJson.error_description || 'Registration options failed') };
    }

    const optData = await optResponse.json();
    const challengeId = optData.challenge_id;
    const publicKey = deserializeCreationOptions(optData.options);

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) {
      return { data: null, error: new Error('Biometric registration cancelled') };
    }

    const serialized = serializeAttestation(credential);

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/passkeys/registration/verify`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        challenge_id: challengeId,
        credential: serialized,
      }),
    });

    if (!verifyResponse.ok) {
      const errJson = await verifyResponse.json().catch(() => ({}));
      return { data: null, error: new Error(errJson.msg || errJson.error_description || 'Passkey registration verification failed') };
    }

    const passkeyData = await verifyResponse.json();
    return { data: passkeyData, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * List all passkeys enrolled for the current authenticated user
 */
export async function listPasskeys(supabase: SupabaseClient): Promise<{
  data: Array<{ id: string; friendly_name?: string; created_at: string; last_used_at?: string }> | null;
  error: any;
}> {
  const passkeyApi = (supabase.auth as any).passkey;
  if (passkeyApi && typeof passkeyApi.list === 'function') {
    try {
      const res = await passkeyApi.list();
      if (res && (res.data || res.error)) {
        return res;
      }
    } catch (e) {
      console.warn('passkey.list failed, falling back:', e);
    }
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { data: [], error: null };
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/passkeys`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { data: null, error: new Error(errJson.msg || errJson.error_description || 'Failed to list passkeys') };
    }

    const list = await res.json();
    return { data: Array.isArray(list) ? list : [], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

/**
 * Delete a passkey by ID
 */
export async function deletePasskey(supabase: SupabaseClient, passkeyId: string): Promise<{ error: any }> {
  const passkeyApi = (supabase.auth as any).passkey;
  if (passkeyApi && typeof passkeyApi.delete === 'function') {
    try {
      const res = await passkeyApi.delete({ passkeyId });
      if (res) return res;
    } catch (e) {
      console.warn('passkey.delete failed, falling back:', e);
    }
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { error: new Error('User not authenticated') };
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/${passkeyId}`, {
      method: 'DELETE',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { error: new Error(errJson.msg || errJson.error_description || 'Failed to delete passkey') };
    }

    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * Update a passkey's friendly name
 */
export async function updatePasskey(
  supabase: SupabaseClient,
  passkeyId: string,
  friendlyName: string
): Promise<{ error: any }> {
  const passkeyApi = (supabase.auth as any).passkey;
  if (passkeyApi && typeof passkeyApi.update === 'function') {
    try {
      const res = await passkeyApi.update({ passkeyId, friendlyName });
      if (res) return res;
    } catch (e) {
      console.warn('passkey.update failed, falling back:', e);
    }
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { error: new Error('User not authenticated') };
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/passkeys/${passkeyId}`, {
      method: 'PATCH',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ friendly_name: friendlyName }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { error: new Error(errJson.msg || errJson.error_description || 'Failed to update passkey') };
    }

    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}
