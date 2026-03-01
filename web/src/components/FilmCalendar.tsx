'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { getSupabase } from '@/lib/supabase';
import { t, translateGenre, LangKey } from '@/lib/translations';
import type { Film, FilmRow, DateEntry, SessionModalData } from '@/lib/types';

// ── Constants ───────────────────────────────────────────────────────────────────
const ROWS_PER_PAGE = 10;
const SESSIONS_COLLAPSE_THRESHOLD = 2;
const RENOIR_LOCATIONS = ['Princesa', 'Retiro', 'Plaza de España'];
const EMBAJADORES_LOCATIONS = ['Embajadores Glorieta', 'Embajadores Ercilla'];

const THEATER_LOCATIONS: Record<string, string> = {
  'Plaza de España': 'Cines Renoir Plaza de España, C. de Martín de los Heros, 12, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Princesa': 'Cines Renoir Princesa, Calle de la Princesa, 3, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Retiro': 'Cines Renoir Retiro, C. de Narváez, 42, Retiro, 28009 Madrid, Spain',
  'Cine Doré': 'Cine Doré, C. de Sta. Isabel, 3, Centro, 28012 Madrid, Spain',
  'Cineteca': 'Cineteca, Pl. de Legazpi, 8, Arganzuela, 28045 Madrid, Spain',
  'Golem': 'Golem Madrid, C. de Martín de los Heros, 14, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Sala Berlanga': 'Sala Berlanga, C. de Andrés Mellado, 53, Chamberí, 28015 Madrid, Spain',
};

// ── Helpers ─────────────────────────────────────────────────────────────────────
function isRenoirLocation(loc: string) { return RENOIR_LOCATIONS.includes(loc); }
function isEmbajadoresLocation(loc: string) { return EMBAJADORES_LOCATIONS.includes(loc); }

