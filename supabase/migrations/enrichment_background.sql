-- ============================================================================
-- One-time setup: Background enrichment via Edge Function + pg_cron + pg_net
-- ============================================================================
-- Run this AFTER applying schema.sql, and AFTER enabling pg_net and pg_cron
-- in the Supabase dashboard (Database → Extensions).
--
-- Replace the two placeholders below with your actual values
-- (Supabase Dashboard → Project Settings → API):
--   YOUR_SUPABASE_URL  e.g. https://xxxx.supabase.co
--   YOUR_SECRET_KEY    labeled "Secret key", format: sb_secret_...
-- ============================================================================

-- 1. Grant pg_cron access to postgres role (needed on some Supabase setups)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 2. Store secrets in Supabase Vault for pg_net to use
SELECT vault.create_secret(
  'YOUR_SUPABASE_URL',
  'supabase_url',
  'Supabase project URL for Edge Function invocation'
);

SELECT vault.create_secret(
  'YOUR_SECRET_KEY',
  'secret_key',
  'Supabase secret key for Edge Function auth'
);

-- 3. Schedule the cron job (runs every 3 minutes as a safety net)
SELECT cron.unschedule('process-enrichment-queue')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-enrichment-queue'
  );

SELECT cron.schedule(
  'process-enrichment-queue',
  '*/3 * * * *',
  $$SELECT cron_process_enrichment()$$
);
