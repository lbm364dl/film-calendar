'use client';

import { useCallback } from 'react';
import { t, translateGenre, shortenCountry } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import { RUNTIME_CATEGORIES, DAY_LABELS } from '@/lib/constants';
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
  onHelp: (title: string, body: string) => void;
}

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
  onHelp,
}: MoreFiltersModalProps) {
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

  return (
    <div className={`filter-modal${show ? ' show' : ''}${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="filter-modal-content" onClick={e => e.stopPropagation()}>
        <div className="filter-modal-header">
          <h3>{t(lang, 'moreFilters')}</h3>
          <button type="button" className="filter-modal-close" onClick={onClose}>&times;</button>
        </div>

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
    </div>
  );
}
