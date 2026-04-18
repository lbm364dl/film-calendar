'use client';

import { memo, useMemo } from 'react';
import { paletteFor } from './Poster';
import { theaterTint } from '@/lib/theater-colors';
import { getLocalTodayStart, formatDateInputValue } from '@/lib/film-helpers';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';

function matchTier(score: number): 'high' | 'mid' | 'warm' | 'mute' {
  if (score >= 90) return 'high';
  if (score >= 75) return 'mid';
  if (score >= 60) return 'warm';
  return 'mute';
}

function shortDate(iso: string, todayIso: string, lang: LangKey): string {
  if (iso === todayIso) return lang === 'es' ? 'hoy' : 'today';
  const parts = iso.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dom = d.getDate();
  const monShort = d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { month: 'short' }).replace('.', '');
  return `${dom} ${monShort}`;
}

function timeOf(ts: string): string {
  const [, hm = '00:00'] = ts.split(' ');
  return hm.slice(0, 5);
}

interface FilmGridTileProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  matchScore?: number;
  isWatched: boolean;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

export default memo(function FilmGridTile({
  film, lang, dateLocale,
  matchScore, isWatched,
  openPopupId, setOpenPopupId,
  getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: FilmGridTileProps) {
  const titleText = getFilmTitle(film);
  const { a, b, mark } = useMemo(() => paletteFor(film.id, titleText), [film.id, titleText]);

  const sorted = useMemo(() => {
    return [...film.dates].sort((x, y) =>
      new Date(x.timestamp.replace(' ', 'T')).getTime() -
      new Date(y.timestamp.replace(' ', 'T')).getTime()
    );
  }, [film.dates]);

  const todayIso = useMemo(() => formatDateInputValue(getLocalTodayStart()), []);
  const next = sorted[0];

  // Unique theater tints, capped to 5 dots.
  const tintDots = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sorted) {
      const t = theaterTint(s.location);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= 5) break;
    }
    return out;
  }, [sorted]);

  const tileId = `tile-${film.id}`;
  const expanded = openPopupId === tileId;
  const showMatch = matchScore !== undefined && !isWatched;

  return (
    <div
      className={`grid-tile${expanded ? ' expanded' : ''}`}
      style={{ background: a, color: b }}
      onClick={(e) => {
        e.stopPropagation();
        setOpenPopupId(expanded ? null : tileId);
      }}
      role="button"
      aria-expanded={expanded}
    >
      <div
        className="grid-tile-mark"
        style={{ color: b }}
        aria-hidden
      >{mark}</div>

      {showMatch && (
        <span className={`match-pill match-${matchTier(matchScore!)} grid-tile-match`}>
          <span className="match-dot" />
          {matchScore}%
        </span>
      )}

      <div
        className="grid-tile-gradient"
        style={{ background: `linear-gradient(to bottom, transparent 0%, ${b} 55%)` }}
        aria-hidden
      />

      <div className="grid-tile-info" style={{ color: a }}>
        <div className="grid-tile-title">{titleText}</div>
        <div className="grid-tile-meta">
          {[
            film.year ? String(film.year) : null,
            film.director ? film.director.split(',')[0] : null,
            film.runtimeMinutes ? `${film.runtimeMinutes}′` : null,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className="grid-tile-footer">
          <span className="grid-tile-tints">
            {tintDots.map((tint, i) => (
              <span key={i} className="grid-tile-tint" style={{ background: tint, outlineColor: a }} />
            ))}
          </span>
          <span className="grid-tile-count">
            {film.dates.length} {lang === 'es' ? 'ses.' : 'ses.'}
          </span>
          {next && (
            <span className="grid-tile-next">
              {shortDate(next.timestamp.slice(0, 10), todayIso, lang)} {timeOf(next.timestamp)}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="grid-tile-overlay"
          onClick={(e) => { e.stopPropagation(); setOpenPopupId(null); }}
        >
          <div className="grid-tile-overlay-inner" onClick={(e) => e.stopPropagation()}>
            <div className="grid-tile-overlay-title">{titleText}</div>
            <div className="grid-tile-overlay-sessions">
              {sorted.slice(0, 8).map((d, i) => {
                const iso = d.timestamp.slice(0, 10);
                const isToday = iso === todayIso;
                return (
                  <button
                    key={i}
                    className={`grid-tile-overlay-session${isToday ? ' is-today' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const dateTime = new Date(d.timestamp.replace(' ', 'T'));
                      const timeLabel = `${dateTime.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })} ${dateTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}${d.location && d.location !== 'Unknown' ? ' - ' + d.location : ''}`;
                      const titleLabel = film.year ? `${titleText} (${film.year})` : titleText;
                      const hasDirectUrl = !!(d.url_tickets && d.url_tickets.trim());
                      onOpenModal({
                        titleLabel,
                        timeLabel,
                        ticketUrl: hasDirectUrl ? d.url_tickets : '',
                        filmPageUrl: d.url_info || film.theaterLink || getFallbackUrl(film, d),
                        calendarUrl: getCalendarUrl(film, d),
                        hasDirectUrl,
                      });
                    }}
                  >
                    <span className="go-tint" style={{ background: theaterTint(d.location) }} />
                    <span className="go-date">{shortDate(iso, todayIso, lang)}</span>
                    <span className="go-time">{timeOf(d.timestamp)}</span>
                    <span className="go-theater">{d.location || ''}</span>
                  </button>
                );
              })}
              {sorted.length > 8 && (
                <span className="grid-tile-overlay-more">
                  +{sorted.length - 8} {lang === 'es' ? 'más' : 'more'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
