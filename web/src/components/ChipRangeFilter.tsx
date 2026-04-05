'use client';

import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';

interface ChipRangeFilterProps {
  id: string;
  lang: LangKey;
  label: string;
  chips: string[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onReset: () => void;
  onHelp?: () => void;
}

export default function ChipRangeFilter({
  id, lang, label, chips, selectedIndices, onToggle, onReset, onHelp,
}: ChipRangeFilterProps) {
  return (
    <div className="filter-section">
      <div className="filter-section-header">
        <div className="filter-section-header-left">
          <label className="filter-section-label">{label}</label>
          {onHelp && <span className="info-icon" onClick={onHelp}>?</span>}
        </div>
        <div className="chip-actions">
          <button
            type="button"
            className="chip-action-btn"
            onClick={onReset}
            style={{ visibility: selectedIndices.size > 0 ? 'visible' : 'hidden' }}
          >
            {t(lang, 'resetFilter')}
          </button>
        </div>
      </div>
      <div className={`chip-group chip-group-${id}`}>
        {chips.map((chipLabel, idx) => (
          <button
            key={idx}
            type="button"
            className={`chip${selectedIndices.has(idx) ? ' active' : ''}`}
            onClick={() => onToggle(idx)}
          >
            {chipLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
