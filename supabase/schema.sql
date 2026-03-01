-- ============================================================================
-- Madrid Film Calendar — Supabase Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. Films table
CREATE TABLE IF NOT EXISTS films (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  director      TEXT,
  year          INTEGER,

  -- Letterboxd metadata
  letterboxd_url       TEXT,
  letterboxd_short_url TEXT,
  letterboxd_rating    NUMERIC(4,2),
  letterboxd_viewers   INTEGER,

  -- Classification
  genres            TEXT[] DEFAULT '{}',
  country           TEXT[] DEFAULT '{}',
  primary_language  TEXT[] DEFAULT '{}',
  spoken_languages  TEXT[] DEFAULT '{}',

  -- TMDB
  tmdb_url          TEXT,

  -- Titles
  title_original    TEXT,
  title_en          TEXT,
  title_es          TEXT,

  -- Runtime
  runtime_minutes   INTEGER,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Screenings table (one row per session)
CREATE TABLE IF NOT EXISTS screenings (
  id           BIGSERIAL PRIMARY KEY,
  film_id      BIGINT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  showtime     TIMESTAMPTZ NOT NULL,
  location     TEXT NOT NULL DEFAULT 'Unknown',
  url_tickets  TEXT DEFAULT '',
  url_info     TEXT DEFAULT '',
  version      TEXT,                 -- NULL = original/VOSE, 'dubbed' = dubbed

  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_screenings_film_id  ON screenings(film_id);
CREATE INDEX IF NOT EXISTS idx_screenings_showtime ON screenings(showtime);
CREATE INDEX IF NOT EXISTS idx_films_letterboxd     ON films(letterboxd_short_url);

-- 4. Unique constraint to avoid duplicate screenings
CREATE UNIQUE INDEX IF NOT EXISTS idx_screenings_unique
  ON screenings(film_id, showtime, location);

-- 5. Row Level Security
ALTER TABLE films ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view films & screenings)
CREATE POLICY "Public read films"
  ON films FOR SELECT
  USING (true);

CREATE POLICY "Public read screenings"
  ON screenings FOR SELECT
  USING (true);

-- Authenticated write access (only service role / authenticated users can write)
CREATE POLICY "Service write films"
  ON films FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service write screenings"
  ON screenings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Helper function: auto-update `updated_at` on films
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER films_updated_at
  BEFORE UPDATE ON films
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. View that returns films with screening counts (useful for admin)
CREATE OR REPLACE VIEW films_overview AS
SELECT
  f.*,
  COUNT(s.id) AS screening_count,
  MIN(s.showtime) AS first_screening,
  MAX(s.showtime) AS last_screening
FROM films f
LEFT JOIN screenings s ON s.film_id = f.id
GROUP BY f.id;
