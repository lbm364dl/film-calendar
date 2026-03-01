-- ============================================================================
-- User Preferences — stores per-user settings (language, Letterboxd CSV data)
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER enabling Auth in your project.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lang              TEXT DEFAULT 'es' CHECK (lang IN ('es', 'en')),
  watchlist_urls    TEXT[] DEFAULT '{}',
  watched_urls      TEXT[] DEFAULT '{}',
  watchlist_active  BOOLEAN DEFAULT false,
  watched_active    BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: users can only read/write their own row
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own preferences"
  ON user_preferences FOR DELETE
  USING (auth.uid() = user_id);
