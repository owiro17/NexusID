-- NexusID Migration 03: Continual Deep Autoencoder + RL State + Non-Empty Session IDs + IP Binding
-- Run in Supabase SQL Editor to ensure all columns and indexes exist for Continual Learning & Challenges

-- 1. Ensure `biometric_events` has a default non-empty `session_id` and `ip_address` tracking
ALTER TABLE IF EXISTS public.biometric_events
    ALTER COLUMN session_id SET DEFAULT 'sess_auto_bound',
    ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT '127.0.0.1',
    ADD COLUMN IF NOT EXISTS bound_ip TEXT DEFAULT '127.0.0.1',
    ADD COLUMN IF NOT EXISTS ip_drift_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reconstruction_error FLOAT8 DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS rl_epochs INTEGER DEFAULT 1;

-- Backfill any historical rows where session_id was NULL or empty
UPDATE public.biometric_events
SET session_id = 'sess_' || SUBSTRING(MD5(user_id || created_at::TEXT) FROM 1 FOR 12)
WHERE session_id IS NULL OR session_id = '';

-- 2. Ensure `telemetry_baselines` supports Continual Autoencoder + Contextual Bandit RL JSON state
ALTER TABLE IF EXISTS public.telemetry_baselines
    ADD COLUMN IF NOT EXISTS bound_ip_address TEXT DEFAULT '127.0.0.1',
    ADD COLUMN IF NOT EXISTS last_session_id TEXT DEFAULT 'sess_active',
    ADD COLUMN IF NOT EXISTS rl_telemetry_points INTEGER DEFAULT 100,
    ADD COLUMN IF NOT EXISTS rl_adaptive_multiplier FLOAT8 DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS autoencoder_epochs INTEGER DEFAULT 1;
