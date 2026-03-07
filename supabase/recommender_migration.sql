-- ============================================================================
-- Migration: Add recommender system tables & columns
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER the base schema and user_preferences.
-- ============================================================================

-- 1. Film enrichment queue for background processing of unknown films
CREATE TABLE IF NOT EXISTS film_enrichment_queue (
  id                    BIGSERIAL PRIMARY KEY,
  letterboxd_short_url  TEXT NOT NULL UNIQUE,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  requested_by          UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  processed_at          TIMESTAMPTZ
);

-- Index for quick batch fetching of pending items
CREATE INDEX IF NOT EXISTS idx_enrichment_status ON film_enrichment_queue(status);

-- RLS: anyone authenticated can insert, service role processes
ALTER TABLE film_enrichment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert queue items"
  ON film_enrichment_queue FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read queue"
  ON film_enrichment_queue FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage queue"
  ON film_enrichment_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can update queue items (for the enrich-batch route)
CREATE POLICY "Authenticated users can update queue"
  ON film_enrichment_queue FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 2. Add watched_ratings column to user_preferences
-- Stores user's own Letterboxd ratings: { "https://boxd.it/abc": 4.5, ... }
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS
  watched_ratings JSONB DEFAULT '{}';

-- 3. Add unique constraint on films.letterboxd_short_url for upsert support
-- Must be a real CONSTRAINT (not a partial index) for ON CONFLICT to work.
ALTER TABLE films ADD CONSTRAINT films_letterboxd_short_url_unique
  UNIQUE (letterboxd_short_url);

-- 4. Authenticated write access to films table (for enrichment from API routes)
CREATE POLICY "Authenticated users can insert films"
  ON films FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update films"
  ON films FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- 5. Add locked_at column for stale-detection (self-healing queue)
ALTER TABLE film_enrichment_queue
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 6. RPC for concurrent-safe, self-healing batch fetching.
-- Step 1: Reset items stuck in 'processing' for > 5 minutes (Vercel timeout / browser close).
-- Step 2: Grab the next batch with FOR UPDATE SKIP LOCKED so concurrent callers
--         never pick up the same rows.
CREATE OR REPLACE FUNCTION take_enrichment_batch(batch_size INT)
RETURNS SETOF film_enrichment_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Self-heal: reset stale items that have been processing for > 5 minutes
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
