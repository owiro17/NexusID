-- ====================================================================
-- NexusID: Supabase Schema & Zero Trust RLS Policies
-- ====================================================================

-- 1. USER PROFILES
-- Stores application-level user data, linked to Supabase Auth.
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'employee')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" 
ON public.user_profiles FOR SELECT 
USING (auth.uid() = id);

-- 2. TELEMETRY BASELINES ("Golden Vector")
-- Stores the trusted baseline features gathered directly after Passkey/MFA login.
CREATE TABLE public.telemetry_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    keystroke_vector JSONB, -- Array of statistical means/stds
    mouse_vector JSONB,     -- Array of kinematics
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.telemetry_baselines ENABLE ROW LEVEL SECURITY;

-- API (using Service Role) manages baselines, but users can read their active baseline
CREATE POLICY "Users can view their active baseline" 
ON public.telemetry_baselines FOR SELECT 
USING (auth.uid() = user_id AND is_active = true);


-- ====================================================================
-- ZERO TRUST ENFORCEMENT EXAMPLE (Financial Transfers)
-- ====================================================================

-- Create a mock transfers table for the dashboard
CREATE TABLE public.financial_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    destination_account TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;

-- Standard Policy: Users can view their own transfers
CREATE POLICY "Users can view own transfers" 
ON public.financial_transfers FOR SELECT 
USING (auth.uid() = user_id);

-- 🔥 ZERO TRUST POLICY: Insert/Transfer is DENIED if Risk Score > 70 🔥
-- This looks for a custom claim 'risk_score' embedded in the JWT by our Next.js API.
CREATE POLICY "Enforce Zero Trust on Transfers" 
ON public.financial_transfers FOR INSERT 
WITH CHECK (
    auth.uid() = user_id 
    AND 
    -- Read the risk_score from the JWT (defaulting to 100/Blocked if missing)
    COALESCE((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'risk_score')::int, 100) < 70
);
