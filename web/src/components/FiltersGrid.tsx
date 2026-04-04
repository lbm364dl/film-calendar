'use client';

import { useMemo, useRef } from 'react';
import { formatDateInputValue, getLocalTodayStart } from '@/lib/film-helpers';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';

interface FiltersGridProps {
  lang: LangKey;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedTheater: string;
  setSelectedTheater: (v: string) => void;
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  yearMin: number;
  setYearMin: (v: number) => void;
  yearMax: number;
  setYearMax: (v: number) => void;
  yearBoundsMin: number;
  yearBoundsMax: number;
  lbHasData: boolean;
  lbFilterActive: boolean;
  onOpenLbModal: () => void;
  onClearAllFilters: () => void;
  watchlistInputRef: React.RefObject<HTMLInputElement | null>;
  watchedInputRef: React.RefObject<HTMLInputElement | null>;
  zipInputRef: React.RefObject<HTMLInputElement | null>;
  onCsvUpload: (file: File, type: 'watchlist' | 'watched') => void;
  onZipUpload: (file: File) => void;
}

export default function FiltersGrid({
  lang,
  searchTerm, setSearchTerm,
  selectedTheater, setSelectedTheater,
  selectedDate, setSelectedDate,
  yearMin, setYearMin, yearMax, setYearMax,
  yearBoundsMin, yearBoundsMax,
  lbHasData, lbFilterActive,
  onOpenLbModal, onClearAllFilters,
  watchlistInputRef, watchedInputRef, zipInputRef,
  onCsvUpload, onZipUpload,
}: FiltersGridProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateMin = formatDateInputValue(getLocalTodayStart());

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

  return (
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
            if (file) onCsvUpload(file, 'watchlist');
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
            if (file) onCsvUpload(file, 'watched');
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
            if (file) onZipUpload(file);
            e.target.value = '';
          }}
        />

        {/* Single Letterboxd button */}
        <button
          className={`lb-open-btn${lbHasData ? ' has-data' : ''}${lbFilterActive ? ' filter-active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onOpenLbModal(); }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/letterboxd.svg" className="lb-open-btn-icon" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>Letterboxd</span>
          {lbFilterActive && <span className="lb-active-dot" />}
        </button>

        {/* Clear filters */}
        <button className="clear-filters-btn" title={t(lang, 'clearFiltersTitle')} onClick={onClearAllFilters}>
          <span>{t(lang, 'clearFilters')}</span>
        </button>
      </div>
    </div>
  );
}
