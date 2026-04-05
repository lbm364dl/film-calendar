-- ============================================================================
-- Migration: user_watched_films, user_watchlist_films, user_film_scores
--
-- Normalizes watched/watchlist data from user_preferences arrays into proper
-- relational tables, and adds a precomputed match scores table.
-- ============================================================================

-- 1. user_watched_films — replaces watched_urls + watched_ratings in user_preferences
CREATE TABLE IF NOT EXISTS public.user_watched_films (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    letterboxd_short_url text NOT NULL,
    film_id bigint REFERENCES public.films(id) ON DELETE SET NULL,
    rating numeric(2,1),          -- 0.5–5.0 Letterboxd stars, NULL if unrated
    liked boolean NOT NULL DEFAULT false,  -- Letterboxd heart
    watched_date date,            -- from Letterboxd export
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, letterboxd_short_url)
);

-- 2. user_watchlist_films — replaces watchlist_urls in user_preferences
CREATE TABLE IF NOT EXISTS public.user_watchlist_films (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    letterboxd_short_url text NOT NULL,
    film_id bigint REFERENCES public.films(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, letterboxd_short_url)
);

-- 3. user_film_scores — precomputed recommendation match scores
CREATE TABLE IF NOT EXISTS public.user_film_scores (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    film_id bigint NOT NULL REFERENCES public.films(id) ON DELETE CASCADE,
    score smallint NOT NULL,      -- 0–100 match percentage
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, film_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_user_watched_films_user ON public.user_watched_films(user_id);
CREATE INDEX idx_user_watched_films_film ON public.user_watched_films(film_id) WHERE film_id IS NOT NULL;
CREATE INDEX idx_user_watched_films_url ON public.user_watched_films(letterboxd_short_url);

CREATE INDEX idx_user_watchlist_films_user ON public.user_watchlist_films(user_id);
CREATE INDEX idx_user_watchlist_films_url ON public.user_watchlist_films(letterboxd_short_url);

CREATE INDEX idx_user_film_scores_user ON public.user_film_scores(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_watched_films ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlist_films ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_film_scores ENABLE ROW LEVEL SECURITY;

-- user_watched_films: users CRUD their own rows
CREATE POLICY "Users read own watched" ON public.user_watched_films
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watched" ON public.user_watched_films
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watched" ON public.user_watched_films
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own watched" ON public.user_watched_films
    FOR DELETE USING (auth.uid() = user_id);

-- user_watchlist_films: users CRUD their own rows
CREATE POLICY "Users read own watchlist" ON public.user_watchlist_films
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watchlist" ON public.user_watchlist_films
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watchlist" ON public.user_watchlist_films
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own watchlist" ON public.user_watchlist_films
    FOR DELETE USING (auth.uid() = user_id);

-- user_film_scores: users read own, service role writes
CREATE POLICY "Users read own scores" ON public.user_film_scores
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scores" ON public.user_film_scores
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scores" ON public.user_film_scores
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own scores" ON public.user_film_scores
    FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service write scores" ON public.user_film_scores
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Service role full access (for edge functions / background jobs)
CREATE POLICY "Service manage watched" ON public.user_watched_films
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service manage watchlist" ON public.user_watchlist_films
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Grants ───────────────────────────────────────────────────────────────────

GRANT ALL ON TABLE public.user_watched_films TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_watchlist_films TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_film_scores TO anon, authenticated, service_role;

-- ── Trigger: auto-resolve film_id when films are upserted ────────────────────
--
-- When a film is inserted or its letterboxd_short_url is updated, set film_id
-- on any matching user_watched_films / user_watchlist_films rows.

CREATE OR REPLACE FUNCTION public.resolve_user_film_ids() RETURNS trigger AS $$
BEGIN
    UPDATE public.user_watched_films
    SET film_id = NEW.id
    WHERE letterboxd_short_url = NEW.letterboxd_short_url
      AND film_id IS NULL;

    UPDATE public.user_watchlist_films
    SET film_id = NEW.id
    WHERE letterboxd_short_url = NEW.letterboxd_short_url
      AND film_id IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER resolve_film_ids_on_upsert
    AFTER INSERT OR UPDATE OF letterboxd_short_url ON public.films
    FOR EACH ROW EXECUTE FUNCTION public.resolve_user_film_ids();

-- ── Drop legacy columns from user_preferences ───────────────────────────────
-- Data from watched_urls/watched_ratings was never in production, so no
-- backfill needed. watchlist_urls likewise.

ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS watched_urls;
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS watchlist_urls;
ALTER TABLE public.user_preferences DROP COLUMN IF EXISTS watched_ratings;

-- ── Backfill: resolve film_id for existing data ──────────────────────────────
-- (Run once after creating the tables and migrating data)

UPDATE public.user_watched_films uw
SET film_id = f.id
FROM public.films f
WHERE uw.letterboxd_short_url = f.letterboxd_short_url
  AND uw.film_id IS NULL;

UPDATE public.user_watchlist_films ul
SET film_id = f.id
FROM public.films f
WHERE ul.letterboxd_short_url = f.letterboxd_short_url
  AND ul.film_id IS NULL;
