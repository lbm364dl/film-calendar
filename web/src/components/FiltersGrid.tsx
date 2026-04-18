'use client';

import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import TheaterMultiSelect from './TheaterMultiSelect';
import { DayStrip, type DayEntry } from './DayStrip';

interface FiltersGridProps {
  lang: LangKey;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  // Day strip + calendar (embedded inline in the filter bar per Direction C)
  days: DayEntry[];
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  onOpenCalendar: () => void;
  // Theater multi-select
  selectedTheaters: Set<string>;
  onToggleTheater: (value: string) => void;
  onToggleTheaterGroup: (childValues: string[], checked: boolean) => void;
  onSelectAllTheaters: () => void;
  onSelectNoneTheaters: () => void;
  // Actions
  onOpenMoreFilters: () => void;
  activeAdvancedFilterCount: number;
  onClearAllFilters: () => void;
  // File inputs
  zipInputRef: React.RefObject<HTMLInputElement | null>;
  onZipUpload: (file: File) => void;
  onHelp: (title: string, body: string) => void;
}

/**
 * Direction C filter bar — one horizontal row on desktop:
 *   search (flexible) · day-strip (flex: 1) · calendar icon · theater pill · más filtros
 * On mobile (<= 768px) it wraps to two rows via CSS.
 *
 * The Letterboxd button has moved out of the filter bar; it now lives in the
 * header-actions area so it's always reachable without taking filter space.
 */
export default function FiltersGrid({
  lang,
  searchTerm, setSearchTerm,
  days, selectedDate, setSelectedDate, onOpenCalendar,
  selectedTheaters, onToggleTheater, onToggleTheaterGroup, onSelectAllTheaters, onSelectNoneTheaters,
  onOpenMoreFilters, activeAdvancedFilterCount,
  zipInputRef, onZipUpload, onHelp, onClearAllFilters,
}: FiltersGridProps) {
  return (
    <div className="filter-bar">
      {/* Hidden file input for ZIP (Letterboxd import flow) */}
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

      {/* Search pill */}
      <div className="filter-bar-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="text"
          id="search"
          placeholder={t(lang, 'searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
        {searchTerm && (
          <button
            type="button"
            className="filter-bar-search-clear"
            onClick={() => setSearchTerm('')}
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {/* Day strip + calendar icon — wrapped together so they share width allocation */}
      <DayStrip
        lang={lang}
        days={days}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onOpenCalendar={onOpenCalendar}
      />

      {/* Theater multi-select — slim pill in the bar */}
      <TheaterMultiSelect
        lang={lang}
        selectedTheaters={selectedTheaters}
        onToggleTheater={onToggleTheater}
        onToggleGroup={onToggleTheaterGroup}
        onSelectAll={onSelectAllTheaters}
        onSelectNone={onSelectNoneTheaters}
        onHelp={() => onHelp(t(lang, 'theaterTooltipTitle'), t(lang, 'theaterTooltipBody'))}
      />

      {/* More filters — pill with active-count badge */}
      <button
        type="button"
        className="more-filters-btn"
        onClick={(e) => { e.stopPropagation(); onOpenMoreFilters(); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="8" cy="6" r="2" fill="currentColor" />
          <circle cx="16" cy="12" r="2" fill="currentColor" />
          <circle cx="10" cy="18" r="2" fill="currentColor" />
        </svg>
        <span>{t(lang, 'moreFilters')}</span>
        {activeAdvancedFilterCount > 0 && (
          <span className="filter-badge">{activeAdvancedFilterCount}</span>
        )}
      </button>

      <button
        type="button"
        className="clear-grid-btn"
        onClick={onClearAllFilters}
        title={t(lang, 'clearFilters')}
        aria-label={t(lang, 'clearFilters')}
      >
        {/* Lucide `filter-x` — filter shape with an × in the top-right. Reads
            immediately as "clear filters" regardless of size. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13.013 3H2l8 9.46V19l4 2v-8.54l.9-1.055" />
          <path d="m22 3-5 5" />
          <path d="m17 3 5 5" />
        </svg>
      </button>
    </div>
  );
}
