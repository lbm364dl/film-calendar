'use client';

import { useMemo, useState } from 'react';
import { getLocalTodayStart, formatDateInputValue } from '@/lib/film-helpers';
import { theaterTint, shortTheaterName } from '@/lib/theater-colors';
import { t } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';

interface SessionsDisplayProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  formatDate: (dateStr: string) => string;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
  matchScore?: number;
}

const MAX_INLINE_CHIPS = 1;

function shortDateLabel(iso: string, today: string, lang: LangKey): string {
  if (iso === today) return lang === 'es' ? 'hoy' : 'today';
  const parts = iso.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dow = d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { weekday: 'short' }).replace('.', '');
  const dom = d.getDate();
  const monShort = d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { month: 'short' }).replace('.', '');
  return `${dow} ${dom} ${monShort}`;
}

function timeOf(ts: string): string {
  const [, hm = '00:00'] = ts.split(' ');
  return hm.slice(0, 5);
}

function toModalData(film: Film, d: DateEntry,
                     getFilmTitle: (f: Film) => string,
                     getCalendarUrl: (f: Film, d: DateEntry) => string,
                     getFallbackUrl: (f: Film, d: DateEntry) => string,
                     matchScore?: number): SessionModalData {
  const filmTitleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);
  const hasDirectUrl = !!(d.url_tickets && d.url_tickets.trim());
  return {
    film,
    session: d,
    filmTitleLabel,
    matchScore,
    ticketUrl: hasDirectUrl ? d.url_tickets : '',
    filmPageUrl: d.url_info || film.theaterLink || getFallbackUrl(film, d),
    calendarUrl: getCalendarUrl(film, d),
    hasDirectUrl,
  };
}

