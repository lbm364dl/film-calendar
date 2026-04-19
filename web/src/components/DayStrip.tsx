'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateInputValue, getLocalTodayStart } from '@/lib/film-helpers';
import type { LangKey } from '@/lib/translations';

const DOW_LABELS: Record<LangKey, string[]> = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const MONTH_LABELS: Record<LangKey, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
};

const DOW_NARROW: Record<LangKey, string[]> = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

export interface DayEntry {
  iso: string;
  date: Date;
  dow: number;     // 0-6, JS getDay()
  dom: number;     // day of month
  month: number;   // 0-11
  filmCount: number;
  isToday: boolean;
  inFuture: boolean;
}

/**
 * Build a horizontal 7-day strip (today + next 6) with film counts.
 * `filmCountByIso` — precomputed map from YYYY-MM-DD → film count.
 */
export function buildNextDays(filmCountByIso: Map<string, number>): DayEntry[] {
  const today = getLocalTodayStart();
  const out: DayEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = formatDateInputValue(d);
    out.push({
      iso,
      date: d,
      dow: d.getDay(),
      dom: d.getDate(),
      month: d.getMonth(),
      filmCount: filmCountByIso.get(iso) ?? 0,
      isToday: i === 0,
      inFuture: true,
    });
  }
  return out;
}

interface DayStripProps {
  lang: LangKey;
  days: DayEntry[];
  selectedDate: string;         // '' means no selection (= today implied by "all upcoming")
  onSelect: (iso: string) => void;
  onOpenCalendar: () => void;
}

export function DayStrip({ lang, days, selectedDate, onSelect, onOpenCalendar }: DayStripProps) {
  const dow = DOW_LABELS[lang];
  // When nothing is selected, visually mark today as "all upcoming" indicator?
  // The design shows today highlighted as the default focus. We reflect the
  // actual selectedDate: '' means all-upcoming (no highlight), otherwise the
  // matching pill is highlighted.
  // If a date is selected but not in the 7-day strip, the calendar button gets
  // the accent treatment so the user can tell a custom date is active.
  const customDateActive = !!selectedDate && !days.some(d => d.iso === selectedDate);
  return (
    <div className="day-bar">
      <div className="day-strip" role="tablist" aria-label="Día">
        {days.map(d => {
          const active = selectedDate === d.iso;
          return (
            <button
              key={d.iso}
              role="tab"
              aria-selected={active}
              className={`day-pill${active ? ' active' : ''}${d.isToday ? ' is-today' : ''}${d.filmCount === 0 ? ' empty' : ''}`}
              onClick={() => onSelect(active ? '' : d.iso)}
              title={d.filmCount === 0 ? (lang === 'es' ? 'Sin sesiones este día' : 'No sessions this day') : undefined}
            >
              <span className="dow">{d.isToday ? (lang === 'es' ? 'Hoy' : 'Today') : dow[d.dow]}</span>
              <span className="dom">{d.dom}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`day-pill day-pill-more${customDateActive ? ' active' : ''}`}
          onClick={onOpenCalendar}
          title={lang === 'es' ? 'Elegir otra fecha' : 'Pick a date'}
          aria-label={lang === 'es' ? 'Elegir otra fecha' : 'Pick a date'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Calendar popover ──────────────────────────────────────────────────────

interface CalendarPopoverProps {
  lang: LangKey;
  selectedDate: string;
  filmCountByIso: Map<string, number>;
  onSelect: (iso: string) => void;
  onClose: () => void;
  /** True while the parent is running the close-out animation. Adds a `.closing`
   *  class so the popover fades out for ~180ms before it unmounts. */
  closing?: boolean;
}

export function CalendarPopover({
  lang, selectedDate, filmCountByIso, onSelect, onClose, closing = false,
}: CalendarPopoverProps) {
  const today = useMemo(() => getLocalTodayStart(), []);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const anchor = selectedDate ? new Date(selectedDate + 'T12:00:00') : today;
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!popupRef.current) return;
      if (popupRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Build a 6-week (42-cell) grid starting from the Monday of the first week
  // containing the 1st of the cursor month.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(monthCursor);
    const offsetToMon = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - offsetToMon);

    const out: Array<{
      iso: string; dom: number; inFuture: boolean; isToday: boolean;
      outOfMonth: boolean; filmCount: number;
    }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = formatDateInputValue(d);
      const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      out.push({
        iso,
        dom: d.getDate(),
        inFuture: dayOnly >= today,
        isToday: dayOnly.getTime() === today.getTime(),
        outOfMonth: d.getMonth() !== monthCursor.getMonth(),
        filmCount: filmCountByIso.get(iso) ?? 0,
      });
    }
    return out;
  }, [monthCursor, today, filmCountByIso]);

  const monthLabel = `${MONTH_LABELS[lang][monthCursor.getMonth()]} ${monthCursor.getFullYear()}`;
  const dowNarrow = DOW_NARROW[lang];

  return (
    <div
      ref={popupRef}
      className={`calendar-popover${closing ? ' closing' : ''}`}
      role="dialog"
      aria-label={lang === 'es' ? 'Elegir fecha' : 'Pick a date'}
    >
      <div className="calendar-header">
        <div className="calendar-nav">
          <button
            className="calendar-nav-btn"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            aria-label={lang === 'es' ? 'Mes anterior' : 'Previous month'}
          >‹</button>
          <span className="calendar-month">{monthLabel}</span>
          <button
            className="calendar-nav-btn"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            aria-label={lang === 'es' ? 'Mes siguiente' : 'Next month'}
          >›</button>
        </div>
        <button
          className="calendar-today-btn"
          onClick={() => { setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1)); }}
        >{lang === 'es' ? 'Hoy' : 'Today'}</button>
      </div>
      <div className="calendar-dow">
        {dowNarrow.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="calendar-grid">
        {cells.map((c, i) => {
          const selected = selectedDate === c.iso;
          const disabled = !c.inFuture;
          return (
            <button
              key={i}
              type="button"
              className={`calendar-cell${selected ? ' selected' : ''}${c.isToday ? ' is-today' : ''}${c.outOfMonth ? ' out-of-month' : ''}`}
              disabled={disabled}
              onClick={() => {
                onSelect(selected ? '' : c.iso);
                onClose();
              }}
              aria-label={`${c.dom} ${MONTH_LABELS[lang][(monthCursor.getMonth() + (c.outOfMonth ? (c.dom > 15 ? -1 : 1) : 0) + 12) % 12]}`}
            >
              <span className="calendar-cell-dom">{c.dom}</span>
              {c.inFuture && c.filmCount > 0 && (
                <span className="calendar-cell-count">{c.filmCount}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <span>{lang === 'es' ? 'número = películas disponibles' : 'number = films available'}</span>
        {selectedDate && (
          <button
            type="button"
            className="calendar-clear-btn"
            onClick={() => { onSelect(''); onClose(); }}
          >{lang === 'es' ? 'Limpiar' : 'Clear'}</button>
        )}
      </div>
    </div>
  );
}
