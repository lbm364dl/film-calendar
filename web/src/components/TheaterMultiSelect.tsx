'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { normalizeText } from '@/lib/film-helpers';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import { THEATER_GROUPS, ALL_THEATER_VALUES } from '@/lib/constants';

interface TheaterMultiSelectProps {
  lang: LangKey;
  selectedTheaters: Set<string>;
  onToggleTheater: (value: string) => void;
  onToggleGroup: (childValues: string[], checked: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onHelp: () => void;
}

export default function TheaterMultiSelect({
  lang, selectedTheaters,
  onToggleTheater, onToggleGroup, onSelectAll, onSelectNone, onHelp,
}: TheaterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const normalizedSearch = normalizeText(search);
  const triggerLabel = t(lang, 'nTheatersSelected', selectedTheaters.size, ALL_THEATER_VALUES.length);

  // Alphabetical view of the theater groups (and children within each group).
  // Source order in constants.ts is authorial — sort at render time so the
  // dropdown reads naturally regardless of how the data is structured.
  const sortedGroups = useMemo(() => {
    const collator = new Intl.Collator(lang === 'es' ? 'es' : 'en', { sensitivity: 'base' });
    return [...THEATER_GROUPS]
      .map(g => g.children
        ? { ...g, children: [...g.children].sort((a, b) => collator.compare(a.label, b.label)) }
        : g
      )
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [lang]);

  const toggleExpand = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div className={`theater-multiselect${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="theater-multiselect-trigger"
        onClick={() => setOpen(!open)}
      >
        <span>{triggerLabel}</span>
        <svg className="theater-chevron" width="12" height="8" viewBox="0 0 12 8">
          <path fill="currentColor" d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z"/>
        </svg>
        <span className="info-icon" onClick={(e) => { e.stopPropagation(); onHelp(); }}>?</span>
      </button>

      {open && (
        <div className="theater-dropdown">
          <input
            type="text"
            className="theater-search"
            placeholder={t(lang, 'searchTheaters')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="theater-actions">
            <button type="button" onClick={onSelectAll}>{t(lang, 'selectAll')}</button>
            <button type="button" onClick={onSelectNone}>{t(lang, 'selectNone')}</button>
          </div>
          <div className="filter-dd-options">
            {sortedGroups.map((group) => {
              if (group.children) {
                const childValues = group.children.map(c => c.value);
                const selectedCount = childValues.filter(v => selectedTheaters.has(v)).length;
                const allSelected = selectedCount === childValues.length;
                const someSelected = selectedCount > 0 && !allSelected;
                const expanded = expandedGroups.has(group.label) || !!normalizedSearch;

                const groupMatches = normalizeText(group.label).includes(normalizedSearch);
                const matchingChildren = group.children.filter(c =>
                  normalizeText(c.label).includes(normalizedSearch) ||
                  normalizeText(c.value).includes(normalizedSearch)
                );
                if (normalizedSearch && !groupMatches && matchingChildren.length === 0) return null;

                return (
                  <div key={group.label} className="theater-group">
                    <div className="theater-group-header">
                      <label className="filter-dd-option theater-group-checkbox">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected; }}
                          onChange={() => onToggleGroup(childValues, !allSelected)}
                        />
                        <span className="theater-group-label">{group.label}</span>
                      </label>
                      <button
                        type="button"
                        className="theater-expand-btn"
                        onClick={() => toggleExpand(group.label)}
                      >
                        {expanded
                          ? t(lang, 'hideSalas')
                          : t(lang, 'showSalas', selectedCount, childValues.length)
                        }
                      </button>
                    </div>
                    {expanded && (
                      <div className="theater-sub-list">
                        {(normalizedSearch ? matchingChildren : group.children).map(child => (
                          <label key={child.value} className="filter-dd-option theater-child">
                            <input
                              type="checkbox"
                              checked={selectedTheaters.has(child.value)}
                              onChange={() => onToggleTheater(child.value)}
                            />
                            <span>{child.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              } else {
                if (normalizedSearch && !normalizeText(group.label).includes(normalizedSearch)) return null;
                return (
                  <label key={group.value} className="filter-dd-option">
                    <input
                      type="checkbox"
                      checked={selectedTheaters.has(group.value!)}
                      onChange={() => onToggleTheater(group.value!)}
                    />
                    <span>{group.label}</span>
                  </label>
                );
              }
            })}
          </div>
        </div>
      )}
    </div>
  );
}