export default function SessionsDisplay({
  film, lang, dateLocale, openPopupId, setOpenPopupId,
  getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal, matchScore,
}: SessionsDisplayProps) {
  const popupId = `popup-${film.id}`;
  const isOpen = openPopupId === popupId;
  const todayIso = useMemo(() => formatDateInputValue(getLocalTodayStart()), []);

  const sorted = useMemo(() => {
    return [...film.dates].sort((a, b) =>
      new Date(a.timestamp.replace(' ', 'T')).getTime() -
      new Date(b.timestamp.replace(' ', 'T')).getTime()
    );
  }, [film.dates]);

  const inline = sorted.slice(0, MAX_INLINE_CHIPS);
  const rest = sorted.length - inline.length;

  return (
    <>
      <div className="session-chips">
        {inline.map((d, i) => {
          const iso = d.timestamp.slice(0, 10);
          const isToday = iso === todayIso;
          const tint = theaterTint(d.location);
          const shortLoc = shortTheaterName(d.location);
          const chipClass = `session-chip${isToday ? ' is-today' : ''}${d.special ? ' has-special' : ''}`;
          const label = `${shortDateLabel(iso, todayIso, lang)} ${timeOf(d.timestamp)}${shortLoc ? ' · ' + shortLoc : ''}`;
          return (
            <button
              key={i}
              className={chipClass}
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal(toModalData(film, d, getFilmTitle, getCalendarUrl, getFallbackUrl, matchScore));
              }}
              title={label}
            >
              <span className="session-chip-time">
                {shortDateLabel(iso, todayIso, lang)} {timeOf(d.timestamp)}
              </span>
              {shortLoc && (
                <>
                  <span className="session-chip-sep">·</span>
                  <span className="session-chip-tint" style={{ background: tint }} />
                  <span className="session-chip-theater">{shortLoc}</span>
                </>
              )}
              {d.version === 'dubbed' && (
                <span className="session-chip-dub" title={t(lang, 'dubbedTooltip')}>ES</span>
              )}
            </button>
          );
        })}
        {rest > 0 && (
          <button
            type="button"
            className={`session-chip-more${isOpen ? ' active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenPopupId(isOpen ? null : popupId);
            }}
          >
            {isOpen
              ? (lang === 'es' ? 'Ver menos' : 'Show less')
              : `+${rest} ${lang === 'es' ? 'más' : 'more'}`}
          </button>
        )}
      </div>

      {/* Always mount the expanded panel when there's overflow — keeping it
          in the DOM (hidden via CSS) means opening it is instant; no React
          reconciliation or DOM creation delay on click. */}
      {sorted.length > inline.length && (
        <ExpandedSessionsByTheater
          film={film}
          lang={lang}
          dateLocale={dateLocale}
          sortedSessions={sorted}
          todayIso={todayIso}
          open={isOpen}
          onOpenModal={(d) => onOpenModal(toModalData(film, d, getFilmTitle, getCalendarUrl, getFallbackUrl, matchScore))}
        />
      )}
    </>
  );
}

// ── Expanded panel: grouped by theater ─────────────────────────────────

interface ExpandedSessionsProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  sortedSessions: DateEntry[];
  todayIso: string;
  open: boolean;
  onOpenModal: (d: DateEntry) => void;
}

function ExpandedSessionsByTheater({
  film, lang, sortedSessions, todayIso, open, onOpenModal,
}: ExpandedSessionsProps) {
  const [sortMode, setSortMode] = useState<'theater' | 'date'>('theater');

  const groups = useMemo(() => {
    const byLocation = new Map<string, DateEntry[]>();
    for (const d of sortedSessions) {
      const k = d.location || 'Unknown';
      let arr = byLocation.get(k);
      if (!arr) { arr = []; byLocation.set(k, arr); }
      arr.push(d);
    }
    return Array.from(byLocation.entries())
      .map(([location, sessions]) => ({ location, sessions }))
      .sort((a, b) => a.location.localeCompare(b.location, lang === 'es' ? 'es' : 'en', { sensitivity: 'base' }));
  }, [sortedSessions, lang]);

  const days = useMemo(() => {
    const byDay = new Map<string, DateEntry[]>();
    for (const d of sortedSessions) {
      const iso = d.timestamp.slice(0, 10);
      let arr = byDay.get(iso);
      if (!arr) { arr = []; byDay.set(iso, arr); }
      arr.push(d);
    }
    return Array.from(byDay.entries())
      .map(([iso, sessions]) => ({ iso, sessions: sessions.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [sortedSessions]);

  const total = sortedSessions.length;
  const isByDate = sortMode === 'date';
  const toggleLabel = isByDate
    ? (lang === 'es' ? 'Ordenadas por fecha' : 'Sorted by date')
    : (lang === 'es' ? 'Ordenadas por sala' : 'Sorted by theater');

  return (
    <div
      className={`sessions-by-theater${open ? ' is-open' : ' is-closed'}`}
      aria-hidden={!open}
      onClick={e => e.stopPropagation()}
    >
      <div className="sbt-head">
        <button
          type="button"
          className="sbt-sort-toggle"
          onClick={(e) => { e.stopPropagation(); setSortMode(isByDate ? 'theater' : 'date'); }}
          title={lang === 'es' ? 'Cambiar orden' : 'Toggle sort'}
        >
          {toggleLabel}
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span>
          {isByDate
            ? `${total} · ${days.length} ${lang === 'es' ? (days.length === 1 ? 'día' : 'días') : (days.length === 1 ? 'day' : 'days')}`
            : `${total} · ${groups.length} ${lang === 'es' ? (groups.length === 1 ? 'sala' : 'salas') : (groups.length === 1 ? 'theater' : 'theaters')}`
          }
        </span>
      </div>

      {!isByDate && groups.map(({ location, sessions }) => {
        const tint = theaterTint(location);
        const shortLoc = shortTheaterName(location);
        const byDay = new Map<string, DateEntry[]>();
        for (const s of sessions) {
          const iso = s.timestamp.slice(0, 10);
          let arr = byDay.get(iso);
          if (!arr) { arr = []; byDay.set(iso, arr); }
          arr.push(s);
        }
        const theaterDays = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
        return (
          <div key={location} className="sbt-row">
            <div className="sbt-theater">
              <span className="sbt-tint" style={{ background: tint }} />
              <span className="sbt-theater-name">{shortLoc || location}</span>
            </div>
            <div className="sbt-days">
              {theaterDays.map(([iso, ss]) => {
                const isToday = iso === todayIso;
                return (
                  <div key={iso} className={`sbt-day${isToday ? ' is-today' : ''}`}>
                    <span className="sbt-day-label">{shortDateLabel(iso, todayIso, lang)}</span>
                    <div className="sbt-times">
                      {ss.map((s, i) => (
                        <button
                          key={i}
                          className={`sbt-time${isToday ? ' is-today' : ''}`}
                          onClick={(e) => { e.stopPropagation(); onOpenModal(s); }}
                        >
                          {timeOf(s.timestamp)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {isByDate && days.map(({ iso, sessions }) => {
        const isToday = iso === todayIso;
        return (
          <div key={iso} className={`sbt-row${isToday ? ' is-today' : ''}`}>
            <div className={`sbt-theater sbt-date-cell${isToday ? ' is-today' : ''}`}>
              <span className="sbt-theater-name">{shortDateLabel(iso, todayIso, lang)}</span>
            </div>
            <div className="sbt-days sbt-days-flat">
              {sessions.map((s, i) => {
                const tint = theaterTint(s.location);
                const shortLoc = shortTheaterName(s.location);
                return (
                  <button
                    key={i}
                    className={`sbt-date-session${isToday ? ' is-today' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onOpenModal(s); }}
                  >
                    <span className="sbt-time">{timeOf(s.timestamp)}</span>
                    <span className="sbt-tint" style={{ background: tint }} />
                    <span className="sbt-date-session-theater">{shortLoc || s.location}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
