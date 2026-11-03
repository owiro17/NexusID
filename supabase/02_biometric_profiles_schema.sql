-- NexusID: Biometric Profiles Table (Supabase extension)
-- Add this to supabase/migrations/ or run in Supabase SQL Editor
-- Extends the existing nexus_zero_trust_schema.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- biometric_profiles: Stores per-user LightGBM / Mahalanobis profiles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_profiles (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT        NOT NULL UNIQUE,           -- operator ID
    enrolled_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    n_sessions      INTEGER     NOT NULL DEFAULT 0,
    n_features      INTEGER     NOT NULL DEFAULT 31,
    feature_names   JSONB       DEFAULT '[]'::jsonb,       -- ["H.period", ...]
    
    -- Mahalanobis profile
    mu              JSONB       NOT NULL,                  -- centroid vector
    cov_inv         JSONB       NOT NULL,                  -- inverse covariance (flattened)
    threshold       FLOAT8      NOT NULL DEFAULT 0.5,      -- FAR-calibrated threshold
    intra_mean      FLOAT8,
    intra_std       FLOAT8,
    
    -- Model metadata
    model_type      TEXT        DEFAULT 'mahalanobis',     -- "mahalanobis" | "lgbm_ovr"
    model_version   TEXT        DEFAULT '2.0.0',
    eer_pct         FLOAT8,                                -- measured EER at enrollment
    far_pct         FLOAT8,                                -- measured FAR at enrollment
    frr_pct         FLOAT8,                                -- measured FRR at enrollment
    
    -- Enrollment source
    enrolled_by     UUID        REFERENCES auth.users(id),
    enrollment_device TEXT,                                -- device fingerprint
    
    CONSTRAINT min_sessions CHECK (n_sessions >= 20),
    CONSTRAINT valid_threshold CHECK (threshold > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- biometric_events: Real-time verification event log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_events (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         TEXT        NOT NULL,
    session_id      TEXT,
    event_type      TEXT        NOT NULL,   -- 'accept' | 'reject' | 'alert' | 'enroll'
    score           FLOAT8,                 -- Mahalanobis distance
    threshold       FLOAT8,
    consecutive_flags INTEGER   DEFAULT 0,
    latency_ms      FLOAT8,
    is_anomaly      BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metadata        JSONB       DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_biometric_profiles_user_id ON public.biometric_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_events_user_id   ON public.biometric_events(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_events_session   ON public.biometric_events(session_id);
CREATE INDEX IF NOT EXISTS idx_biometric_events_created   ON public.biometric_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_events_type      ON public.biometric_events(event_type)
    WHERE event_type IN ('alert', 'reject');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_biometric_profiles_updated_at
    BEFORE UPDATE ON public.biometric_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (RLS) — fail-closed
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.biometric_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_events   ENABLE ROW LEVEL SECURITY;

-- Only the service role (backend API) can read/write profiles
-- Individual users CANNOT read other users' profiles
CREATE POLICY "service_role_all_profiles"
    ON public.biometric_profiles
    FOR ALL
    USING (auth.role() = 'service_role');

-- Users can only read their OWN profile (for enrollment status check)
CREATE POLICY "user_read_own_profile"
    ON public.biometric_profiles
    FOR SELECT
    USING (auth.uid()::TEXT = user_id);

-- Events: service role writes, users read own events
CREATE POLICY "service_role_all_events"
    ON public.biometric_events
    FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "user_read_own_events"
    ON public.biometric_events
    FOR SELECT
    USING (auth.uid()::TEXT = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpful views
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.biometric_risk_summary AS
SELECT
    be.user_id,
    COUNT(*) FILTER (WHERE event_type = 'alert')  AS total_alerts,
    COUNT(*) FILTER (WHERE event_type = 'reject') AS total_rejects,
    COUNT(*) FILTER (WHERE event_type = 'accept') AS total_accepts,
    ROUND(
        COUNT(*) FILTER (WHERE event_type IN ('alert','reject'))::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 2
    ) AS reject_rate_pct,
    MAX(created_at) FILTER (WHERE event_type = 'alert') AS last_alert_at,
    MAX(created_at) AS last_seen_at
FROM public.biometric_events be
GROUP BY be.user_id;

COMMENT ON TABLE public.biometric_profiles IS 
    'Per-user LightGBM OvR / Mahalanobis biometric profiles for NexusID operator verification. EER=2.40%, FAR=0.33%, TTD=15s.';

COMMENT ON TABLE public.biometric_events IS 
    'Real-time keystroke biometric verification event log. Used for FAR/FRR monitoring and audit trail.';
