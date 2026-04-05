'use client';

import { useState, useRef, useEffect } from 'react';
import { normalizeText } from '@/lib/film-helpers';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';

interface MultiSelectDropdownProps {
  id: string;
  lang: LangKey;
  allValues: string[];
  selectedValues: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  translateFn?: (value: string) => string;
  triggerLabelKey: string;
  searchPlaceholderKey: string;
  onHelp?: () => void;
}

export default function MultiSelectDropdown({
  id, lang, allValues, selectedValues,
  onToggle, onSelectAll, onSelectNone,
  translateFn, triggerLabelKey, searchPlaceholderKey,
  onHelp,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [ddStyle, setDdStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);

    // Desktop: position fixed relative to trigger. Mobile: inline (CSS handles it)
    if (triggerRef.current?.closest('.filter-modal') && window.innerWidth > 768) {
      const rect = triggerRef.current.getBoundingClientRect();
      const maxH = window.innerHeight - rect.bottom - 8;
      setDdStyle({
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(250, maxH),
      });
    } else {
      setDdStyle({});
    }

    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const normalizedSearch = normalizeText(search);
  const filteredValues = normalizedSearch
    ? allValues.filter(v => normalizeText(translateFn ? translateFn(v) : v).includes(normalizedSearch))
    : allValues;

  const allSelected = selectedValues.size === allValues.length;
  const allKeyMap: Record<string, string> = { genre: 'allGenres', country: 'allCountries', language: 'allLanguages' };
  const triggerLabel = allSelected
    ? t(lang, allKeyMap[id] || triggerLabelKey)
    : t(lang, triggerLabelKey, selectedValues.size, allValues.length);

  return (
    <div className="filter-multiselect-col">
      <div className="filter-section-label-row">
        <label className="filter-section-label">{t(lang, `${id}Label`)}</label>
        {onHelp && <span className="info-icon" onClick={onHelp}>?</span>}
      </div>
      <div className={`filter-multiselect${open ? ' open' : ''}`} ref={ref}>
        <button
          type="button"
          ref={triggerRef}
          className="filter-multiselect-trigger"
          onClick={() => setOpen(!open)}
        >
          <span>{triggerLabel}</span>
          <svg className="filter-chevron" width="10" height="6" viewBox="0 0 12 8">
            <path fill="currentColor" d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z"/>
          </svg>
        </button>
        {open && (
          <div className="filter-dropdown" style={ddStyle}>
            <input
              type="text"
              className="filter-dd-search"
              placeholder={t(lang, searchPlaceholderKey)}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div className="filter-dd-actions">
              <button type="button" onClick={onSelectAll}>{t(lang, 'selectAll')}</button>
              <button type="button" onClick={onSelectNone}>{t(lang, 'selectNone')}</button>
            </div>
            <div className="filter-dd-options">
              {filteredValues.map(value => (
                <label key={value} className="filter-dd-option">
                  <input
                    type="checkbox"
                    checked={selectedValues.has(value)}
                    onChange={() => onToggle(value)}
                  />
                  <span>{translateFn ? translateFn(value) : value}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
