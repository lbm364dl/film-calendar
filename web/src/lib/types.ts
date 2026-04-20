/** A single screening session from the database. */
export interface Screening {
  id: number;
  film_id: number;
  showtime: string;   // ISO timestamp
  location: string;
  url_tickets: string;
  url_info: string;
  version: string | null;
  special: string | null;
}

/** A film row from the database, with nested screenings. */
export interface FilmRow {
  id: number;
  title: string;
  director: string | null;
  year: number | null;
  letterboxd_url: string | null;
  letterboxd_short_url: string | null;
  letterboxd_rating: number | null;
  letterboxd_viewers: number | null;
  genres: string[];
  country: string[];
  primary_language: string[];
  spoken_languages: string[];
  tmdb_url: string | null;
  tmdb_id: number | null;
  poster_path: string | null;
  title_original: string | null;
  title_en: string | null;
  title_es: string | null;
  runtime_minutes: number | null;
  screenings: Screening[];
}

/** Processed film for the frontend (after mapping from DB rows). */
export interface Film {
  id: number;
  title: string;
  titleEn: string;
  titleOriginal: string;
  director: string;
  year: number | null;
  theater: string;
  theaterLink: string;
  dates: DateEntry[];
  letterboxdUrl: string;
  letterboxdShortUrl: string;
  rating: number | null;
  viewers: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  country: string[];
  primaryLanguage: string[];
  spokenLanguages: string[];
  tmdbUrl: string;
  tmdbId: number | null;      // Used to join against the KG (vibe embeddings + neighbors).
  /** TMDB poster path (e.g. "/abc123.jpg"). When present, Poster renders the
   *  real image via `https://image.tmdb.org/t/p/w342{posterPath}`; otherwise
   *  falls back to the deterministic abstract palette. */
  posterPath?: string;
  /** True when the film has at least one non-dubbed future session.
   *  Computed in the filter pipeline from the unfiltered future dates, so
   *  the session modal can tell "Spanish-original film (every session is
   *  `dubbed`)" apart from "VOSE film with extra dubbed sessions" without
   *  being misled by the active version filter. */
  hasOriginalVersion?: boolean;
}

export interface DateEntry {
  timestamp: string;       // "YYYY-MM-DD HH:MM"
  location: string;
  url_tickets: string;
  url_info: string;
  version: string | null;
  special: string | null;
}

export interface SessionModalData {
  // Rich context (drives the Direction C modal)
  film: Film;
  session: DateEntry;
  filmTitleLabel: string;   // localized title (ES/EN) with year appended
  matchScore?: number;      // 0–100 affinity, if signed-in + Letterboxd
  // Primary CTA — "Buy tickets" when session has a specific URL (either
  // `url_tickets` or, failing that, `url_info`); degrades to the theater's
  // home page labeled "Go to theater site".
  primaryUrl: string;
  primaryIsSpecific: boolean;
  // Secondary info-page link, only surfaced when we already have a distinct
  // tickets URL as the primary action.
  secondaryInfoUrl?: string;
  calendarUrl: string;
}
