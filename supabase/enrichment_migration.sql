-- ============================================================================
-- Migration: Add TMDB enrichment columns for recommendation system
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER the base schema and
-- recommender_migration have been applied.
-- ============================================================================

-- TMDB numeric ID (extracted from tmdb_url for quick lookups)
ALTER TABLE films ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;

-- Directors: [{id, name}] — top 2, with TMDB person IDs
-- For movies: from credits.crew (job = "Director")
-- For TV: from created_by (the show creators)
ALTER TABLE films ADD COLUMN IF NOT EXISTS directors JSONB DEFAULT '[]';

-- Cast: [{id, name}] — top 5 billed actors, with TMDB person IDs
ALTER TABLE films ADD COLUMN IF NOT EXISTS top_cast JSONB DEFAULT '[]';

-- Keywords: [{id, name}] — thematic tags from TMDB
ALTER TABLE films ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]';

-- TMDB crowd-sourced rating (1–10 scale) and vote count
ALTER TABLE films ADD COLUMN IF NOT EXISTS tmdb_rating NUMERIC(4,2);
ALTER TABLE films ADD COLUMN IF NOT EXISTS tmdb_votes INTEGER;

-- Production companies: [{id, name}]
ALTER TABLE films ADD COLUMN IF NOT EXISTS production_companies JSONB DEFAULT '[]';

-- Collection / franchise
ALTER TABLE films ADD COLUMN IF NOT EXISTS collection_name TEXT;
ALTER TABLE films ADD COLUMN IF NOT EXISTS collection_id INTEGER;

-- Plot summary and one-liner
ALTER TABLE films ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE films ADD COLUMN IF NOT EXISTS tagline TEXT;

-- Index on tmdb_id for potential future lookups
CREATE INDEX IF NOT EXISTS idx_films_tmdb_id ON films(tmdb_id);
