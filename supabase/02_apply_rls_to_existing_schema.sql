-- ====================================================================
-- NexusID: Supabase Zero Trust RLS Policies (For Existing Schema)
-- ====================================================================

-- 1. USER PROFILES
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" 
ON public.user_profiles FOR SELECT 
USING (auth.uid() = user_id);

-- 2. GOLDEN BASELINES
ALTER TABLE public.golden_baselines ENABLE ROW LEVEL SECURITY;

-- Users can read their own baseline to know calibration status
DROP POLICY IF EXISTS "Users can view own baseline" ON public.golden_baselines;
CREATE POLICY "Users can view own baseline" 
ON public.golden_baselines FOR SELECT 
USING (auth.uid() = user_id);

-- 3. FINANCIAL LEDGERS (ZERO TRUST ENFORCEMENT)
ALTER TABLE public.financial_ledgers ENABLE ROW LEVEL SECURITY;

-- Standard Policy: Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own ledgers" ON public.financial_ledgers;
CREATE POLICY "Users can view own ledgers" 
ON public.financial_ledgers FOR SELECT 
USING (auth.uid() = user_id);

-- 🔥 ZERO TRUST POLICY: Insert/Transfer is DENIED if Risk Score > 70 🔥
-- Looks for a custom claim 'risk_score' embedded in the JWT by the Next.js ML API.
DROP POLICY IF EXISTS "Enforce Zero Trust on Ledger Entries" ON public.financial_ledgers;
CREATE POLICY "Enforce Zero Trust on Ledger Entries" 
ON public.financial_ledgers FOR INSERT 
WITH CHECK (
    auth.uid() = user_id 
    AND 
    -- Read the risk_score from the JWT (defaulting to 100/Blocked if missing)
    COALESCE((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'risk_score')::int, 100) < 70
);

-- 4. SECURITY AUDIT LOGS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own security logs (e.g., to see if they were blocked)
DROP POLICY IF EXISTS "Users can view own security logs" ON public.security_audit_logs;
CREATE POLICY "Users can view own security logs" 
ON public.security_audit_logs FOR SELECT 
USING (auth.uid() = user_id);

-- Service Role (Next.js Edge API) will insert into audit logs, bypassing RLS.
