'use client';

import { useCallback, useState } from 'react';
import { t, translateGenre, shortenCountry } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import {
  RUNTIME_CATEGORIES, DAY_LABELS,
  THEATER_GROUPS, ALL_THEATER_VALUES,
} from '@/lib/constants';
import { handleChipRangeToggle } from '@/hooks/useFilmFilters';
import type { DecadeEntry } from '@/hooks/useFilmFilters';
import ChipRangeFilter from './ChipRangeFilter';
import MultiSelectDropdown from './MultiSelectDropdown';

interface MoreFiltersModalProps {
  show: boolean;
  closing: boolean;
  onClose: () => void;
  lang: LangKey;
  decades: DecadeEntry[];
  selectedDecades: Set<number>;
  setSelectedDecades: (v: Set<number>) => void;
  selectedRuntimeCategories: Set<number>;
  setSelectedRuntimeCategories: (v: Set<number>) => void;
  selectedDays: Set<number>;
  setSelectedDays: (v: Set<number>) => void;
  allGenres: string[];
  selectedGenres: Set<string> | null;
  setSelectedGenres: (v: Set<string>) => void;
  allCountries: string[];
  selectedCountries: Set<string> | null;
  setSelectedCountries: (v: Set<string>) => void;
  allLanguages: string[];
  selectedLanguages: Set<string> | null;
  setSelectedLanguages: (v: Set<string>) => void;
  versionFilter: 'original' | 'dubbed';
  setVersionFilter: (v: 'original' | 'dubbed') => void;
  specialFilter: boolean;
  setSpecialFilter: (v: boolean) => void;
  lastChanceFilter: boolean;
  setLastChanceFilter: (v: boolean) => void;
  // Theater multi-select (mobile surfaces this inside the sheet; desktop keeps
  // the top-level pill, but we render it here too so both breakpoints agree
  // on state).
  selectedTheaters: Set<string>;
  onToggleTheater: (value: string) => void;
  onToggleTheaterGroup: (childValues: string[], checked: boolean) => void;
  onSelectAllTheaters: () => void;
  onSelectNoneTheaters: () => void;
  activeAdvancedFilterCount: number;
  resultsCount: number;
  onClearAll: () => void;
  onHelp: (title: string, body: string) => void;
}

// Initial number of theater rows shown before "mostrar N cines más" toggle.
const CINES_COLLAPSED_ROWS = 5;

