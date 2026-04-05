'use client';

import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { normalizeText, getLocalTodayStart, getDateOnly, isSpanishFilm } from '@/lib/film-helpers';
import { ROWS_PER_PAGE, ALL_THEATER_VALUES, RUNTIME_CATEGORIES, CHIP_TO_JS_DAY, OLD_THEATER_MAPPING } from '@/lib/constants';
import type { Film } from '@/lib/types';

export interface DecadeEntry { label: string; start: number; end: number }

interface FilterOptions {
  allFilms: Film[];
  watchlistUrls: Set<string> | null;
  watchedUrls: Set<string> | null;
  watchlistActive: boolean;
  watchedActive: boolean;
  showWatched: boolean;
  matchScores: Record<number, number>;
}

/** Handle chip range selection: if 1 chip is selected and user clicks a different one, select the range. */
export function handleChipRangeToggle(current: Set<number>, clicked: number): Set<number> {
  const next = new Set(current);
  if (current.size === 1 && !current.has(clicked)) {
    const anchor = [...current][0];
    const from = Math.min(anchor, clicked);
    const to = Math.max(anchor, clicked);
    next.clear();
    for (let i = from; i <= to; i++) next.add(i);
  } else {
    if (next.has(clicked)) next.delete(clicked);
    else next.add(clicked);
  }
  return next;
}

// ── localStorage helpers for theater persistence ───────────────────────────

function loadTheaterSelection(): Set<string> {
  if (typeof window === 'undefined') return new Set(ALL_THEATER_VALUES);
  try {
    const stored = localStorage.getItem('selectedTheaters');
    if (!stored) return new Set(ALL_THEATER_VALUES);
    const arr: string[] = JSON.parse(stored);
    // Migrate old chain names to individual locations
    const migrated: string[] = [];
    for (const v of arr) {
      if (OLD_THEATER_MAPPING[v]) {
        migrated.push(...OLD_THEATER_MAPPING[v]);
      } else {
        migrated.push(v);
      }
    }
    // Only keep values that actually exist
    const valid = migrated.filter(v => ALL_THEATER_VALUES.includes(v));
    return valid.length > 0 ? new Set(valid) : new Set(ALL_THEATER_VALUES);
  } catch {
    return new Set(ALL_THEATER_VALUES);
  }
}

function saveTheaterSelection(theaters: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('selectedTheaters', JSON.stringify([...theaters]));
  } catch { /* ignore */ }
}

