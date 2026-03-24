'use client';

import { useState, useMemo, useEffect } from 'react';
import { normalizeText, getLocalTodayStart, getDateOnly, isRenoirLocation, isEmbajadoresLocation } from '@/lib/film-helpers';
import { ROWS_PER_PAGE } from '@/lib/constants';
import type { Film } from '@/lib/types';

interface FilterOptions {
  allFilms: Film[];
  yearBoundsMin: number;
  yearBoundsMax: number;
  watchlistUrls: Set<string> | null;
  watchedUrls: Set<string> | null;
  watchlistActive: boolean;
  watchedActive: boolean;
  showWatched: boolean;
  sortByMatch: boolean;
  matchScores: Record<number, number>;
}

export function useFilmFilters(options: FilterOptions) {
  const {
    allFilms, yearBoundsMin, yearBoundsMax,
    watchlistUrls, watchedUrls, watchlistActive, watchedActive, showWatched,
    sortByMatch, matchScores,
  } = options;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheater, setSelectedTheater] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [yearMin, setYearMin] = useState(yearBoundsMin);
  const [yearMax, setYearMax] = useState(yearBoundsMax);
  const [displayedCount, setDisplayedCount] = useState(0);

  // Sync year bounds when data loads
  useEffect(() => {
    setYearMin(yearBoundsMin);
    setYearMax(yearBoundsMax);
  }, [yearBoundsMin, yearBoundsMax]);

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

  const columnsPerRow = 3;
  const pageSize = columnsPerRow * ROWS_PER_PAGE;

  useEffect(() => {
    setDisplayedCount(pageSize);
  }, [sortedFilms, pageSize]);

  const visibleFilms = useMemo(() => sortedFilms.slice(0, displayedCount), [sortedFilms, displayedCount]);
  const remaining = sortedFilms.length - displayedCount;

  const clearAllFilters = () => {
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
  };

  const loadMore = () => setDisplayedCount(prev => prev + pageSize);

  return {
    searchTerm, setSearchTerm,
    selectedTheater, setSelectedTheater,
    selectedDate, setSelectedDate,
    yearMin, setYearMin,
    yearMax, setYearMax,
    filteredFilms, sortedFilms, visibleFilms, remaining,
    clearAllFilters, loadMore,
  };
}
