'use client';

import { useMemo } from 'react';
import { t, translateGenre, shortenCountry } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import { RUNTIME_CATEGORIES, DAY_LABELS } from '@/lib/constants';
import type { DecadeEntry } from '@/hooks/useFilmFilters';

export interface ActiveFilterChipsProps {
  lang: LangKey;
  // Version (always shown)
  versionFilter: 'original' | 'dubbed';
  setVersionFilter: (v: 'original' | 'dubbed') => void;
  // Chip-range
  decades: DecadeEntry[];
  selectedDecades: Set<number>;
  setSelectedDecades: (v: Set<number>) => void;
  selectedRuntimeCategories: Set<number>;
  setSelectedRuntimeCategories: (v: Set<number>) => void;
  selectedDays: Set<number>;
  setSelectedDays: (v: Set<number>) => void;
  // Multi-select
  allGenres: string[];
  selectedGenres: Set<string> | null;
  setSelectedGenres: (v: Set<string>) => void;
  allCountries: string[];
  selectedCountries: Set<string> | null;
  setSelectedCountries: (v: Set<string>) => void;
  allLanguages: string[];
  selectedLanguages: Set<string> | null;
  setSelectedLanguages: (v: Set<string>) => void;
  // Toggles
  specialFilter: boolean;
  setSpecialFilter: (v: boolean) => void;
  lastChanceFilter: boolean;
  setLastChanceFilter: (v: boolean) => void;
  // Clear all
  onClearAll: () => void;
}

type Chip = { key: string; label: string; onRemove: () => void };

function rangeLabel(indices: Set<number>, labels: string[]): string {
  if (indices.size === 0) return '';
  const arr = [...indices].sort((a, b) => a - b);
  if (arr.length === 1) return labels[arr[0]];
  const first = arr[0];
  const last = arr[arr.length - 1];
  if (arr.length === last - first + 1) return `${labels[first]}–${labels[last]}`;
  return arr.map(i => labels[i]).join(' · ');
}

function summarize(selected: Set<string>, total: number, translate: (v: string) => string, maxInline = 3): string {
  const arr = [...selected];
  if (arr.length <= maxInline) return arr.map(translate).join(' · ');
  return `${arr.slice(0, maxInline).map(translate).join(' · ')} +${arr.length - maxInline}`;
}

export default function ActiveFilterChips(props: ActiveFilterChipsProps) {
  const {
    lang, versionFilter, setVersionFilter,
    decades, selectedDecades, setSelectedDecades,
    selectedRuntimeCategories, setSelectedRuntimeCategories,
    selectedDays, setSelectedDays,
    allGenres, selectedGenres, setSelectedGenres,
    allCountries, selectedCountries, setSelectedCountries,
    allLanguages, selectedLanguages, setSelectedLanguages,
    specialFilter, setSpecialFilter,
    lastChanceFilter, setLastChanceFilter,
    onClearAll,
  } = props;

  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [];

    // Version — always visible; clicking × flips to the opposite so the film
    // list never becomes empty from an accidental removal. Removing from the
    // chip row essentially means "toggle version".
    out.push({
      key: 'version',
      label: versionFilter === 'original' ? 'VOSE' : (lang === 'es' ? 'Doblada' : 'Dubbed'),
      onRemove: () => setVersionFilter(versionFilter === 'original' ? 'dubbed' : 'original'),
    });

    if (selectedDecades.size > 0) {
      out.push({
        key: 'decades',
        label: rangeLabel(selectedDecades, decades.map(d => d.label)),
        onRemove: () => setSelectedDecades(new Set()),
      });
    }

    if (selectedRuntimeCategories.size > 0) {
      out.push({
        key: 'runtime',
        label: rangeLabel(selectedRuntimeCategories, RUNTIME_CATEGORIES.map(c => c.label)),
        onRemove: () => setSelectedRuntimeCategories(new Set()),
      });
    }

    if (selectedDays.size > 0) {
      const dayLabels = DAY_LABELS[lang] || DAY_LABELS.en;
      out.push({
        key: 'days',
        label: rangeLabel(selectedDays, dayLabels),
        onRemove: () => setSelectedDays(new Set()),
      });
    }

    if (selectedGenres && selectedGenres.size > 0 && selectedGenres.size < allGenres.length) {
      out.push({
        key: 'genres',
        label: summarize(selectedGenres, allGenres.length, g => translateGenre(g, lang)),
        onRemove: () => setSelectedGenres(new Set(allGenres)),
      });
    }

    if (selectedCountries && selectedCountries.size > 0 && selectedCountries.size < allCountries.length) {
      out.push({
        key: 'countries',
        label: summarize(selectedCountries, allCountries.length, shortenCountry),
        onRemove: () => setSelectedCountries(new Set(allCountries)),
      });
    }

    if (selectedLanguages && selectedLanguages.size > 0 && selectedLanguages.size < allLanguages.length) {
      out.push({
        key: 'languages',
        label: summarize(selectedLanguages, allLanguages.length, l => l),
        onRemove: () => setSelectedLanguages(new Set(allLanguages)),
      });
    }

    if (specialFilter) {
      out.push({
        key: 'special',
        label: t(lang, 'specialFilterFull'),
        onRemove: () => setSpecialFilter(false),
      });
    }

    if (lastChanceFilter) {
      out.push({
        key: 'last-chance',
        label: t(lang, 'lastChance'),
        onRemove: () => setLastChanceFilter(false),
      });
    }

    return out;
  }, [
    lang, versionFilter, setVersionFilter,
    decades, selectedDecades, setSelectedDecades,
    selectedRuntimeCategories, setSelectedRuntimeCategories,
    selectedDays, setSelectedDays,
    allGenres, selectedGenres, setSelectedGenres,
    allCountries, selectedCountries, setSelectedCountries,
    allLanguages, selectedLanguages, setSelectedLanguages,
    specialFilter, setSpecialFilter,
    lastChanceFilter, setLastChanceFilter,
  ]);

  // Always show the row so layout doesn't jump when filters appear / disappear.
  return (
    <div className="active-chips">
      <span className="active-chips-label">
        {lang === 'es' ? 'Activos' : 'Active'}
      </span>
      {chips.map(c => (
        <span key={c.key} className="active-chip">
          <span className="active-chip-text">{c.label}</span>
          <button
            type="button"
            className="active-chip-x"
            onClick={c.onRemove}
            aria-label={`Remove ${c.label}`}
          >×</button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="active-chips-clear"
          onClick={onClearAll}
        >{lang === 'es' ? 'limpiar todo' : 'clear all'}</button>
      )}
    </div>
  );
}
