-- ============================================================================
-- Migration: Background enrichment via Edge Function + pg_cron + pg_net
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER recommender_migration.sql.
--
-- BEFORE RUNNING: Replace the two placeholders below with your actual values
-- (found in Supabase Dashboard → Project Settings → API):
--   1. YOUR_SUPABASE_URL  (e.g. https://xxxx.supabase.co)
--   2. YOUR_SECRET_KEY    (labeled "Secret key" in the dashboard, format: sb_secret_...)
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net    SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron   SCHEMA extensions;

-- Grant pg_cron usage to postgres role (needed on some Supabase setups)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- 2. Add retry tracking columns to the enrichment queue
ALTER TABLE film_enrichment_queue
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- 3. Update take_enrichment_batch to skip items that exhausted retries
CREATE OR REPLACE FUNCTION take_enrichment_batch(batch_size INT)
RETURNS SETOF film_enrichment_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Self-heal: reset items stuck in 'processing' for > 5 minutes
  UPDATE film_enrichment_queue
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes';

  -- Atomically grab and lock the next batch
  RETURN QUERY
  WITH next_batch AS (
    SELECT id
    FROM film_enrichment_queue
    WHERE status = 'pending'
      AND retry_count < 5
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  )
  UPDATE film_enrichment_queue q
  SET status = 'processing', locked_at = now()
  FROM next_batch
  WHERE q.id = next_batch.id
  RETURNING q.*;
END;
$$;

-- 4. Store secrets in Supabase Vault for pg_net to use
--    Replace the placeholder values before running!
SELECT vault.create_secret(
  'YOUR_SUPABASE_URL',
  'supabase_url',
  'Supabase project URL for Edge Function invocation'
);

SELECT vault.create_secret(
  'YOUR_SECRET_KEY',
  'secret_key',
  'Supabase secret key for Edge Function auth (Dashboard → Project Settings → API → Secret key)'
);

-- 5. Function to invoke the Edge Function via pg_net
CREATE OR REPLACE FUNCTION invoke_enrichment_edge_function(source TEXT DEFAULT 'unknown')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url TEXT;
  _key TEXT;
BEGIN
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1;

  IF _url IS NULL OR _key IS NULL THEN
    RAISE WARNING 'enrichment: vault secrets not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url    := _url || '/functions/v1/process-enrichment',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body   := jsonb_build_object('source', source)
  );
END;
$$;

-- 6. Trigger: invoke Edge Function when new items are inserted into the queue
--    Uses FOR EACH STATEMENT so it fires once per INSERT batch, not per row.
CREATE OR REPLACE FUNCTION trigger_enrichment_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM invoke_enrichment_edge_function('trigger');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_enrichment_queue_insert ON film_enrichment_queue;
CREATE TRIGGER on_enrichment_queue_insert
  AFTER INSERT ON film_enrichment_queue
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_enrichment_on_insert();

-- 7. pg_cron: safety net that runs every 3 minutes
--    Only invokes the Edge Function if there are pending items.
CREATE OR REPLACE FUNCTION cron_process_enrichment()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _pending INT;
BEGIN
  SELECT count(*) INTO _pending
    FROM film_enrichment_queue
    WHERE status IN ('pending', 'processing');

  IF _pending = 0 THEN
    RETURN;
  END IF;

  PERFORM invoke_enrichment_edge_function('cron');
END;
$$;

-- Schedule the cron job (remove existing if re-running)
SELECT cron.unschedule('process-enrichment-queue')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-enrichment-queue'
  );

SELECT cron.schedule(
  'process-enrichment-queue',
  '*/3 * * * *',
  $$SELECT cron_process_enrichment()$$
);
