export type SecurityEventType =
  | 'PASSKEY_LOGIN_SUCCESS'
  | 'PASSKEY_REGISTERED'
  | 'PASSKEY_REVOKED'
  | 'PASSKEY_RENAMED'
  | 'MAGIC_LINK_REQUESTED'
  | 'MAGIC_LINK_RECOVERY'
  | 'STEP_UP_VERIFIED'
  | 'STEP_UP_FAILED'
  | 'AUTH_CALLBACK_SUCCESS';

export interface PasskeyCredential {
  id: string;
  friendly_name?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export interface UserProfile {
  user_id: string;
  email: string;
  account_type?: string | null;
  behavioral_risk_score: number;
  hardware_enrolled: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialLedger {
  transaction_id: string;
  user_id: string;
  transaction_amount: number;
  target_account: string;
  status: string;
  created_at: string;
}

export interface SecurityAuditLog {
  id: string;
  user_id: string;
  event_type: SecurityEventType;
  recorded_risk_score: number;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditApiPayload {
  eventType: SecurityEventType;
  metadata?: Record<string, unknown>;
  recordedRiskScore?: number;
}
