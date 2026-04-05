'use client';

import { useEffect } from 'react';
import { ALL_THEATER_VALUES, OLD_THEATER_MAPPING, RUNTIME_CATEGORIES } from '@/lib/constants';
import type { DecadeEntry } from './useFilmFilters';

interface UrlParamsConfig {
  // Basic
  searchTerm: string;
  selectedDate: string;
  // Theater
  selectedTheaters: Set<string>;
  // Multi-selects
  selectedGenres: Set<string> | null;
  selectedCountries: Set<string> | null;
  selectedLanguages: Set<string> | null;
  allGenres: string[];
  allCountries: string[];
  allLanguages: string[];
  // Chips
  selectedDecades: Set<number>;
  selectedRuntimeCategories: Set<number>;
  selectedDays: Set<number>;
  decades: DecadeEntry[];
  // Toggles
  versionFilter: 'original' | 'dubbed';
  sortBy: 'rating' | 'viewers' | 'affinity';
  specialFilter: boolean;
  lastChanceFilter: boolean;
  // Data loaded?
  allFilmsLength: number;
  // Setters
  setSearchTerm: (v: string) => void;
  setSelectedDate: (v: string) => void;
  setSelectedTheaters?: (v: Set<string>) => void;
  setSelectedGenres: (v: Set<string>) => void;
  setSelectedCountries: (v: Set<string>) => void;
  setSelectedLanguages: (v: Set<string>) => void;
  setSelectedDecades: (v: Set<number>) => void;
  setSelectedRuntimeCategories: (v: Set<number>) => void;
  setSelectedDays: (v: Set<number>) => void;
  setVersionFilter: (v: 'original' | 'dubbed') => void;
  setSortBy: (v: 'rating' | 'viewers') => void;
  setSpecialFilter: (v: boolean) => void;
  setLastChanceFilter: (v: boolean) => void;
}

export function useUrlParams(config: UrlParamsConfig) {
  const {
    searchTerm, selectedDate,
    selectedTheaters,
    selectedGenres, selectedCountries, selectedLanguages,
    allGenres, allCountries, allLanguages,
    selectedDecades, selectedRuntimeCategories, selectedDays, decades,
    versionFilter, sortBy, specialFilter, lastChanceFilter,
    allFilmsLength,
    setSearchTerm, setSelectedDate,
    setSelectedTheaters,
    setSelectedGenres, setSelectedCountries, setSelectedLanguages,
    setSelectedDecades, setSelectedRuntimeCategories, setSelectedDays,
    setVersionFilter, setSortBy, setSpecialFilter, setLastChanceFilter,
  } = config;

  // Read on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    if (params.get('search')) setSearchTerm(params.get('search')!);
    if (params.get('date')) setSelectedDate(params.get('date')!);

    // Theater: backward compat with old single `theater` param
    const oldTheater = params.get('theater');
    if (oldTheater && setSelectedTheaters) {
      const expanded = OLD_THEATER_MAPPING[oldTheater];
      if (expanded) {
        setSelectedTheaters(new Set(expanded));
      }
    }
    // New: exclude_theaters
    const excludeParam = params.get('exclude_theaters');
    if (excludeParam && setSelectedTheaters) {
      if (excludeParam === 'all') {
        setSelectedTheaters(new Set());
      } else {
        const excluded = new Set(excludeParam.split(','));
        setSelectedTheaters(new Set(ALL_THEATER_VALUES.filter(v => !excluded.has(v))));
      }
    }

    if (params.get('version')) {
      const v = params.get('version')!;
      if (v === 'original' || v === 'dubbed') setVersionFilter(v);
    }
    const sortParam = params.get('sort');
    if (sortParam === 'viewers') setSortBy('viewers');
    // 'affinity' is restored only if scores exist — handled by auto-switch effect
    if (params.get('special') === '1') setSpecialFilter(true);
    if (params.get('lastchance') === '1') setLastChanceFilter(true);

    const decadesParam = params.get('decades');
    if (decadesParam) {
      setSelectedDecades(new Set(decadesParam.split(',').map(Number).filter(n => !isNaN(n))));
    }
    const runtimeParam = params.get('runtime');
    if (runtimeParam) {
      setSelectedRuntimeCategories(new Set(
        runtimeParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n < RUNTIME_CATEGORIES.length)
      ));
    }
    const daysParam = params.get('days');
    if (daysParam) {
      setSelectedDays(new Set(daysParam.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n < 7)));
    }

    const genresParam = params.get('genres');
    if (genresParam) {
      setSelectedGenres(genresParam === 'none' ? new Set() : new Set(genresParam.split(',')));
    }
    const countriesParam = params.get('countries');
    if (countriesParam) {
      setSelectedCountries(countriesParam === 'none' ? new Set() : new Set(countriesParam.split(',')));
    }
    const languagesParam = params.get('languages');
    if (languagesParam) {
      setSelectedLanguages(languagesParam === 'none' ? new Set() : new Set(languagesParam.split(',')));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update URL on filter change
  useEffect(() => {
    if (typeof window === 'undefined' || allFilmsLength === 0) return;
    const params = new URLSearchParams();

    if (searchTerm) params.set('search', searchTerm);
    if (selectedDate) params.set('date', selectedDate);

    // Theater: store excluded theaters (inverted, more compact when most are selected)
    if (selectedTheaters.size < ALL_THEATER_VALUES.length) {
      if (selectedTheaters.size === 0) {
        params.set('exclude_theaters', 'all');
      } else {
        const excluded = ALL_THEATER_VALUES.filter(v => !selectedTheaters.has(v));
        if (excluded.length > 0) params.set('exclude_theaters', excluded.join(','));
      }
    }

    if (versionFilter !== 'original') params.set('version', versionFilter);
    if (sortBy !== 'rating') params.set('sort', sortBy);
    if (specialFilter) params.set('special', '1');
    if (lastChanceFilter) params.set('lastchance', '1');
    if (selectedDecades.size > 0) params.set('decades', [...selectedDecades].join(','));
    if (selectedRuntimeCategories.size > 0) params.set('runtime', [...selectedRuntimeCategories].join(','));
    if (selectedDays.size > 0) params.set('days', [...selectedDays].join(','));

    if (selectedGenres && selectedGenres.size < allGenres.length) {
      params.set('genres', selectedGenres.size === 0 ? 'none' : [...selectedGenres].join(','));
    }
    if (selectedCountries && selectedCountries.size < allCountries.length) {
      params.set('countries', selectedCountries.size === 0 ? 'none' : [...selectedCountries].join(','));
    }
    if (selectedLanguages && selectedLanguages.size < allLanguages.length) {
      params.set('languages', selectedLanguages.size === 0 ? 'none' : [...selectedLanguages].join(','));
    }

    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
  }, [searchTerm, selectedDate, selectedTheaters, versionFilter, sortBy, specialFilter,
      lastChanceFilter, selectedDecades, selectedRuntimeCategories, selectedDays,
      selectedGenres, allGenres, selectedCountries, allCountries, selectedLanguages, allLanguages,
      allFilmsLength]);
}
