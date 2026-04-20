import {
  RENOIR_LOCATIONS,
  EMBAJADORES_LOCATIONS,
  THEATER_LOCATIONS,
} from './constants';
import type { Film, FilmRow, DateEntry } from './types';

export function isRenoirLocation(loc: string) {
  return RENOIR_LOCATIONS.includes(loc);
}

export function isEmbajadoresLocation(loc: string) {
  return EMBAJADORES_LOCATIONS.includes(loc);
}

export function isSpanishFilm(film: Film) {
  const lang = film.primaryLanguage;
  if (!lang) return false;
  const values = Array.isArray(lang) ? lang : [lang];
  return values.some(v => v === 'es' || v === 'Spanish');
}

export function normalizeText(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function getLocalTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDateInputValue(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getDateOnly(timestamp: string) {
  if (!timestamp) return null;
  const [datePart, timePart = '00:00'] = timestamp.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

export function formatViewerCount(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return n.toString();
}

export function getTheaterFallbackUrl(film: Film, dateObj: DateEntry) {
  const location = dateObj.location || '';
  if (isRenoirLocation(location)) return 'https://www.cinesrenoir.com/';
  if (isEmbajadoresLocation(location)) return 'https://cinesembajadores.es/madrid/';
  if (film.theater === 'Cineteca Madrid') return 'https://www.cinetecamadrid.com/';
  if (film.theater === 'Cine Doré') return 'https://www.culturaydeporte.gob.es/filmoteca/el-cine-dore.html';
  if (film.theater === 'Golem Madrid') return 'https://www.golem.es/golem/golem-madrid';
  if (film.theater === 'Sala Berlanga' || location === 'Sala Berlanga') return 'https://salaberlanga.com/programacion-de-actividades/';
  return '#';
}

/** Convert ISO timestamp from DB to "YYYY-MM-DD HH:MM" string.
 *  DB stores naive Madrid timestamps (no timezone). Extract YYYY-MM-DD HH:MM. */
export function isoToLocal(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : iso;
}

/** Map database rows to frontend Film objects */
export function mapFilmRows(rows: FilmRow[]): Film[] {
  return rows.map(row => {
    const dates: DateEntry[] = (row.screenings || []).map(s => ({
      timestamp: isoToLocal(s.showtime),
      location: s.location || 'Unknown',
      url_tickets: s.url_tickets || '',
      url_info: s.url_info || '',
      version: s.version || null,
      special: (s as any).special || null,
    }));

    const locations = [...new Set(dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
    const theaterDisplay = locations.length > 0 ? locations.join(', ') : 'Unknown';
    const mainLink = dates.find(d => d.url_info)?.url_info || '';

    return {
      id: row.id,
      title: row.title,
      titleEn: row.title_en || '',
      titleOriginal: row.title_original || '',
      director: row.director || '',
      year: row.year,
      theater: theaterDisplay,
      theaterLink: mainLink,
      dates,
      letterboxdUrl: row.letterboxd_url || '',
      letterboxdShortUrl: row.letterboxd_short_url || '',
      rating: row.letterboxd_rating ? parseFloat(String(row.letterboxd_rating)) : null,
      viewers: row.letterboxd_viewers,
      runtimeMinutes: row.runtime_minutes,
      genres: row.genres || [],
      country: row.country || [],
      primaryLanguage: row.primary_language || [],
      spokenLanguages: row.spoken_languages || [],
      tmdbUrl: row.tmdb_url || '',
      tmdbId: row.tmdb_id ?? null,
      posterPath: row.poster_path || undefined,
    };
  }).filter(f => f.title);
}

export function savePreference(data: Record<string, unknown>) {
  fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => { /* ignore — best effort */ });
}

export function setLangCookie(lang: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `fc_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

export function generateCalendarUrl(
  filmTitle: string,
  film: Film,
  dateObj: DateEntry,
): string {
  try {
    const start = new Date(dateObj.timestamp.replace(' ', 'T'));
    const durationMinutes = film.runtimeMinutes && film.runtimeMinutes > 0
      ? film.runtimeMinutes
      : 120;
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const fmt = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    };
    const title = encodeURIComponent(`${filmTitle}${film.year ? ` (${film.year})` : ''}`);
    let locationRaw = dateObj.location || film.theater;
    let mapLink = THEATER_LOCATIONS[locationRaw];
    if (!mapLink) {
      const foundKey = Object.keys(THEATER_LOCATIONS).find(k => locationRaw.includes(k));
      if (foundKey) mapLink = THEATER_LOCATIONS[foundKey];
    }
    const details = encodeURIComponent(`Director: ${film.director}\nLink: ${film.theaterLink || ''}\nLocation: ${mapLink || ''}`);
    const location = encodeURIComponent(mapLink || locationRaw);
    const dates = `${fmt(start)}/${fmt(end)}`;
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${dates}`;
  } catch { return '#'; }
}
