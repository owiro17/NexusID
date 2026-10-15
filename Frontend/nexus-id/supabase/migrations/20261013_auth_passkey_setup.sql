-- =============================================================================
-- NexusID: Auth & Passkey Infrastructure Migration (Schema-Aware & Idempotent)
-- Migration: 20261013_auth_passkey_setup.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Upgrade or Create public.user_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'standard',
    behavioral_risk_score INTEGER NOT NULL DEFAULT 0,
    hardware_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all required columns exist on user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS behavioral_risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS hardware_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_risk ON public.user_profiles(behavioral_risk_score);

-- -----------------------------------------------------------------------------
-- 2. Upgrade or Create public.security_audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    session_id VARCHAR,
    recorded_risk_score INTEGER NOT NULL DEFAULT 0,
    rls_action_taken VARCHAR DEFAULT 'PERMITTED',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add all required passkey telemetry & audit columns if they don't already exist
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.security_audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Ensure existing columns have flexible defaults
ALTER TABLE public.security_audit_logs ALTER COLUMN rls_action_taken DROP NOT NULL;
ALTER TABLE public.security_audit_logs ALTER COLUMN rls_action_taken SET DEFAULT 'PERMITTED';
ALTER TABLE public.security_audit_logs ALTER COLUMN recorded_risk_score SET DEFAULT 0;

-- Event type validation check constraint
ALTER TABLE public.security_audit_logs DROP CONSTRAINT IF EXISTS security_audit_logs_event_type_check;
ALTER TABLE public.security_audit_logs ADD CONSTRAINT security_audit_logs_event_type_check 
  CHECK (event_type IS NULL OR event_type IN (
    'PASSKEY_LOGIN_SUCCESS',
    'PASSKEY_REGISTERED',
    'PASSKEY_REVOKED',
    'PASSKEY_RENAMED',
    'MAGIC_LINK_REQUESTED',
    'MAGIC_LINK_RECOVERY',
    'STEP_UP_VERIFIED',
    'STEP_UP_FAILED',
    'AUTH_CALLBACK_SUCCESS'
  ));

-- Indices for security_audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.security_audit_logs("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.security_audit_logs(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- security_audit_logs policies
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.security_audit_logs;
CREATE POLICY "Users can view own audit logs"
    ON public.security_audit_logs
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.security_audit_logs;
CREATE POLICY "Users can insert own audit logs"
    ON public.security_audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- 4. Automated User Profile Provisioning Trigger (SECURITY DEFINER)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (
        user_id,
        email,
        account_type,
        behavioral_risk_score,
        hardware_enrolled,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'account_type', 'Human'),
        0,
        FALSE,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Backfill Existing auth.users into public.user_profiles
-- -----------------------------------------------------------------------------
INSERT INTO public.user_profiles (user_id, email, account_type, behavioral_risk_score, hardware_enrolled, created_at, updated_at)
SELECT id, COALESCE(email, ''), 'Human', 0, FALSE, NOW(), NOW()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Role Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.security_audit_logs TO service_role;