function normalizeText(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getLocalTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateInputValue(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDateOnly(timestamp: string) {
  if (!timestamp) return null;
  const [datePart, timePart = '00:00'] = timestamp.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

function formatViewerCount(n: number | null) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return n.toString();
}

function getTheaterFallbackUrl(film: Film, dateObj: DateEntry) {
  const location = dateObj.location || '';
  if (isRenoirLocation(location)) return 'https://www.cinesrenoir.com/';
  if (isEmbajadoresLocation(location)) return 'https://cinesembajadores.es/madrid/';
  if (film.theater === 'Cineteca Madrid') return 'https://www.cinetecamadrid.com/';
  if (film.theater === 'Cine Doré') return 'https://www.culturaydeporte.gob.es/filmoteca/el-cine-dore.html';
  if (film.theater === 'Golem Madrid') return 'https://www.golem.es/golem/golem-madrid';
  if (film.theater === 'Sala Berlanga' || location === 'Sala Berlanga') return 'https://salaberlanga.com/programacion-de-actividades/';
  return '#';
}

/** Convert ISO timestamp from DB to "YYYY-MM-DD HH:MM" local time string */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Map database rows to frontend Film objects */
function mapFilmRows(rows: FilmRow[]): Film[] {
  return rows.map(row => {
    const dates: DateEntry[] = (row.screenings || []).map(s => ({
      timestamp: isoToLocal(s.showtime),
      location: s.location || 'Unknown',
      url_tickets: s.url_tickets || '',
      url_info: s.url_info || '',
      version: s.version || null,
    }));

    const locations = [...new Set(dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
    let theaterDisplay = locations.length > 0 ? locations.join(', ') : 'Unknown';
    // will be overridden per-language in render

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
    };
  }).filter(f => f.title);
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function FilmCalendar() {
  // ─ State ─
  const [allFilms, setAllFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [lang, setLangState] = useState<LangKey>('es');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheater, setSelectedTheater] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [yearMin, setYearMin] = useState(1900);
  const [yearMax, setYearMax] = useState(2026);
  const [yearBoundsMin, setYearBoundsMin] = useState(1900);
  const [yearBoundsMax, setYearBoundsMax] = useState(2026);

  const [watchlistUrls, setWatchlistUrls] = useState<Set<string> | null>(null);
  const [watchedUrls, setWatchedUrls] = useState<Set<string> | null>(null);
  const [watchlistActive, setWatchlistActive] = useState(false);
  const [watchedActive, setWatchedActive] = useState(false);

  const [displayedCount, setDisplayedCount] = useState(0);
  const [modal, setModal] = useState<SessionModalData | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  const [openPopupId, setOpenPopupId] = useState<string | null>(null);

  const watchlistInputRef = useRef<HTMLInputElement>(null);
  const watchedInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ─ Derived ─
  const getDateLocale = useCallback(() => lang === 'es' ? 'es-ES' : 'en-GB', [lang]);

  const getFilmTitle = useCallback((film: Film) => {
    if (lang === 'en' && film.titleEn) return film.titleEn;
    return film.title;
  }, [lang]);

  // ─ Init: load lang from localStorage ─
  useEffect(() => {
    const stored = localStorage.getItem('lang') as LangKey | null;
    if (stored === 'es' || stored === 'en') setLangState(stored);
  }, []);

  const setLang = useCallback((l: LangKey) => {
    setLangState(l);
    localStorage.setItem('lang', l);
  }, []);

  // ─ Init: restore CSV from localStorage ─
  useEffect(() => {
    try {
      const wl = localStorage.getItem('watchlistUrls');
      if (wl) {
        const set = new Set<string>(JSON.parse(wl));
        if (set.size > 0) setWatchlistUrls(set);
      }
      const wd = localStorage.getItem('watchedUrls');
      if (wd) {
        const set = new Set<string>(JSON.parse(wd));
        if (set.size > 0) setWatchedUrls(set);
      }
      setWatchlistActive(localStorage.getItem('watchlistFilterActive') === 'true');
      setWatchedActive(localStorage.getItem('watchedFilterActive') === 'true');
    } catch { /* ignore */ }
  }, []);

  // ─ Persist toggle states ─
  useEffect(() => {
    localStorage.setItem('watchlistFilterActive', String(watchlistActive));
  }, [watchlistActive]);
  useEffect(() => {
    localStorage.setItem('watchedFilterActive', String(watchedActive));
  }, [watchedActive]);

  // ─ Fetch films from Supabase ─
  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error: err } = await supabase
          .from('films')
          .select('*, screenings(*)')
          .order('title');

        if (err) throw err;
        const films = mapFilmRows(data as FilmRow[]);
        setAllFilms(films);

        // Compute year bounds
        const todayStart = getLocalTodayStart();
        const validYears = films
          .filter(f => f.dates.some(d => {
            const dt = getDateOnly(d.timestamp);
            return dt && dt >= todayStart;
          }))
          .map(f => f.year)
          .filter((y): y is number => y !== null && !isNaN(y));

        if (validYears.length > 0) {
          const min = Math.min(...validYears);
          const max = Math.max(...validYears);
          setYearBoundsMin(min);
          setYearBoundsMax(max);
          setYearMin(min);
          setYearMax(max);
        }
      } catch (err) {
        console.error('Error loading films:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ─ URL params: read on mount ─
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('search')) setSearchTerm(params.get('search')!);
    if (params.get('theater')) setSelectedTheater(params.get('theater')!);
    if (params.get('date')) setSelectedDate(params.get('date')!);
    if (params.get('min_year')) setYearMin(Number(params.get('min_year')));
    if (params.get('max_year')) setYearMax(Number(params.get('max_year')));
  }, []);

  // ─ URL params: update on filter change ─
  useEffect(() => {
    if (typeof window === 'undefined' || allFilms.length === 0) return;
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (selectedTheater) params.set('theater', selectedTheater);
    if (selectedDate) params.set('date', selectedDate);
    if (yearMin > yearBoundsMin) params.set('min_year', String(yearMin));
    if (yearMax < yearBoundsMax) params.set('max_year', String(yearMax));
    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
  }, [searchTerm, selectedTheater, selectedDate, yearMin, yearMax, yearBoundsMin, yearBoundsMax, allFilms]);

  // ─ Filtering ─
  const filteredFilms = useMemo(() => {
    const todayStart = getLocalTodayStart();
    const search = normalizeText(searchTerm);
    const currentMin = Math.min(yearMin, yearMax);
    const currentMax = Math.max(yearMin, yearMax);

    return allFilms
      .map(film => {
        const futureDates = film.dates.filter(d => {
          const dt = getDateOnly(d.timestamp);
          return dt && dt >= todayStart;
        });
        const sessionFiltered = futureDates.filter(d => {
          if (selectedTheater) {
            if (selectedTheater === 'Cines Renoir') {
              if (!isRenoirLocation(d.location)) return false;
            } else if (selectedTheater === 'Cines Embajadores') {
              if (!isEmbajadoresLocation(d.location)) return false;
            } else if (d.location !== selectedTheater) {
              return false;
            }
          }
          if (selectedDate && !d.timestamp.startsWith(selectedDate)) return false;
          return true;
        });
        return { ...film, dates: sessionFiltered };
      })
      .filter(film => {
        if (film.dates.length === 0) return false;
        const matchesSearch = !search ||
          normalizeText(film.title).includes(search) ||
          (film.titleEn && normalizeText(film.titleEn).includes(search)) ||
          (film.director && normalizeText(film.director).includes(search));

        let matchesYear = true;
        if (film.year) {
          matchesYear = film.year >= currentMin && film.year <= currentMax;
        } else {
          matchesYear = currentMin === yearBoundsMin && currentMax === yearBoundsMax;
        }

        let matchesWatchlist = true;
        if (watchlistUrls && watchlistActive) {
          matchesWatchlist = !!(film.letterboxdShortUrl && watchlistUrls.has(film.letterboxdShortUrl));
        }

        let matchesWatched = true;
        if (watchedUrls && watchedActive) {
          matchesWatched = !(film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl));
        }

        return matchesSearch && matchesYear && matchesWatchlist && matchesWatched;
      });
  }, [allFilms, searchTerm, selectedTheater, selectedDate, yearMin, yearMax, yearBoundsMin, yearBoundsMax, watchlistUrls, watchedUrls, watchlistActive, watchedActive]);

  // ─ Sorting ─
  const sortedFilms = useMemo(() => {
    return [...filteredFilms].sort((a, b) => {
      if (a.rating !== null && b.rating !== null) return b.rating - a.rating;
      if (a.rating !== null) return -1;
      if (b.rating !== null) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filteredFilms]);

  // ─ Pagination ─
  const columnsPerRow = 3; // approximate; CSS auto-fill handles actual layout
  const pageSize = columnsPerRow * ROWS_PER_PAGE;

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(pageSize);
  }, [sortedFilms, pageSize]);

  const visibleFilms = useMemo(() => sortedFilms.slice(0, displayedCount), [sortedFilms, displayedCount]);
  const remaining = sortedFilms.length - displayedCount;

  // ─ Helpers for date formatting ─
  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }, [lang]);

  const generateCalendarUrl = useCallback((film: Film, dateObj: DateEntry): string => {
    try {
      const start = new Date(dateObj.timestamp.replace(' ', 'T'));
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const fmt = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      };
      const title = encodeURIComponent(`${getFilmTitle(film)} (${film.year || ''})`);
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
  }, [getFilmTitle]);

  // ─ Modal ─
  const openModal = useCallback((data: SessionModalData) => {
    setModalClosing(false);
    setModal(data);
  }, []);

  const closeModal = useCallback(() => {
    if (!modal) return;
    setModalClosing(true);
    setTimeout(() => { setModal(null); setModalClosing(false); }, 220);
  }, [modal]);

  // Escape key closes modal + popups
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        setOpenPopupId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal]);

  // ─ CSV upload handlers ─
  const handleCsvUpload = useCallback((file: File, type: 'watchlist' | 'watched') => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const urls = new Set<string>();
        results.data.forEach((row: any) => {
          const uri = row['Letterboxd URI'];
          if (uri) urls.add(uri.trim());
        });
        if (urls.size > 0) {
          if (type === 'watchlist') {
            setWatchlistUrls(urls);
            setWatchlistActive(true);
            localStorage.setItem('watchlistUrls', JSON.stringify([...urls]));
          } else {
            setWatchedUrls(urls);
            setWatchedActive(true);
            localStorage.setItem('watchedUrls', JSON.stringify([...urls]));
          }
        }
      },
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchlistUrls(null);
    setWatchlistActive(false);
    localStorage.removeItem('watchlistUrls');
  }, []);

  const clearWatched = useCallback(() => {
    setWatchedUrls(null);
    setWatchedActive(false);
    localStorage.removeItem('watchedUrls');
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedTheater('');
    setSelectedDate('');
    setYearMin(yearBoundsMin);
    setYearMax(yearBoundsMax);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.pushState({}, '', url);
    }
  }, [yearBoundsMin, yearBoundsMax]);

  // ─ Slider track style ─
  const sliderTrackStyle = useMemo(() => {
    const range = yearBoundsMax - yearBoundsMin;
    if (range <= 0) return {};
    const minVal = Math.min(yearMin, yearMax);
    const maxVal = Math.max(yearMin, yearMax);
    const ratio1 = (minVal - yearBoundsMin) / range;
    const ratio2 = (maxVal - yearBoundsMin) / range;
    const thumbW = 16;
    const stop1 = `calc(${thumbW / 2}px + (100% - ${thumbW}px) * ${ratio1})`;
    const stop2 = `calc(${thumbW / 2}px + (100% - ${thumbW}px) * ${ratio2})`;
    return {
      background: `linear-gradient(to right, var(--border) ${stop1}, var(--accent) ${stop1}, var(--accent) ${stop2}, var(--border) ${stop2})`
    };
  }, [yearMin, yearMax, yearBoundsMin, yearBoundsMax]);

  // ─ Date min for date input ─
  const dateMin = formatDateInputValue(getLocalTodayStart());

  // ── Sub-components (inline for simplicity) ────────────────────────────────────

  function SessionRow({ film, dateObj }: { film: Film; dateObj: DateEntry }) {
    const formatted = formatDate(dateObj.timestamp);
    const calendarUrl = generateCalendarUrl(film, dateObj);
    const titleLabel = `${getFilmTitle(film)}${film.year ? ` (${film.year})` : ''}`;
    const hasDirectUrl = !!(dateObj.url_tickets && dateObj.url_tickets.trim());
    const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
    const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);

    let displayLocation = dateObj.location;
    if (isRenoirLocation(dateObj.location)) displayLocation = `Renoir ${dateObj.location}`;
    const timeLabel = `${formatted}${displayLocation && displayLocation !== 'Unknown' ? ' - ' + displayLocation : ''}`;

    return (
      <button
        className="date-row"
        onClick={(e) => {
          e.stopPropagation();
          openModal({ titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl });
        }}
      >
        <span className="date-badge">{formatted}</span>
        {dateObj.location && dateObj.location !== 'Unknown' && (
          <span className="location-badge">{displayLocation}</span>
        )}
        {dateObj.version === 'dubbed' && (
          <span className="version-badge dubbed" title={t(lang, 'dubbedTooltip')}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            <span>ES</span>
          </span>
        )}
      </button>
    );
  }

  function GroupedSessions({ film }: { film: Film }) {
    const grouped: Record<string, DateEntry[]> = {};
    film.dates.forEach(d => {
      const dayKey = d.timestamp.split(' ')[0];
      if (!grouped[dayKey]) grouped[dayKey] = [];
      grouped[dayKey].push(d);
    });
    const sortedDays = Object.keys(grouped).sort();

    return (
      <>
        {sortedDays.map(dayKey => {
          const sessions = grouped[dayKey].sort((a, b) => new Date(a.timestamp.replace(' ','T')).getTime() - new Date(b.timestamp.replace(' ','T')).getTime());
          const dayDate = new Date(dayKey + 'T12:00:00');
          const dayLabel = dayDate.toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

          return (
            <div className="sessions-day" key={dayKey}>
              <div className="sessions-day-header">{dayLabel}</div>
              <div className="sessions-day-times">
                {sessions.map((dateObj, i) => {
                  const time = new Date(dateObj.timestamp.replace(' ','T')).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
                  const calendarUrl = generateCalendarUrl(film, dateObj);
                  const hasDirectUrl = !!(dateObj.url_tickets && dateObj.url_tickets.trim());
                  const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
                  const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);
                  const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);
                  const dateLabel = new Date(dateObj.timestamp.replace(' ','T')).toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
                  const timeLabel = `${dateLabel} ${time}${dateObj.location ? ' - ' + dateObj.location : ''}`;

                  return (
                    <button
                      key={i}
                      className="session-time"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal({ titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl });
                      }}
                    >
                      <span className="time">{time}</span>
                      {dateObj.location && dateObj.location !== 'Unknown' && (
                        <span className="location">{dateObj.location}</span>
                      )}
                      {dateObj.version === 'dubbed' && (
                        <span className="version-badge dubbed" title={t(lang, 'dubbedTooltip')}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                          <span>ES</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  function SessionsDisplay({ film }: { film: Film }) {
    if (film.dates.length <= SESSIONS_COLLAPSE_THRESHOLD) {
      return <>{film.dates.map((d, i) => <SessionRow key={i} film={film} dateObj={d} />)}</>;
    }

    const popupId = `popup-${film.id}`;
    const isOpen = openPopupId === popupId;

    // Date range
    const sorted = [...film.dates].sort((a, b) => new Date(a.timestamp.replace(' ','T')).getTime() - new Date(b.timestamp.replace(' ','T')).getTime());
    const first = new Date(sorted[0].timestamp.replace(' ','T'));
    const last = new Date(sorted[sorted.length - 1].timestamp.replace(' ','T'));
    const fmtShort = (d: Date) => d.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' });
    const dateRange = first.toDateString() === last.toDateString() ? fmtShort(first) : `${fmtShort(first)} – ${fmtShort(last)}`;

    // Location summary
    const locations = [...new Set(film.dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
    let locationSummary = '';
    if (locations.every(l => isRenoirLocation(l))) locationSummary = 'Renoir';
    else if (locations.every(l => isEmbajadoresLocation(l))) locationSummary = 'Embajadores';
    else if (locations.length === 1) locationSummary = locations[0];
    else if (locations.length > 1) locationSummary = t(lang, 'nTheaters', locations.length);

    return (
      <>
        <button
          className={`sessions-toggle ${isOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpenPopupId(isOpen ? null : popupId);
          }}
        >
          <span className="toggle-icon">▼</span>
          <span>{dateRange}</span>
          {locationSummary && <span className="location-summary">{locationSummary}</span>}
          <span className="sessions-count">{film.dates.length}</span>
        </button>
        <div
          id={popupId}
          className={`sessions-popup ${isOpen ? 'show' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <GroupedSessions film={film} />
        </div>
      </>
    );
  }

  function FilmCard({ film }: { film: Film }) {
    const ratingValue = film.rating ? film.rating.toFixed(1) : null;
    const viewersFormatted = formatViewerCount(film.viewers);
    const viewersTooltip = viewersFormatted
      ? (lang === 'es'
        ? t(lang, 'viewersLabel', film.viewers!.toLocaleString('es-ES'))
        : t(lang, 'viewersLabel', film.viewers!.toLocaleString('en-US')))
      : '';

    const titleText = getFilmTitle(film);
    const metadata: string[] = [];
    if (film.director) metadata.push(film.director);
    if (film.year) metadata.push(String(film.year));
    if (film.runtimeMinutes) metadata.push(`${film.runtimeMinutes} min`);
    const letterboxdLink = film.letterboxdShortUrl || film.letterboxdUrl;

    return (
      <div className="film-card">
        <div className="film-header">
          <div className="film-title-row">
            <div className="film-title">
              {titleText}
              {metadata.length > 0 && (
                <span className="title-meta"> ({metadata.join(', ')})</span>
              )}
            </div>
          </div>
          <div className="card-actions">
            {ratingValue && (
              <div className="rating" title={t(lang, 'ratingTooltip', ratingValue)}>
                <span className="metric-icon rating-icon" aria-hidden="true" />
                {ratingValue}
              </div>
            )}
            {viewersFormatted && (
              <div className="viewers" title={viewersTooltip}>
                <span className="metric-icon viewers-icon" aria-hidden="true" />
                {viewersFormatted}
              </div>
            )}
            {letterboxdLink && (
              <a href={letterboxdLink} className="letterboxd-link" target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()} title="View on Letterboxd">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/letterboxd.svg" className="letterboxd-icon" alt="LB" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '📽️'; }} />
              </a>
            )}
          </div>
        </div>

        {film.genres.length > 0 && (
          <div className="film-genres">
            {film.genres.map((g, i) => (
              <span key={i} className="genre-badge">{translateGenre(g, lang)}</span>
            ))}
          </div>
        )}

        {film.dates.length > 0 && (
          <div className="film-dates">
            <SessionsDisplay film={film} />
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const [showCsvTooltip, setShowCsvTooltip] = useState(false);

  return (
    <div className="container" onClick={() => { setOpenPopupId(null); setShowCsvTooltip(false); }}>
      {/* Header */}
      <header>
        <div className="lang-toggle">
          <button className={`lang-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => setLang('es')}>ES</button>
          <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
        </div>
        <h1>{t(lang, 'siteTitle')}</h1>
        <p className="subtitle">{t(lang, 'subtitle')}</p>
      </header>

      {/* Filters */}
      <div className="filters-grid">
        <input
          ref={dateInputRef}
          type="date"
          id="date-filter"
          placeholder={t(lang, 'selectDate')}
          min={dateMin}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          onClick={(e) => { try { (e.target as any).showPicker(); } catch {} }}
          className={selectedDate ? 'has-value' : ''}
          lang={lang === 'es' ? 'es-ES' : 'en-GB'}
        />

        <div className="search-box">
          <input
            type="text"
            id="search"
            placeholder={t(lang, 'searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
          />
        </div>

        <select
          id="theater-filter"
          value={selectedTheater}
          onChange={(e) => setSelectedTheater(e.target.value)}
        >
          <option value="">{t(lang, 'allTheaters')}</option>
          <option value="Cines Renoir">Cines Renoir</option>
          <option value="Cineteca Madrid">Cineteca Madrid</option>
          <option value="Cine Doré">Cine Doré</option>
          <option value="Cine Estudio">Cine Estudio</option>
          <option value="Golem">Golem Madrid</option>
          <option value="Sala Berlanga">Sala Berlanga</option>
          <option value="Cines Embajadores">Cines Embajadores</option>
          <option value="Cine Paz">Cine Paz</option>
          <option value="Sala Equis">Sala Equis</option>
          <option value="Verdi">Verdi Madrid</option>
        </select>

        <div className="year-filter">
          <div className="year-inputs">
            <div className="year-input-group">
              <label htmlFor="year-min-val">{t(lang, 'yearFrom')}</label>
              <input
                type="number"
                id="year-min-val"
                min={yearBoundsMin}
                max={yearBoundsMax}
                value={yearMin}
                onChange={(e) => setYearMin(Number(e.target.value))}
              />
            </div>
            <div className="year-input-group">
              <label htmlFor="year-max-val">{t(lang, 'yearTo')}</label>
              <input
                type="number"
                id="year-max-val"
                min={yearBoundsMin}
                max={yearBoundsMax}
                value={yearMax}
                onChange={(e) => setYearMax(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="range-slider">
            <div className="slider-track" style={sliderTrackStyle} />
            <input
              type="range"
              min={yearBoundsMin}
              max={yearBoundsMax}
              value={yearMin}
              onChange={(e) => setYearMin(Number(e.target.value))}
            />
            <input
              type="range"
              min={yearBoundsMin}
              max={yearBoundsMax}
              value={yearMax}
              onChange={(e) => setYearMax(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="actions-cell">
          {/* Watchlist filter */}
          <div className={`watchlist-filter ${watchlistUrls ? 'loaded' : ''} ${watchlistUrls && watchlistActive ? 'active' : ''}`}>
            <input
              ref={watchlistInputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvUpload(file, 'watchlist');
                e.target.value = '';
              }}
            />
            <button
              className="csv-filter-btn"
              title={t(lang, 'watchlistBtnTitle')}
              onClick={() => { if (!watchlistUrls) watchlistInputRef.current?.click(); }}
            >
              <span className="csv-label-text">
                <span className="csv-label-full">
                  {watchlistUrls ? (watchlistActive ? t(lang, 'watchlistActive') : t(lang, 'watchlistFull')) : t(lang, 'watchlistFull')}
                </span>
                <span className="csv-label-short">
                  {watchlistUrls ? (watchlistActive ? t(lang, 'watchlistActive') : t(lang, 'watchlistShort')) : t(lang, 'watchlistShort')}
                </span>
              </span>
              <span className="csv-label-icon" title={t(lang, 'watchlistIconTitle')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
              </span>
            </button>
            {watchlistUrls && (
              <span className="csv-toggle-wrap">
                <label className="toggle-switch" title={t(lang, 'watchlistToggleTitle')}>
                  <input
                    type="checkbox"
                    checked={watchlistActive}
                    onChange={(e) => setWatchlistActive(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </span>
            )}
            {watchlistUrls && (
              <button className="csv-remove-btn" title={t(lang, 'removeWatchlist')} onClick={(e) => { e.stopPropagation(); clearWatchlist(); }}>
                &times;
              </button>
            )}
            <div
              className={`csv-info-trigger ${showCsvTooltip ? 'show' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowCsvTooltip(!showCsvTooltip); }}
            >
              <span className="info-icon">?</span>
              <div className="csv-info-tooltip" onClick={(e) => e.stopPropagation()}>
                <p dangerouslySetInnerHTML={{ __html: t(lang, 'csvTooltipTitle') }} />
                <ol>
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep1') }} />
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep2') }} />
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep3') }} />
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep4') }} />
                </ol>
                <p className="csv-persistence-note">{t(lang, 'csvPersistence')}</p>
                {watchlistUrls && <p className="csv-count-info">{t(lang, 'watchlistCount', watchlistUrls.size)}</p>}
                {watchedUrls && <p className="csv-count-info">{t(lang, 'watchedCount', watchedUrls.size)}</p>}
              </div>
            </div>
          </div>

          {/* Watched filter */}
          <div className={`watched-filter ${watchedUrls ? 'loaded' : ''} ${watchedUrls && watchedActive ? 'active' : ''}`}>
            <input
              ref={watchedInputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvUpload(file, 'watched');
                e.target.value = '';
              }}
            />
            <button
              className="csv-filter-btn"
              title={t(lang, 'watchedBtnTitle')}
              onClick={() => { if (!watchedUrls) watchedInputRef.current?.click(); }}
            >
              <span className="csv-label-text">
                <span className="csv-label-full">
                  {watchedUrls ? (watchedActive ? t(lang, 'watchedActive') : t(lang, 'watchedFull')) : t(lang, 'watchedFull')}
                </span>
                <span className="csv-label-short">
                  {watchedUrls ? (watchedActive ? t(lang, 'watchedActive') : t(lang, 'watchedShort')) : t(lang, 'watchedShort')}
                </span>
              </span>
              <span className="csv-label-icon" title={t(lang, 'watchedIconTitle')} aria-hidden="true" />
            </button>
            {watchedUrls && (
              <span className="csv-toggle-wrap">
                <label className="toggle-switch" title={t(lang, 'watchedToggleTitle')}>
                  <input
                    type="checkbox"
                    checked={watchedActive}
                    onChange={(e) => setWatchedActive(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </span>
            )}
            {watchedUrls && (
              <button className="csv-remove-btn" title={t(lang, 'removeWatched')} onClick={(e) => { e.stopPropagation(); clearWatched(); }}>
                &times;
              </button>
            )}
          </div>

          {/* Clear filters */}
          <button className="clear-filters-btn" title={t(lang, 'clearFiltersTitle')} onClick={clearAllFilters}>
            <span>{t(lang, 'clearFilters')}</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
        <span>{t(lang, 'filmCount', filteredFilms.length)}</span>
        <span className="calendar-hint">{t(lang, 'calendarHint')}</span>
      </div>

      {/* Loading / Error */}
      {loading && <div className="loading">{t(lang, 'loading')}</div>}
      {error && <div className="loading">{t(lang, 'errorLoading')}</div>}

      {/* Film grid */}
      {!loading && !error && (
        <>
          {filteredFilms.length === 0 ? (
            <div className="no-results" style={{ display: 'block' }}>{t(lang, 'noResults')}</div>
          ) : (
            <>
              <div className="films-grid" style={{ display: 'grid' }}>
                {visibleFilms.map(film => <FilmCard key={film.id} film={film} />)}
              </div>
              {remaining > 0 && (
                <div className="load-more-container">
                  <button className="load-more-btn" onClick={() => setDisplayedCount(prev => prev + pageSize)}>
                    {t(lang, 'loadMore', remaining)}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-content">
          <p>{t(lang, 'footerCreated')}</p>
          <p dangerouslySetInnerHTML={{ __html: t(lang, 'footerThanks') }} />
          <p dangerouslySetInnerHTML={{ __html: t(lang, 'footerMistakes') }} />
          <p>
            <a className="github-link" href="https://github.com/lbm364dl/film-calendar" target="_blank" rel="noopener noreferrer">
              <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.38 6.84 9.74.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.17-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1.01.07 1.54 1.07 1.54 1.07.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.04.8-.23 1.65-.35 2.5-.35s1.7.12 2.5.35c1.91-1.31 2.75-1.04 2.75-1.04.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.48 3.97-1.36 6.83-5.2 6.83-9.74C22 6.58 17.52 2 12 2z" />
              </svg>
              <span>{t(lang, 'viewOnGithub')}</span>
            </a>
          </p>
        </div>
      </footer>

      {/* Session Modal */}
      {modal && (
        <div
          className={`session-modal show ${modalClosing ? 'closing' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="session-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="session-modal-header">
              <div className="session-modal-header-text">
                <div className="session-modal-title">{modal.titleLabel}</div>
                <div className="session-modal-time">{modal.timeLabel}</div>
              </div>
              <button className="session-modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="session-modal-actions">
              {modal.hasDirectUrl ? (
                <>
                  <a href={modal.ticketUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'buyTickets')}</a>
                  <a href={modal.filmPageUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'viewFilmPage')}</a>
                  <a href={modal.calendarUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'addToCalendar')}</a>
                </>
              ) : (
                <>
                  <a href={modal.filmPageUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'buyTickets')}</a>
                  <a href={modal.calendarUrl} className="session-modal-action" target="_blank" rel="noopener noreferrer">{t(lang, 'addToCalendar')}</a>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