export function useFilmFilters(options: FilterOptions) {
  const {
    allFilms,
    watchlistUrls, watchedUrls, watchlistActive, watchedActive, showWatched,
    matchScores,
  } = options;

  // ── Basic filters ──────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [displayedCount, setDisplayedCount] = useState(0);

  // ── Theater multi-select ───────────────────────────────────────────────
  const [selectedTheaters, setSelectedTheaters] = useState<Set<string>>(() => loadTheaterSelection());

  // Persist theater selection
  useEffect(() => { saveTheaterSelection(selectedTheaters); }, [selectedTheaters]);

  const toggleTheater = useCallback((value: string) => {
    setSelectedTheaters(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }, []);

  const toggleTheaterGroup = useCallback((childValues: string[], checked: boolean) => {
    setSelectedTheaters(prev => {
      const next = new Set(prev);
      for (const v of childValues) {
        if (checked) next.add(v); else next.delete(v);
      }
      return next;
    });
  }, []);

  const selectAllTheaters = useCallback(() => setSelectedTheaters(new Set(ALL_THEATER_VALUES)), []);
  const selectNoneTheaters = useCallback(() => setSelectedTheaters(new Set()), []);

  // ── Genre/Country/Language multi-selects ────────────────────────────────
  const [selectedGenres, setSelectedGenres] = useState<Set<string> | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<Set<string> | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string> | null>(null);

  // ── Chip filters ───────────────────────────────────────────────────────
  const [selectedDecades, setSelectedDecades] = useState<Set<number>>(new Set());
  const [selectedRuntimeCategories, setSelectedRuntimeCategories] = useState<Set<number>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());

  // ── Toggle filters ─────────────────────────────────────────────────────
  const [versionFilter, setVersionFilter] = useState<'all' | 'original' | 'dubbed'>('original');
  const [sortBy, setSortBy] = useState<'rating' | 'viewers' | 'affinity'>('rating');
  const [specialFilter, setSpecialFilter] = useState(false);
  const [lastChanceFilter, setLastChanceFilter] = useState(false);

  // ── Computed: unique values from film data ─────────────────────────────

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFilms) for (const g of f.genres) set.add(g);
    return [...set].sort();
  }, [allFilms]);

  const allCountries = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFilms) for (const c of f.country) set.add(c);
    return [...set].sort();
  }, [allFilms]);

  const allLanguages = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFilms) for (const l of f.primaryLanguage) set.add(l);
    return [...set].sort();
  }, [allFilms]);

  const decades = useMemo<DecadeEntry[]>(() => {
    const years = allFilms.map(f => f.year).filter((y): y is number => y != null);
    if (years.length === 0) return [];
    // Group anything before 1920 into "< 20s"
    const decadeSet = new Set<number>();
    let hasPreTwenties = false;
    for (const y of years) {
      const d = Math.floor(y / 10) * 10;
      if (d < 1920) hasPreTwenties = true;
      else decadeSet.add(d);
    }
    const result: DecadeEntry[] = [];
    if (hasPreTwenties) result.push({ label: '< 20s', start: 0, end: 1919 });
    for (const d of [...decadeSet].sort()) {
      result.push({ label: `${d}s`, start: d, end: d + 9 });
    }
    return result;
  }, [allFilms]);

  // ── Computed: last chance film IDs ──────────────────────────────────────

  const lastChanceFilmIds = useMemo(() => {
    const ids = new Set<number>();
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    for (const film of allFilms) {
      const futureDates = film.dates
        .map(d => getDateOnly(d.timestamp))
        .filter((dt): dt is Date => dt != null && dt >= now);
      if (futureDates.length === 0) continue;
      const lastDate = new Date(Math.max(...futureDates.map(d => d.getTime())));
      if (lastDate <= threeDaysLater) ids.add(film.id);
    }
    return ids;
  }, [allFilms]);

  // ── Initialize genre/country/language to "all" when data loads ─────────

  useEffect(() => {
    if (allGenres.length > 0 && selectedGenres === null) setSelectedGenres(new Set(allGenres));
  }, [allGenres, selectedGenres]);

  useEffect(() => {
    if (allCountries.length > 0 && selectedCountries === null) setSelectedCountries(new Set(allCountries));
  }, [allCountries, selectedCountries]);

  useEffect(() => {
    if (allLanguages.length > 0 && selectedLanguages === null) setSelectedLanguages(new Set(allLanguages));
  }, [allLanguages, selectedLanguages]);

  // ── Main filter pipeline ───────────────────────────────────────────────

  const filteredFilms = useMemo(() => {
    const todayStart = new Date();
    const search = normalizeText(searchTerm);
    const allTheatersSelected = selectedTheaters.size === ALL_THEATER_VALUES.length;

    return allFilms
      .map(film => {
        // Session-level filters
        const futureDates = film.dates.filter(d => {
          const dt = getDateOnly(d.timestamp);
          return dt && dt >= todayStart;
        });
        const sessionFiltered = futureDates.filter(d => {
          // Theater
          if (!allTheatersSelected && !selectedTheaters.has(d.location)) return false;
          // Date
          if (selectedDate && !d.timestamp.startsWith(selectedDate)) return false;
          // Version
          if (versionFilter !== 'all' && !isSpanishFilm(film)) {
            if (versionFilter === 'original' && d.version === 'dubbed') return false;
            if (versionFilter === 'dubbed' && d.version !== 'dubbed') return false;
          }
          // Day of week
          if (selectedDays.size > 0) {
            const dt = getDateOnly(d.timestamp);
            if (dt) {
              const jsDay = dt.getDay();
              if (![...selectedDays].some(ci => CHIP_TO_JS_DAY[ci] === jsDay)) return false;
            }
          }
          return true;
        });
        return { ...film, dates: sessionFiltered };
      })
      .filter(film => {
        if (film.dates.length === 0) return false;

        // Search
        if (search) {
          const matchesSearch =
            normalizeText(film.title).includes(search) ||
            (film.titleEn && normalizeText(film.titleEn).includes(search)) ||
            (film.director && normalizeText(film.director).includes(search));
          if (!matchesSearch) return false;
        }

        // Decade
        if (selectedDecades.size > 0 && decades.length > 0) {
          if (!film.year) return false;
          const inDecade = [...selectedDecades].some(idx => {
            const dec = decades[idx];
            return dec && film.year! >= dec.start && film.year! <= dec.end;
          });
          if (!inDecade) return false;
        }

        // Genre
        if (selectedGenres && selectedGenres.size < allGenres.length) {
          if (!film.genres.some(g => selectedGenres.has(g))) return false;
        }

        // Country
        if (selectedCountries && selectedCountries.size < allCountries.length) {
          if (!film.country.some(c => selectedCountries.has(c))) return false;
        }

        // Language
        if (selectedLanguages && selectedLanguages.size < allLanguages.length) {
          if (!film.primaryLanguage.some(l => selectedLanguages.has(l))) return false;
        }

        // Runtime
        if (selectedRuntimeCategories.size > 0) {
          if (!film.runtimeMinutes) return false;
          const inCategory = [...selectedRuntimeCategories].some(idx => {
            const cat = RUNTIME_CATEGORIES[idx];
            return cat && film.runtimeMinutes! >= cat.min && film.runtimeMinutes! <= cat.max;
          });
          if (!inCategory) return false;
        }

        // Special sessions
        if (specialFilter) {
          if (!film.dates.some(d => d.special)) return false;
        }

        // Last chance
        if (lastChanceFilter) {
          if (!lastChanceFilmIds.has(film.id)) return false;
        }

        // Watchlist
        if (watchlistUrls && watchlistActive) {
          if (!(film.letterboxdShortUrl && watchlistUrls.has(film.letterboxdShortUrl))) return false;
        }

        // Watched (hide)
        if (watchedUrls && watchedActive && !showWatched) {
          if (film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl)) return false;
        }

        return true;
      });
  }, [allFilms, searchTerm, selectedTheaters, selectedDate, versionFilter, selectedDays,
      selectedDecades, decades, selectedGenres, allGenres, selectedCountries, allCountries,
      selectedLanguages, allLanguages, selectedRuntimeCategories, specialFilter, lastChanceFilter,
      lastChanceFilmIds, watchlistUrls, watchedUrls, watchlistActive, watchedActive, showWatched]);

  // ── Sort ───────────────────────────────────────────────────────────────

  const sortedFilms = useMemo(() => {
    return [...filteredFilms].sort((a, b) => {
      if (sortBy === 'affinity' && Object.keys(matchScores).length > 0) {
        const scoreA = matchScores[a.id] ?? -1;
        const scoreB = matchScores[b.id] ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      if (sortBy === 'viewers') {
        const va = a.viewers ?? -1;
        const vb = b.viewers ?? -1;
        if (va !== vb) return vb - va;
      }
      // Default / fallback: rating
      if (a.rating !== null && b.rating !== null) return b.rating - a.rating;
      if (a.rating !== null) return -1;
      if (b.rating !== null) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filteredFilms, matchScores, sortBy]);

  // ── Pagination ─────────────────────────────────────────────────────────

  const columnsPerRow = 3;
  const pageSize = columnsPerRow * ROWS_PER_PAGE;

  useEffect(() => {
    setDisplayedCount(pageSize);
  }, [sortedFilms, pageSize]);

  const deferredSorted = useDeferredValue(sortedFilms);
  const isFiltering = sortedFilms !== deferredSorted;
  const visibleFilms = useMemo(() => deferredSorted.slice(0, displayedCount), [deferredSorted, displayedCount]);
  const remaining = deferredSorted.length - displayedCount;

  // ── Count active advanced filters ──────────────────────────────────────

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDecades.size > 0) count++;
    if (selectedRuntimeCategories.size > 0) count++;
    if (selectedDays.size > 0) count++;
    if (versionFilter === 'dubbed') count++;
    if (specialFilter) count++;
    if (lastChanceFilter) count++;
    if (selectedGenres && selectedGenres.size < allGenres.length) count++;
    if (selectedCountries && selectedCountries.size < allCountries.length) count++;
    if (selectedLanguages && selectedLanguages.size < allLanguages.length) count++;
    return count;
  }, [selectedDecades, selectedRuntimeCategories, selectedDays, versionFilter, specialFilter,
      lastChanceFilter, selectedGenres, allGenres, selectedCountries, allCountries, selectedLanguages, allLanguages]);

  // ── Clear all ──────────────────────────────────────────────────────────

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedDate('');
    setSelectedDecades(new Set());
    setSelectedRuntimeCategories(new Set());
    setSelectedDays(new Set());
    setVersionFilter('original');
    setSortBy('rating');
    setSpecialFilter(false);
    setLastChanceFilter(false);
    if (allGenres.length > 0) setSelectedGenres(new Set(allGenres));
    if (allCountries.length > 0) setSelectedCountries(new Set(allCountries));
    if (allLanguages.length > 0) setSelectedLanguages(new Set(allLanguages));
    // Don't reset theater selection — it's a persistent preference
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.pushState({}, '', url);
    }
  }, [allGenres, allCountries, allLanguages]);

  const loadMore = () => setDisplayedCount(prev => prev + pageSize);

  return {
    // Basic
    searchTerm, setSearchTerm,
    selectedDate, setSelectedDate,
    // Theater
    selectedTheaters, toggleTheater, toggleTheaterGroup, selectAllTheaters, selectNoneTheaters,
    // Multi-selects
    selectedGenres, setSelectedGenres,
    selectedCountries, setSelectedCountries,
    selectedLanguages, setSelectedLanguages,
    allGenres, allCountries, allLanguages,
    // Chips
    selectedDecades, setSelectedDecades,
    selectedRuntimeCategories, setSelectedRuntimeCategories,
    selectedDays, setSelectedDays,
    decades,
    // Toggles
    versionFilter, setVersionFilter,
    sortBy, setSortBy,
    specialFilter, setSpecialFilter,
    lastChanceFilter, setLastChanceFilter,
    // Computed
    lastChanceFilmIds, activeAdvancedFilterCount,
    filteredFilms, sortedFilms, visibleFilms, remaining, isFiltering,
    clearAllFilters, loadMore,
  };
}