export default function MoreFiltersModal({
  show, closing, onClose, lang,
  decades, selectedDecades, setSelectedDecades,
  selectedRuntimeCategories, setSelectedRuntimeCategories,
  selectedDays, setSelectedDays,
  allGenres, selectedGenres, setSelectedGenres,
  allCountries, selectedCountries, setSelectedCountries,
  allLanguages, selectedLanguages, setSelectedLanguages,
  versionFilter, setVersionFilter,
  specialFilter, setSpecialFilter,
  lastChanceFilter, setLastChanceFilter,
  selectedTheaters, onToggleTheater, onToggleTheaterGroup,
  onSelectAllTheaters, onSelectNoneTheaters,
  activeAdvancedFilterCount, resultsCount, onClearAll,
  onHelp,
}: MoreFiltersModalProps) {
  const [cinesExpanded, setCinesExpanded] = useState(false);
  const toggleVersion = useCallback(() => {
    setVersionFilter(versionFilter === 'original' ? 'dubbed' : 'original');
  }, [versionFilter, setVersionFilter]);

  const makeToggle = (selected: Set<string> | null, setter: (v: Set<string>) => void) =>
    (v: string) => {
      if (!selected) return;
      const next = new Set(selected);
      if (next.has(v)) next.delete(v); else next.add(v);
      setter(next);
    };

  if (!show && !closing) return null;

  const versionLabel = versionFilter === 'original'
    ? t(lang, 'versionOriginal')
    : t(lang, 'versionDubbed');

  const dayLabels = DAY_LABELS[lang] || DAY_LABELS.en;
  const runtimeLabels = RUNTIME_CATEGORIES.map(c => c.label);

  const activeSubtitle = activeAdvancedFilterCount > 0
    ? (lang === 'es'
        ? `${activeAdvancedFilterCount} filtro${activeAdvancedFilterCount === 1 ? '' : 's'} activo${activeAdvancedFilterCount === 1 ? '' : 's'}`
        : `${activeAdvancedFilterCount} filter${activeAdvancedFilterCount === 1 ? '' : 's'} active`)
    : (lang === 'es' ? 'Afinar búsqueda' : 'Refine search');

  return (
    <div className={`filter-modal${show ? ' show' : ''}${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="filter-modal-content" onClick={e => e.stopPropagation()}>
        <div className="filter-modal-header">
          <div className="filter-modal-title">
            <h3>{t(lang, 'moreFilters')}</h3>
            <div className="filter-modal-subtitle">{activeSubtitle}</div>
          </div>
          <button type="button" className="filter-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="filter-modal-body">

        {/* Cines — flat checklist with collapse-after-N. On desktop the top-level
            theater pill still exists and edits the same state, so either surface
            stays in sync. On mobile the pill is hidden (see globals.css) and this
            section is the only entry point. */}
        <MoreFiltersCines
          lang={lang}
          selectedTheaters={selectedTheaters}
          onToggleTheater={onToggleTheater}
          onToggleGroup={onToggleTheaterGroup}
          onSelectAll={onSelectAllTheaters}
          onSelectNone={onSelectNoneTheaters}
          expanded={cinesExpanded}
          onToggleExpanded={() => setCinesExpanded(v => !v)}
          onHelp={() => onHelp(t(lang, 'theaterTooltipTitle'), t(lang, 'theaterTooltipBody'))}
        />

        {decades.length > 0 && (
          <ChipRangeFilter
            id="decades"
            lang={lang}
            label={t(lang, 'decades')}
            chips={decades.map(d => d.label)}
            selectedIndices={selectedDecades}
            onToggle={(idx) => setSelectedDecades(handleChipRangeToggle(selectedDecades, idx))}
            onReset={() => setSelectedDecades(new Set())}
            onHelp={() => onHelp(t(lang, 'decadeHelpTitle'), t(lang, 'decadeHelpBody'))}
          />
        )}

        <ChipRangeFilter
          id="runtime"
          lang={lang}
          label={t(lang, 'runtime')}
          chips={runtimeLabels}
          selectedIndices={selectedRuntimeCategories}
          onToggle={(idx) => setSelectedRuntimeCategories(handleChipRangeToggle(selectedRuntimeCategories, idx))}
          onReset={() => setSelectedRuntimeCategories(new Set())}
        />

        <ChipRangeFilter
          id="days"
          lang={lang}
          label={t(lang, 'dayOfWeek')}
          chips={dayLabels}
          selectedIndices={selectedDays}
          onToggle={(idx) => setSelectedDays(handleChipRangeToggle(selectedDays, idx))}
          onReset={() => setSelectedDays(new Set())}
        />

        <div className="filter-section filter-multiselect-row">
          {selectedGenres && (
            <MultiSelectDropdown
              id="genre"
              lang={lang}
              allValues={allGenres}
              selectedValues={selectedGenres}
              onToggle={makeToggle(selectedGenres, setSelectedGenres)}
              onSelectAll={() => setSelectedGenres(new Set(allGenres))}
              onSelectNone={() => setSelectedGenres(new Set())}
              translateFn={(g) => translateGenre(g, lang)}
              triggerLabelKey="nGenresSelected"
              searchPlaceholderKey="searchGenres"
            />
          )}

          {selectedCountries && (
            <MultiSelectDropdown
              id="country"
              lang={lang}
              allValues={allCountries}
              selectedValues={selectedCountries}
              onToggle={makeToggle(selectedCountries, setSelectedCountries)}
              onSelectAll={() => setSelectedCountries(new Set(allCountries))}
              onSelectNone={() => setSelectedCountries(new Set())}
              translateFn={shortenCountry}
              triggerLabelKey="nCountriesSelected"
              searchPlaceholderKey="searchCountries"
              onHelp={() => onHelp(t(lang, 'countryTooltipTitle'), t(lang, 'countryTooltipBody'))}
            />
          )}

          {selectedLanguages && (
            <MultiSelectDropdown
              id="language"
              lang={lang}
              allValues={allLanguages}
              selectedValues={selectedLanguages}
              onToggle={makeToggle(selectedLanguages, setSelectedLanguages)}
              onSelectAll={() => setSelectedLanguages(new Set(allLanguages))}
              onSelectNone={() => setSelectedLanguages(new Set())}
              triggerLabelKey="nLanguagesSelected"
              searchPlaceholderKey="searchLanguages"
              onHelp={() => onHelp(t(lang, 'languageTooltipTitle'), t(lang, 'languageTooltipBody'))}
            />
          )}
        </div>

        <div className="filter-section filter-toggles-grid">
          <button
            type="button"
            className={`toggle-filter-btn${versionFilter === 'original' ? ' active' : ''}`}
            onClick={toggleVersion}
          >
            <span>{versionLabel}</span>
          </button>
          <button
            type="button"
            className={`toggle-filter-btn${specialFilter ? ' active' : ''}`}
            onClick={() => setSpecialFilter(!specialFilter)}
          >
            <span>{t(lang, 'specialFilterFull')}</span>
          </button>
          <button
            type="button"
            className={`toggle-filter-btn${lastChanceFilter ? ' active' : ''}`}
            onClick={() => setLastChanceFilter(!lastChanceFilter)}
          >
            <span>{t(lang, 'lastChance')}</span>
            <span className="info-icon" onClick={(e) => { e.stopPropagation(); onHelp(t(lang, 'lastChanceHelpTitle'), t(lang, 'lastChanceHelpBody')); }}>?</span>
          </button>
        </div>

        </div>

        <div className="filter-modal-footer-bar">
          <button
            type="button"
            className="filter-clear-link"
            onClick={(e) => { e.stopPropagation(); onClearAll(); }}
          >{lang === 'es' ? 'Limpiar todos los filtros' : 'Clear all filters'}</button>
          <div className="filter-footer-right">
            <button
              type="button"
              className="filter-cancel-btn"
              onClick={onClose}
            >{lang === 'es' ? 'Cancelar' : 'Cancel'}</button>
            <button
              type="button"
              className="filter-apply-btn"
              onClick={onClose}
            >{lang === 'es' ? `Ver ${resultsCount} resultados` : `Show ${resultsCount} results`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cines section ────────────────────────────────────────────────────────────
// Flat checklist, grouped by parent (Renoir, Cinesa, Yelmo, Embajadores get a
// group checkbox + child rows). We show the first N rows collapsed by default
// and expose a "mostrar N cines más" toggle, matching DC mobile.

interface MoreFiltersCinesProps {
  lang: LangKey;
  selectedTheaters: Set<string>;
  onToggleTheater: (value: string) => void;
  onToggleGroup: (childValues: string[], checked: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onHelp: () => void;
}

function MoreFiltersCines({
  lang, selectedTheaters,
  onToggleTheater, onToggleGroup, onSelectAll, onSelectNone,
  expanded, onToggleExpanded, onHelp,
}: MoreFiltersCinesProps) {
  // Flatten THEATER_GROUPS into render rows: a group with children becomes a
  // group-header row + its child rows; single entries become a leaf row.
  type Row =
    | { kind: 'group'; label: string; childValues: string[] }
    | { kind: 'child'; label: string; value: string; groupLabel: string }
    | { kind: 'leaf'; label: string; value: string };

  const rows: Row[] = [];
  for (const g of THEATER_GROUPS) {
    if (g.children) {
      rows.push({ kind: 'group', label: g.label, childValues: g.children.map(c => c.value) });
      for (const c of g.children) {
        rows.push({ kind: 'child', label: c.label, value: c.value, groupLabel: g.label });
      }
    } else if (g.value) {
      rows.push({ kind: 'leaf', label: g.label, value: g.value });
    }
  }

  const visibleRows = expanded ? rows : rows.slice(0, CINES_COLLAPSED_ROWS);
  const hiddenCount = rows.length - visibleRows.length;
  const count = t(lang, 'nTheatersSelected', selectedTheaters.size, ALL_THEATER_VALUES.length);

  return (
    <div className="filter-section filter-section-cines">
      <div className="filter-section-header">
        <div className="filter-section-header-left">
          <span className="filter-section-label">
            {lang === 'es' ? 'Cines' : 'Theaters'}
          </span>
          <span
            className="info-icon"
            onClick={(e) => { e.stopPropagation(); onHelp(); }}
          >?</span>
        </div>
        <div className="chip-actions">
          <button type="button" className="chip-action-btn" onClick={onSelectAll}>{t(lang, 'selectAll')}</button>
          <button type="button" className="chip-action-btn" onClick={onSelectNone}>{t(lang, 'selectNone')}</button>
        </div>
      </div>

      <div className="filter-section-cines-count">{count}</div>

      <div className="filter-section-cines-list">
        {visibleRows.map((row, i) => {
          if (row.kind === 'group') {
            const selectedCount = row.childValues.filter(v => selectedTheaters.has(v)).length;
            const allSelected = selectedCount === row.childValues.length;
            const someSelected = selectedCount > 0 && !allSelected;
            return (
              <label key={`g-${row.label}-${i}`} className="cines-row cines-row-group">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onToggleGroup(row.childValues, !allSelected)}
                />
                <span className="cines-row-label">{row.label}</span>
              </label>
            );
          }
          if (row.kind === 'child') {
            return (
              <label key={`c-${row.value}-${i}`} className="cines-row cines-row-child">
                <input
                  type="checkbox"
                  checked={selectedTheaters.has(row.value)}
                  onChange={() => onToggleTheater(row.value)}
                />
                <span className="cines-row-label">{row.label}</span>
              </label>
            );
          }
          return (
            <label key={`l-${row.value}-${i}`} className="cines-row">
              <input
                type="checkbox"
                checked={selectedTheaters.has(row.value)}
                onChange={() => onToggleTheater(row.value)}
              />
              <span className="cines-row-label">{row.label}</span>
            </label>
          );
        })}
        {hiddenCount > 0 && !expanded && (
          <button type="button" className="cines-expand-btn" onClick={onToggleExpanded}>
            {lang === 'es'
              ? `mostrar ${hiddenCount} cines más`
              : `show ${hiddenCount} more theaters`}
          </button>
        )}
        {expanded && rows.length > CINES_COLLAPSED_ROWS && (
          <button type="button" className="cines-expand-btn" onClick={onToggleExpanded}>
            {lang === 'es' ? 'mostrar menos' : 'show less'}
          </button>
        )}
      </div>
    </div>
  );
}
