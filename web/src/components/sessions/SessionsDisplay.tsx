'use client';

import { useMemo } from 'react';
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
}

const MAX_INLINE_CHIPS = 4;

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

function toModalData(film: Film, d: DateEntry, dateLocale: string,
                     getFilmTitle: (f: Film) => string,
                     getCalendarUrl: (f: Film, d: DateEntry) => string,
                     getFallbackUrl: (f: Film, d: DateEntry) => string): SessionModalData {
  const dateTime = new Date(d.timestamp.replace(' ', 'T'));
  const timeLabel = `${dateTime.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })} ${dateTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}${d.location && d.location !== 'Unknown' ? ' - ' + d.location : ''}`;
  const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);
  const hasDirectUrl = !!(d.url_tickets && d.url_tickets.trim());
  return {
    titleLabel,
    timeLabel,
    ticketUrl: hasDirectUrl ? d.url_tickets : '',
    filmPageUrl: d.url_info || film.theaterLink || getFallbackUrl(film, d),
    calendarUrl: getCalendarUrl(film, d),
    hasDirectUrl,
  };
}

export default function SessionsDisplay({
  film, lang, dateLocale, openPopupId, setOpenPopupId,
  getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
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
                onOpenModal(toModalData(film, d, dateLocale, getFilmTitle, getCalendarUrl, getFallbackUrl));
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

      {isOpen && sorted.length > inline.length && (
        <ExpandedSessionsByTheater
          film={film}
          lang={lang}
          dateLocale={dateLocale}
          sortedSessions={sorted}
          todayIso={todayIso}
          onOpenModal={(d) => onOpenModal(toModalData(film, d, dateLocale, getFilmTitle, getCalendarUrl, getFallbackUrl))}
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
  onOpenModal: (d: DateEntry) => void;
}

function ExpandedSessionsByTheater({
  film, lang, sortedSessions, todayIso, onOpenModal,
}: ExpandedSessionsProps) {
  // Group by location, sorted by number of sessions desc.
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
      .sort((a, b) => b.sessions.length - a.sessions.length);
  }, [sortedSessions]);

  const total = sortedSessions.length;

  return (
    <div className="sessions-by-theater" onClick={e => e.stopPropagation()}>
      <div className="sbt-head">
        <span>{lang === 'es' ? 'Sesiones por sala' : 'Sessions by theater'}</span>
        <span>
          {total} · {groups.length} {lang === 'es'
            ? (groups.length === 1 ? 'sala' : 'salas')
            : (groups.length === 1 ? 'theater' : 'theaters')}
        </span>
      </div>
      {groups.map(({ location, sessions }) => {
        const tint = theaterTint(location);
        const shortLoc = shortTheaterName(location);
        const byDay = new Map<string, DateEntry[]>();
        for (const s of sessions) {
          const iso = s.timestamp.slice(0, 10);
          let arr = byDay.get(iso);
          if (!arr) { arr = []; byDay.set(iso, arr); }
          arr.push(s);
        }
        const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
        return (
          <div key={location} className="sbt-row">
            <div className="sbt-theater">
              <span className="sbt-tint" style={{ background: tint }} />
              <span className="sbt-theater-name">{shortLoc || location}</span>
            </div>
            <div className="sbt-days">
              {days.map(([iso, ss]) => {
                const isToday = iso === todayIso;
                return (
                  <div key={iso} className={`sbt-day${isToday ? ' is-today' : ''}`}>
                    <span className="sbt-day-label">{shortDateLabel(iso, todayIso, lang)}</span>
                    <div className="sbt-times">
                      {ss.map((s, i) => (
                        <button
                          key={i}
                          className={`sbt-time${isToday ? ' is-today' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenModal(s);
                          }}
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
    </div>
  );
}
