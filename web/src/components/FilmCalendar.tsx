'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { t, translateGenre, LangKey } from '@/lib/translations';
import type { Film, FilmRow, DateEntry, SessionModalData } from '@/lib/types';
import type { CompactBreakdown } from '@/lib/recommender';
import AuthButton from '@/components/AuthButton';

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

/** Convert ISO timestamp from DB to "YYYY-MM-DD HH:MM" string.
 *  Screenings are stored with a UTC-Z suffix but actually represent Madrid local
 *  times, so we read the UTC fields directly to avoid any timezone shift. */
function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
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

// ── Helper: save preferences to API (fire-and-forget) ───────────────────────
function savePreference(data: Record<string, unknown>) {
  fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => { /* ignore — best effort */ });
}

function setLangCookie(lang: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `fc_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────────
interface FilmCalendarProps {
  initialLang: LangKey;
  initialWatchlistUrls: string[];
  initialWatchedUrls: string[];
  initialWatchlistActive: boolean;
  initialWatchedActive: boolean;
  initialUserId: string | null;
  initialUserEmail: string | null;
  initialScores: Record<number, number>;
}

export default function FilmCalendar({
  initialLang,
  initialWatchlistUrls,
  initialWatchedUrls,
  initialWatchlistActive,
  initialWatchedActive,
  initialUserId,
  initialUserEmail,
  initialScores,
}: FilmCalendarProps) {
  // ─ State ─
  // All values come from the server (cookie for lang, DB for auth'd users).
  // No client-side hydration from localStorage needed — first render is correct.
  const [allFilms, setAllFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [lang, setLangState] = useState<LangKey>(initialLang);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheater, setSelectedTheater] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [yearMin, setYearMin] = useState(1900);
  const [yearMax, setYearMax] = useState(2026);
  const [yearBoundsMin, setYearBoundsMin] = useState(1900);
  const [yearBoundsMax, setYearBoundsMax] = useState(2026);

  const [watchlistUrls, setWatchlistUrls] = useState<Set<string> | null>(
    () => initialWatchlistUrls.length > 0 ? new Set(initialWatchlistUrls) : null
  );
  const [watchedUrls, setWatchedUrls] = useState<Set<string> | null>(
    () => initialWatchedUrls.length > 0 ? new Set(initialWatchedUrls) : null
  );
  const [watchlistActive, setWatchlistActive] = useState(initialWatchlistActive);
  const [watchedActive, setWatchedActive] = useState(initialWatchedActive);

  const [displayedCount, setDisplayedCount] = useState(0);
  const [modal, setModal] = useState<SessionModalData | null>(null);
  const [modalClosing, setModalClosing] = useState(false);

  const [openPopupId, setOpenPopupId] = useState<string | null>(null);

  // Recommender state
  const hasInitialScores = Object.keys(initialScores).length > 0;
  const [matchScores, setMatchScores] = useState<Record<number, number>>(initialScores);
  const [breakdowns, setBreakdowns] = useState<Record<number, CompactBreakdown>>({});
  const [sortByMatch, setSortByMatch] = useState(false);
  const [enrichmentTotal, setEnrichmentTotal] = useState(0);
  const [enrichmentProcessed, setEnrichmentProcessed] = useState(0);
  const [enrichmentPolling, setEnrichmentPolling] = useState(false);
  const [recommendReady, setRecommendReady] = useState(hasInitialScores);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [showWatched, setShowWatched] = useState(false);
  const [showLbModal, setShowLbModal] = useState(false);
  const [lbModalClosing, setLbModalClosing] = useState(false);

  const watchlistInputRef = useRef<HTMLInputElement>(null);
  const watchedInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // ─ Derived ─
  const getDateLocale = useCallback(() => lang === 'es' ? 'es-ES' : 'en-GB', [lang]);

  const getFilmTitle = useCallback((film: Film) => {
    if (lang === 'en' && film.titleEn) return film.titleEn;
    return film.title;
  }, [lang]);

  const setLang = useCallback((l: LangKey) => {
    setLangState(l);
    setLangCookie(l);
    if (initialUserId) savePreference({ lang: l });
  }, [initialUserId]);

  // ─ Fetch films from Supabase ─
  useEffect(() => {
    async function load() {
      try {
        const supabase = getBrowserSupabase();
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
        if (watchedUrls && watchedActive && !showWatched) {
          matchesWatched = !(film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl));
        }

        return matchesSearch && matchesYear && matchesWatchlist && matchesWatched;
      });
  }, [allFilms, searchTerm, selectedTheater, selectedDate, yearMin, yearMax, yearBoundsMin, yearBoundsMax, watchlistUrls, watchedUrls, watchlistActive, watchedActive, showWatched]);

  // ─ Sorting ─
  const sortedFilms = useMemo(() => {
    return [...filteredFilms].sort((a, b) => {
      if (sortByMatch && Object.keys(matchScores).length > 0) {
        const scoreA = matchScores[a.id] ?? -1;
        const scoreB = matchScores[b.id] ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      if (a.rating !== null && b.rating !== null) return b.rating - a.rating;
      if (a.rating !== null) return -1;
      if (b.rating !== null) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filteredFilms, sortByMatch, matchScores]);

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

  const closeLbModal = useCallback(() => {
    setLbModalClosing(true);
    setTimeout(() => { setShowLbModal(false); setLbModalClosing(false); }, 220);
  }, []);

  // Escape key closes modals + popups
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLbModal) { closeLbModal(); return; }
        closeModal();
        setOpenPopupId(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closeModal, closeLbModal, showLbModal]);

  // ─ CSV upload handler (watchlist only — watched uses ZIP) ─
  const handleCsvUpload = useCallback((file: File, type: 'watchlist' | 'watched') => {
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const urls = new Set<string>();
        results.data.forEach((row: any) => {
          const uri = row['Letterboxd URI'];
          if (uri) urls.add(uri.trim());
        });
        if (urls.size > 0) {
          if (type === 'watchlist') {
            setWatchlistUrls(urls);
            setWatchlistActive(true);
            if (initialUserId) {
              const supabase = getBrowserSupabase();
              const wlRows = [...urls].map(url => ({ user_id: initialUserId, letterboxd_short_url: url }));
              const BATCH = 500;
              await supabase.from('user_watchlist_films').delete().eq('user_id', initialUserId);
              for (let i = 0; i < wlRows.length; i += BATCH) {
                await supabase.from('user_watchlist_films').insert(wlRows.slice(i, i + BATCH));
              }
              savePreference({ watchlist_active: true });
            }
          }
        }
      },
    });
  }, [initialUserId]);

  // ─ Fetch recommendations from API ─
  const fetchRecommendations = useCallback(async () => {
    setScoresLoading(true);
    try {
      const resp = await fetch('/api/recommend');
      const data = await resp.json();
      if (resp.ok && data.scores) {
        setMatchScores(data.scores);
        setRecommendReady(Object.keys(data.scores).length > 0);
        if (data.breakdowns) setBreakdowns(data.breakdowns);
      }
    } catch (err) {
      console.error('Recommend error:', err);
    } finally {
      setScoresLoading(false);
    }
  }, []);

  // ─ Poll enrichment progress (per-user) ─
  const pollEnrichment = useCallback(async (cancelled?: { current: boolean }) => {
    setEnrichmentPolling(true);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const resp = await fetch('/api/enrich-batch');
        const data = await resp.json();
        if (!resp.ok) break;
        if (cancelled?.current) break;

        setEnrichmentTotal(data.total);
        setEnrichmentProcessed(data.processed);

        if (data.total === 0 || data.done || data.processed >= data.total) {
          // All done (or only failures remain) — fetch recommendations before clearing polling state
          await fetchRecommendations();
          setEnrichmentPolling(false);
          return;
        }

        await new Promise(r => setTimeout(r, 4000));
        if (cancelled?.current) break;
      }
    } catch (err) {
      console.error('Enrichment poll error:', err);
    }
    if (!cancelled?.current) setEnrichmentPolling(false);
  }, [fetchRecommendations]);

  // ─ ZIP upload handler (Letterboxd export: watched + watchlist + ratings) ─
  const handleZipUpload = useCallback(async (file: File) => {
    if (!initialUserId) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Show progress immediately
      setEnrichmentPolling(true);
      setEnrichmentProcessed(0);
      setRecommendReady(false);

      const uploadResp = await fetch('/api/upload-watched', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) {
        console.error('Upload error:', uploadData.error);
        return;
      }

      // Update local state immediately so filters work without reload
      if (uploadData.watchedUrls?.length > 0) {
        setWatchedUrls(new Set(uploadData.watchedUrls));
      }
      if (uploadData.watchlistUrls?.length > 0) {
        setWatchlistUrls(new Set(uploadData.watchlistUrls));
      }
      setEnrichmentTotal(uploadData.total);
      setEnrichmentProcessed(uploadData.alreadyKnown);
      setRecommendReady(false);

      // Persist watched_active so auto-resume works on reload
      setWatchedActive(true);
      savePreference({ watched_active: true });

      // Start polling for progress
      await pollEnrichment();
    } catch (err) {
      console.error('ZIP upload error:', err);
      setEnrichmentPolling(false);
    }
  }, [initialUserId, pollEnrichment]);

  // ─ Fetch breakdowns in background when initial scores came from SSR cache ─
  useEffect(() => {
    if (!initialUserId || !initialWatchedActive || initialWatchedUrls.length === 0) return;
    if (!hasInitialScores) return;
    let cancelled = false;
    fetch('/api/recommend').then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled || !data) return;
      if (data.breakdowns) setBreakdowns(data.breakdowns);
      // Also refresh scores in case they've changed since SSR
      if (data.scores) setMatchScores(data.scores);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─ Auto-resume enrichment + fetch recommendations on mount ─
  useEffect(() => {
    if (!initialUserId || !initialWatchedActive || initialWatchedUrls.length === 0) return;

    const cancelRef = { current: false };

    async function resumeEnrichmentAndRecommend() {
      try {
        // Check per-user enrichment progress
        const resp = await fetch('/api/enrich-batch');
        const data = await resp.json();
        if (cancelRef.current || !resp.ok) return;

        setEnrichmentTotal(data.total);
        setEnrichmentProcessed(data.processed);

        if (data.total > 0 && !data.done && data.processed < data.total) {
          // Still processing — poll until done (shows progress bar even after reload)
          await pollEnrichment(cancelRef);
        } else if (!hasInitialScores) {
          // All done and no SSR scores yet — fetch recommendations
          await fetchRecommendations();
        }
      } catch (err) {
        console.error('Auto-resume error:', err);
      }
    }

    resumeEnrichmentAndRecommend();
    return () => { cancelRef.current = true; };
  }, [initialUserId, initialWatchedActive, initialWatchedUrls.length, hasInitialScores, fetchRecommendations, pollEnrichment]);

  const clearLetterboxdData = useCallback(async () => {
    setWatchlistUrls(null);
    setWatchlistActive(false);
    setWatchedUrls(null);
    setWatchedActive(false);
    setMatchScores({});
    setBreakdowns({});
    setSortByMatch(false);
    setEnrichmentTotal(0);
    setEnrichmentProcessed(0);
    setEnrichmentPolling(false);
    setRecommendReady(false);
    if (initialUserId) {
      const supabase = getBrowserSupabase();
      await Promise.all([
        supabase.from('user_watched_films').delete().eq('user_id', initialUserId),
        supabase.from('user_watchlist_films').delete().eq('user_id', initialUserId),
        supabase.from('user_film_scores').delete().eq('user_id', initialUserId),
      ]);
      savePreference({ watchlist_active: false, watched_active: false });
    }
  }, [initialUserId]);

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
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
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
          const sessions = grouped[dayKey].sort((a, b) => new Date(a.timestamp.replace(' ', 'T')).getTime() - new Date(b.timestamp.replace(' ', 'T')).getTime());
          const dayDate = new Date(dayKey + 'T12:00:00');
          const dayLabel = dayDate.toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

          return (
            <div className="sessions-day" key={dayKey}>
              <div className="sessions-day-header">{dayLabel}</div>
              <div className="sessions-day-times">
                {sessions.map((dateObj, i) => {
                  const time = new Date(dateObj.timestamp.replace(' ', 'T')).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
                  const calendarUrl = generateCalendarUrl(film, dateObj);
                  const hasDirectUrl = !!(dateObj.url_tickets && dateObj.url_tickets.trim());
                  const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
                  const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);
                  const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);
                  const dateLabel = new Date(dateObj.timestamp.replace(' ', 'T')).toLocaleDateString(getDateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
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
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
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
    const sorted = [...film.dates].sort((a, b) => new Date(a.timestamp.replace(' ', 'T')).getTime() - new Date(b.timestamp.replace(' ', 'T')).getTime());
    const first = new Date(sorted[0].timestamp.replace(' ', 'T'));
    const last = new Date(sorted[sorted.length - 1].timestamp.replace(' ', 'T'));
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

  function buildScoreTooltip(score: number, breakdown: CompactBreakdown | undefined, lang: LangKey): string {
    const base = lang === 'es' ? `${score}% de afinidad` : `${score}% match`;
    if (!breakdown) return base;

    const catLabels: Record<string, string> = {
      genre: lang === 'es' ? 'Género' : 'Genre',
      director: 'Director',
      cast: lang === 'es' ? 'Reparto' : 'Cast',
      keyword: lang === 'es' ? 'Temática' : 'Keywords',
      decade: lang === 'es' ? 'Época' : 'Decade',
      country: lang === 'es' ? 'País' : 'Country',
      lang: lang === 'es' ? 'Idioma' : 'Language',
      company: lang === 'es' ? 'Productora' : 'Studio',
      rating: lang === 'es' ? 'Valoración' : 'Rating',
      runtime: lang === 'es' ? 'Duración' : 'Runtime',
    };

    // Top categories by relative contribution
    const topCats = Object.entries(breakdown.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat, frac]) => `${catLabels[cat] ?? cat} ${Math.round(frac * 100)}%`)
      .join(', ');

    const coveragePct = Math.round(breakdown.coverage * 100);
    const coverageLabel = lang === 'es' ? `Datos: ${coveragePct}%` : `Data: ${coveragePct}%`;

    return topCats ? `${base}\n${topCats}\n${coverageLabel}` : `${base}\n${coverageLabel}`;
  }

  function FilmCard({ film }: { film: Film }) {
    const ratingValue = film.rating ? film.rating.toFixed(1) : null;
    const viewersFormatted = formatViewerCount(film.viewers);
    const viewersTooltip = viewersFormatted
      ? (lang === 'es'
        ? t(lang, 'viewersLabel', film.viewers!.toLocaleString('es-ES'))
        : t(lang, 'viewersLabel', film.viewers!.toLocaleString('en-US')))
      : '';

    const filmMatchScore = matchScores[film.id];
    const filmBreakdown = breakdowns[film.id];
    const showMatch = recommendReady && filmMatchScore !== undefined;
    const scoreTooltip = showMatch ? buildScoreTooltip(filmMatchScore, filmBreakdown, lang) : '';

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
            {showMatch && (
              <div
                className={`match-score ${filmMatchScore >= 70 ? 'high' : filmMatchScore >= 40 ? 'medium' : 'low'}`}
                title={scoreTooltip}
              >
                <span className="match-value">{filmMatchScore}%</span>
              </div>
            )}
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
                <img src="/assets/letterboxd.svg" className="letterboxd-icon" alt="LB" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '🎥️'; }} />
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
  const lbHasData = !!(watchlistUrls || watchedUrls || recommendReady || enrichmentTotal > 0);
  const lbFilterActive = !!(
    (watchlistUrls && watchlistActive) ||
    (watchedUrls && watchedActive)
  );

  return (
    <div className="container" onClick={() => { setOpenPopupId(null); }}>
      {/* Header */}
      <header>
        <div className="header-top-row">
          <AuthButton lang={lang} userId={initialUserId} userEmail={initialUserEmail} />
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => setLang('es')}>ES</button>
            <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          </div>
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
          onClick={(e) => { try { (e.target as any).showPicker(); } catch { } }}
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
          {/* Hidden file inputs */}
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
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleZipUpload(file);
              e.target.value = '';
            }}
          />

          {/* Single Letterboxd button */}
          <button
            className={`lb-open-btn${lbHasData ? ' has-data' : ''}${lbFilterActive ? ' filter-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowLbModal(true); }}
          >
            <img src="/assets/letterboxd.svg" className="lb-open-btn-icon" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span>Letterboxd</span>
            {lbFilterActive && <span className="lb-active-dot" />}
          </button>

          {/* Clear filters */}
          <button className="clear-filters-btn" title={t(lang, 'clearFiltersTitle')} onClick={clearAllFilters}>
            <span>{t(lang, 'clearFilters')}</span>
          </button>
        </div>
      </div>

      {/* Stats + Sort toggle */}
      <div className="stats">
        <span>{t(lang, 'filmCount', filteredFilms.length)}</span>
        {recommendReady && (
          <button
            className={`sort-toggle ${sortByMatch ? 'active' : ''}`}
            onClick={() => setSortByMatch(!sortByMatch)}
          >
            {sortByMatch ? t(lang, 'sortByRating') : t(lang, 'sortByMatch')}
          </button>
        )}
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

      {/* Letterboxd Modal */}
      {(showLbModal || lbModalClosing) && (
        <div className={`lb-modal-overlay${lbModalClosing ? ' closing' : ''}`} onClick={closeLbModal}>
          <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-header">
              <div className="lb-modal-title">
                <img src="/assets/letterboxd.svg" className="lb-modal-logo" alt="Letterboxd" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span>Letterboxd</span>
              </div>
              <button className="lb-modal-close" onClick={closeLbModal}>&times;</button>
            </div>

            <div className="lb-modal-body">

              {/* How to get your data */}
              <section className="lb-modal-section lb-instructions">
                <h3 className="lb-section-title">{t(lang, 'lbHowToTitle')}</h3>
                <ol className="lb-steps">
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep1') }} />
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep2') }} />
                  <li dangerouslySetInnerHTML={{ __html: t(lang, 'lbStep3') }} />
                </ol>
                {!initialUserId && (
                  <p className="lb-persistence-note">{t(lang, 'lbSignInPrompt')}</p>
                )}
              </section>

              {/* ZIP upload (authenticated) */}
              {initialUserId && (
                <section className="lb-modal-section">
                  <h3 className="lb-section-title">{t(lang, 'lbRecommendationsTitle')}</h3>
                  <div className="lb-upload-row">
                    <button
                      className={`lb-upload-btn${enrichmentPolling ? ' polling' : ''}`}
                      onClick={() => zipInputRef.current?.click()}
                      disabled={enrichmentPolling}
                    >
                      {enrichmentPolling
                        ? t(lang, 'uploadProgress', enrichmentTotal > 0 ? Math.round((enrichmentProcessed / enrichmentTotal) * 100) : 0)
                        : enrichmentTotal > 0
                          ? t(lang, 'reuploadLabel')
                          : t(lang, 'zipUploadLabel')}
                    </button>
                  </div>
                  {recommendReady && (
                    <div className="lb-stat">{t(lang, 'enrichmentDone')}</div>
                  )}
                  {(enrichmentPolling || (enrichmentTotal > 0 && !recommendReady)) && (
                    <div className="lb-progress">
                      <div className="lb-progress-bar" style={{ width: enrichmentTotal > 0 ? `${(enrichmentProcessed / enrichmentTotal) * 100}%` : '0%' }} />
                      <span className="lb-progress-label">
                        {enrichmentTotal > 0
                          ? t(lang, 'uploadProgressDetail', enrichmentProcessed, enrichmentTotal)
                          : t(lang, 'uploadStarting')}
                      </span>
                    </div>
                  )}
                  <p className="lb-reupload-note">{t(lang, 'reuploadHint')}</p>
                </section>
              )}

              {/* Filters section — only shown when there's data to filter on */}
              {(watchlistUrls || watchedUrls) && (
                <section className="lb-modal-section">
                  <div className="lb-section-header">
                    <h3 className="lb-section-title">{t(lang, 'lbFiltersTitle')}</h3>
                    <button className="lb-clear-data-btn" onClick={() => clearLetterboxdData()}>{t(lang, 'removeLetterboxdData')}</button>
                  </div>

                  {/* Watchlist filter */}
                  {watchlistUrls && (
                    <div className="lb-filter-row">
                      <div className="lb-filter-info">
                        <span className="lb-filter-label">{t(lang, 'lbWatchlistLabel')}</span>
                        <span className="lb-filter-count">{t(lang, 'watchlistCount', watchlistUrls.size)}</span>
                      </div>
                      <div className="lb-filter-controls">
                        <label className="toggle-switch" title={t(lang, 'watchlistToggleTitle')}>
                          <input
                            type="checkbox"
                            checked={watchlistActive}
                            onChange={(e) => {
                              setWatchlistActive(e.target.checked);
                              if (initialUserId) savePreference({ watchlist_active: e.target.checked });
                            }}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Watched: hide already-watched toggle */}
                  {watchedUrls && (
                    <div className="lb-filter-row">
                      <div className="lb-filter-info">
                        <span className="lb-filter-label">{t(lang, 'lbWatchedLabel')}</span>
                        <span className="lb-filter-count">{t(lang, 'watchedCount', watchedUrls.size)}</span>
                      </div>
                      <div className="lb-filter-controls">
                        <label className="toggle-switch" title={t(lang, 'watchedToggleTitle')}>
                          <input
                            type="checkbox"
                            checked={watchedActive && !showWatched}
                            onChange={(e) => {
                              const hide = e.target.checked;
                              setWatchedActive(hide);
                              setShowWatched(!hide);
                              if (initialUserId) savePreference({ watched_active: hide });
                            }}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

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
