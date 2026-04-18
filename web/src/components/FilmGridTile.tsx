'use client';

import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { paletteFor } from './Poster';
import { theaterTint } from '@/lib/theater-colors';
import { getLocalTodayStart, formatDateInputValue, formatViewerCount } from '@/lib/film-helpers';
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

/**
 * Compact dark "sessions by theater" list shown inside an expanded grid tile.
 * Mirrors dirC-final's FExpandedSessionsDark: each theater gets a tint-dot +
 * short name + per-day rows with times joined by "·".
 */
function GridTileSessionsByTheater({
  film, sorted, todayIso, lang, dateLocale,
  getCalendarUrl, getFallbackUrl, onOpenModal, matchScore,
}: {
  film: Film;
  sorted: DateEntry[];
  todayIso: string;
  lang: LangKey;
  dateLocale: string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
  matchScore?: number;
}) {
  const groups = useMemo(() => {
    const byLoc = new Map<string, DateEntry[]>();
    for (const s of sorted) {
      const k = s.location || 'Unknown';
      let arr = byLoc.get(k);
      if (!arr) { arr = []; byLoc.set(k, arr); }
      arr.push(s);
    }
    return Array.from(byLoc.entries())
      .map(([location, sessions]) => ({ location, sessions }))
      .sort((a, b) => b.sessions.length - a.sessions.length);
  }, [sorted]);

  // Dynamically pick how many theater groups fit based on the overlay height
  // — avoids the old scrollbar and the ugly static "3" cap. Measured on mount
  // and on resize; a ResizeObserver keeps it in sync when the grid reflows.
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxGroups, setMaxGroups] = useState(3);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      // el is the groups wrapper inside the overlay; its own clientHeight
      // excludes the overlay title and padding, so we just divide by the
      // estimated per-group height.
      const h = el.clientHeight;
      // Reserve ~22px for the trailing "+N salas más" line.
      const PER_GROUP_PX = 62;
      const reserved = 22;
      const fit = Math.max(1, Math.floor((h - reserved) / PER_GROUP_PX));
      setMaxGroups(fit);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = groups.slice(0, maxGroups);
  const hiddenGroups = groups.length - visible.length;

  return (
    <div ref={containerRef} className="grid-tile-overlay-groups">
      {visible.map(({ location, sessions }) => {
        const tint = theaterTint(location);
        const short = (location || '').replace(/^Cines?\s+/i, '').replace(/^Sala\s+/i, '') || location;
        const byDay = new Map<string, DateEntry[]>();
        for (const s of sessions) {
          const iso = s.timestamp.slice(0, 10);
          let arr = byDay.get(iso);
          if (!arr) { arr = []; byDay.set(iso, arr); }
          arr.push(s);
        }
        const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, 3);
        return (
          <div key={location} className="gto-group">
            <div className="gto-theater">
              <span className="gto-tint" style={{ background: tint }} />
              <span className="gto-theater-name">{short}</span>
            </div>
            {days.map(([iso, ss]) => {
              const isToday = iso === todayIso;
              return (
                <div key={iso} className={`gto-day${isToday ? ' is-today' : ''}`}>
                  <span className="gto-day-label">{shortDate(iso, todayIso, lang)}</span>
                  <span className="gto-day-times">
                    {ss.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="gto-time"
                        onClick={(e) => {
                          e.stopPropagation();
                          const titleLabel = film.titleEn || film.title;
                          const filmTitleLabel = film.year ? `${titleLabel} (${film.year})` : titleLabel;
                          const hasDirectUrl = !!(s.url_tickets && s.url_tickets.trim());
                          onOpenModal({
                            film,
                            session: s,
                            filmTitleLabel,
                            matchScore,
                            ticketUrl: hasDirectUrl ? s.url_tickets : '',
                            filmPageUrl: s.url_info || film.theaterLink || getFallbackUrl(film, s),
                            calendarUrl: getCalendarUrl(film, s),
                            hasDirectUrl,
                          });
                        }}
                      >{timeOf(s.timestamp)}</button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
      {hiddenGroups > 0 && (
        <div className="gto-more">
          +{hiddenGroups} {lang === 'es' ? (hiddenGroups === 1 ? 'sala más' : 'salas más') : (hiddenGroups === 1 ? 'more theater' : 'more theaters')}
        </div>
      )}
    </div>
  );
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

  // When a real TMDB poster is available, paint it over the palette background
  // so the palette acts as a load-time / error fallback. Gradient + info
  // overlays on top keep text legible either way.
  const [imgFailed, setImgFailed] = useState(false);
  const showPoster = !!film.posterPath && !imgFailed;

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
      {showPoster && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          className="grid-tile-poster"
          src={`https://image.tmdb.org/t/p/w342${film.posterPath}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      )}

      {!showPoster && (
        <div
          className="grid-tile-mark"
          style={{ color: b }}
          aria-hidden
        >{mark}</div>
      )}

      {/* Rating + viewer count pill — upper-left. Same dark chip treatment as
          the match pill so both read consistently regardless of palette. */}
      {(film.rating != null || film.viewers != null) && (
        <div className="grid-tile-metrics" aria-hidden>
          {film.rating != null && (
            <span className="grid-tile-metric grid-tile-metric-rating">
              <span className="metric-icon rating-icon" />
              {film.rating.toFixed(1)}
            </span>
          )}
          {film.viewers != null && (
            <span className="grid-tile-metric grid-tile-metric-viewers">
              <span className="metric-icon viewers-icon" />
              {formatViewerCount(film.viewers)}
            </span>
          )}
        </div>
      )}

      {showMatch && (
        <span className={`match-pill match-${matchTier(matchScore!)} grid-tile-match`}>
          <span className="match-dot" />
          {matchScore}%
        </span>
      )}

      {/* Gradient readability overlay — fades into a near-black shade so the info
          block below reads cleanly regardless of the poster palette. */}
      <div className="grid-tile-gradient" aria-hidden />

      <div className="grid-tile-info">
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
              <span key={i} className="grid-tile-tint" style={{ background: tint }} />
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
          {/* No stopPropagation on the inner wrapper — clicks anywhere on the
              overlay except on actual session buttons fall through to close
              the overlay (the session buttons have their own stopPropagation). */}
          <div className="grid-tile-overlay-inner">
            <div className="grid-tile-overlay-title">{titleText}</div>
            <GridTileSessionsByTheater
              film={film}
              sorted={sorted}
              todayIso={todayIso}
              lang={lang}
              dateLocale={dateLocale}
              matchScore={showMatch ? matchScore : undefined}
              getFallbackUrl={getFallbackUrl}
              getCalendarUrl={getCalendarUrl}
              onOpenModal={onOpenModal}
            />
          </div>
        </div>
      )}
    </div>
  );
});
