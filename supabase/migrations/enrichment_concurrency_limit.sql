-- ============================================================================
-- Migration: Limit concurrent Edge Function workers for enrichment
-- ============================================================================
-- Modifies invoke_enrichment_edge_function to skip spawning a new worker
-- if MAX_CONCURRENT workers are already running (estimated via 'processing'
-- row count). Prevents external API rate limiting on large uploads.
--
-- Constants must stay in sync with the edge function:
--   MAX_CONCURRENT: max parallel EF chains allowed at once
--   BATCH_SIZE:     must match BATCH_SIZE in process-enrichment/index.ts (30)
-- ============================================================================

CREATE OR REPLACE FUNCTION invoke_enrichment_edge_function(source TEXT DEFAULT 'unknown')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url TEXT;
  _key TEXT;
  _processing INT;
  MAX_CONCURRENT CONSTANT INT := 5;
  BATCH_SIZE     CONSTANT INT := 30;
BEGIN
  -- Skip if enough workers are already running.
  -- Uses locked_at > now() - 5min to ignore stale rows (matches self-heal window
  -- in take_enrichment_batch), so stuck items don't permanently block new workers.
  SELECT count(*) INTO _processing
    FROM film_enrichment_queue
    WHERE status = 'processing'
      AND locked_at > now() - interval '5 minutes';

  IF _processing >= MAX_CONCURRENT * BATCH_SIZE THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets WHERE name = 'secret_key' LIMIT 1;

  IF _url IS NULL OR _key IS NULL THEN
    RAISE WARNING 'enrichment: vault secrets not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := _url || '/functions/v1/process-enrichment',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := jsonb_build_object('source', source)
  );
END;
$$;
