-- ============================================================================
-- Migration: Atomic concurrency limit for enrichment workers
-- ============================================================================
-- Replaces the racy concurrency check in invoke_enrichment_edge_function
-- (which could not prevent simultaneous trigger-spawned workers from all
-- passing the guard before any had locked rows) with an advisory lock
-- inside take_enrichment_batch itself.
--
-- How it works:
--   1. pg_advisory_xact_lock serializes all concurrent calls to this function
--      within the same transaction, so only one caller enters at a time.
--   2. Inside the lock, we count rows currently in 'processing' status.
--   3. If >= MAX_CONCURRENT * batch_size, we return an empty set — the caller
--      (Edge Function) sees an empty batch and exits gracefully.
--   4. Otherwise, we grab and lock the next batch as before.
--
-- The advisory lock is transaction-scoped (released at COMMIT), so it's held
-- only for the brief duration of this function call (~milliseconds).
-- ============================================================================

CREATE OR REPLACE FUNCTION take_enrichment_batch(batch_size INT)
RETURNS SETOF film_enrichment_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _processing INT;
  MAX_CONCURRENT CONSTANT INT := 5;
BEGIN
  -- Serialize concurrent callers so the concurrency check + row locking
  -- is atomic. Without this, N simultaneous edge functions all see 0
  -- processing rows and all proceed.
  PERFORM pg_advisory_xact_lock(hashtext('enrichment_batch'));

  -- Self-heal: reset items stuck in 'processing' for > 5 minutes
  UPDATE film_enrichment_queue
  SET status = 'pending', locked_at = NULL
  WHERE status = 'processing'
    AND locked_at < now() - interval '5 minutes';

  -- Concurrency check: if enough workers are already active, return empty.
  -- Uses locked_at > now() - 5min to ignore stale rows (matches self-heal above).
  SELECT count(*) INTO _processing
    FROM film_enrichment_queue
    WHERE status = 'processing'
      AND locked_at > now() - interval '5 minutes';

  IF _processing >= MAX_CONCURRENT * batch_size THEN
    RETURN;  -- empty set → EF exits gracefully
  END IF;

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
