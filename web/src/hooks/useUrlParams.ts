'use client';

import { useEffect } from 'react';

interface UrlParamsConfig {
  searchTerm: string;
  selectedTheater: string;
  selectedDate: string;
  yearMin: number;
  yearMax: number;
  yearBoundsMin: number;
  yearBoundsMax: number;
  allFilmsLength: number;
  setSearchTerm: (v: string) => void;
  setSelectedTheater: (v: string) => void;
  setSelectedDate: (v: string) => void;
  setYearMin: (v: number) => void;
  setYearMax: (v: number) => void;
}

export function useUrlParams(config: UrlParamsConfig) {
  const {
    searchTerm, selectedTheater, selectedDate, yearMin, yearMax,
    yearBoundsMin, yearBoundsMax, allFilmsLength,
    setSearchTerm, setSelectedTheater, setSelectedDate, setYearMin, setYearMax,
  } = config;

  // Read on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('search')) setSearchTerm(params.get('search')!);
    if (params.get('theater')) setSelectedTheater(params.get('theater')!);
    if (params.get('date')) setSelectedDate(params.get('date')!);
    if (params.get('min_year')) setYearMin(Number(params.get('min_year')));
    if (params.get('max_year')) setYearMax(Number(params.get('max_year')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update on filter change
  useEffect(() => {
    if (typeof window === 'undefined' || allFilmsLength === 0) return;
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (selectedTheater) params.set('theater', selectedTheater);
    if (selectedDate) params.set('date', selectedDate);
    if (yearMin > yearBoundsMin) params.set('min_year', String(yearMin));
    if (yearMax < yearBoundsMax) params.set('max_year', String(yearMax));
    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
  }, [searchTerm, selectedTheater, selectedDate, yearMin, yearMax, yearBoundsMin, yearBoundsMax, allFilmsLength]);
}
