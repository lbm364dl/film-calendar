-- ============================================================================
-- Migration: TMDB URL override for enrichment queue
-- ============================================================================
-- Allows manually correcting the TMDB URL for a failed enrichment entry
-- without re-inserting it. Use retry_enrichment_with_tmdb_url() from the
-- Supabase SQL Editor to fix and re-queue in one call.
-- ============================================================================

-- 1. Add override column
ALTER TABLE film_enrichment_queue
  ADD COLUMN IF NOT EXISTS tmdb_url_override TEXT;

-- 2. Helper: fix a failed entry and reset it for retry
--    Usage from SQL Editor:
--      SELECT retry_enrichment_with_tmdb_url(
--        '<letterboxd_short_url>',
--        'https://www.themoviedb.org/movie/12345/'
--      );
CREATE OR REPLACE FUNCTION retry_enrichment_with_tmdb_url(
  p_short_url    TEXT,
  p_tmdb_url     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _updated INT;
BEGIN
  UPDATE film_enrichment_queue
  SET
    tmdb_url_override = p_tmdb_url,
    status            = 'pending',
    retry_count       = 0,
    locked_at         = NULL,
    processed_at      = NULL
  WHERE letterboxd_short_url = p_short_url;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  IF _updated = 0 THEN
    RAISE EXCEPTION 'No enrichment queue entry found for short URL: %', p_short_url;
  END IF;

  RETURN format('Reset %s entries for %s with TMDB override: %s', _updated, p_short_url, p_tmdb_url);
END;
$$;
