/** A single screening session from the database. */
export interface Screening {
  id: number;
  film_id: number;
  showtime: string;   // ISO timestamp
  location: string;
  url_tickets: string;
  url_info: string;
  version: string | null;
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
}

export interface DateEntry {
  timestamp: string;       // "YYYY-MM-DD HH:MM"
  location: string;
  url_tickets: string;
  url_info: string;
  version: string | null;
}

export interface SessionModalData {
  titleLabel: string;
  timeLabel: string;
  ticketUrl: string;
  filmPageUrl: string;
  calendarUrl: string;
  hasDirectUrl: boolean;
}
