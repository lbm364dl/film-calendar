'use client';

import { useRef } from 'react';
import { formatDateInputValue, getLocalTodayStart } from '@/lib/film-helpers';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import TheaterMultiSelect from './TheaterMultiSelect';

interface FiltersGridProps {
  lang: LangKey;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  // Theater multi-select
  selectedTheaters: Set<string>;
  onToggleTheater: (value: string) => void;
  onToggleTheaterGroup: (childValues: string[], checked: boolean) => void;
  onSelectAllTheaters: () => void;
  onSelectNoneTheaters: () => void;
  // Letterboxd
  lbHasData: boolean;
  lbFilterActive: boolean;
  onOpenLbModal: () => void;
  // Actions
  onOpenMoreFilters: () => void;
  activeAdvancedFilterCount: number;
  onClearAllFilters: () => void;
  // File inputs
  zipInputRef: React.RefObject<HTMLInputElement | null>;
  onZipUpload: (file: File) => void;
  onHelp: (title: string, body: string) => void;
}

export default function FiltersGrid({
  lang,
  searchTerm, setSearchTerm,
  selectedDate, setSelectedDate,
  selectedTheaters, onToggleTheater, onToggleTheaterGroup, onSelectAllTheaters, onSelectNoneTheaters,
  lbHasData, lbFilterActive, onOpenLbModal,
  onOpenMoreFilters, activeAdvancedFilterCount,
  zipInputRef, onZipUpload, onHelp, onClearAllFilters,
}: FiltersGridProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateMin = formatDateInputValue(getLocalTodayStart());
  const dateLocale = lang === 'es' ? 'es-ES' : 'en-GB';
  const dateDisplayValue = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="filters-grid">
      {/* Hidden file input for ZIP */}
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

      {/* Row 1: Search + More filters */}
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

      <button
        type="button"
        className="more-filters-btn"
        onClick={(e) => { e.stopPropagation(); onOpenMoreFilters(); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="18" x2="20" y2="18"/>
          <circle cx="8" cy="6" r="2" fill="currentColor"/>
          <circle cx="16" cy="12" r="2" fill="currentColor"/>
          <circle cx="10" cy="18" r="2" fill="currentColor"/>
        </svg>
        <span>{t(lang, 'moreFilters')}</span>
        {activeAdvancedFilterCount > 0 && (
          <span className="filter-badge">{activeAdvancedFilterCount}</span>
        )}
      </button>

      {/* Row 2: Date + Letterboxd + Theater */}
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
        data-display-value={dateDisplayValue}
        lang={dateLocale}
      />

      <button
        type="button"
        className={`lb-grid-btn${lbHasData ? ' has-data' : ''}${lbFilterActive ? ' filter-active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onOpenLbModal(); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/letterboxd.svg" className="lb-grid-btn-icon" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <span>Letterboxd</span>
      </button>

      <TheaterMultiSelect
        lang={lang}
        selectedTheaters={selectedTheaters}
        onToggleTheater={onToggleTheater}
        onToggleGroup={onToggleTheaterGroup}
        onSelectAll={onSelectAllTheaters}
        onSelectNone={onSelectNoneTheaters}
        onHelp={() => onHelp(t(lang, 'theaterTooltipTitle'), t(lang, 'theaterTooltipBody'))}
      />

      <button type="button" className="clear-grid-btn" title={t(lang, 'clearFiltersTitle')} onClick={onClearAllFilters}>
        &times;
      </button>
    </div>
  );
}
