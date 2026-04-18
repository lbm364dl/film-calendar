'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  sortMode, onToggleSortMode,
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
  sortMode: 'theater' | 'date';
  onToggleSortMode: () => void;
}) {
  const groupsByTheater = useMemo(() => {
    const byLoc = new Map<string, DateEntry[]>();
    for (const s of sorted) {
      const k = s.location || 'Unknown';
      let arr = byLoc.get(k);
      if (!arr) { arr = []; byLoc.set(k, arr); }
      arr.push(s);
    }
    return Array.from(byLoc.entries())
      .map(([location, sessions]) => ({ location, sessions }))
      .sort((a, b) => a.location.localeCompare(b.location, lang === 'es' ? 'es' : 'en', { sensitivity: 'base' }));
  }, [sorted, lang]);

  const groupsByDate = useMemo(() => {
    const byDay = new Map<string, DateEntry[]>();
    for (const s of sorted) {
      const iso = s.timestamp.slice(0, 10);
      let arr = byDay.get(iso);
      if (!arr) { arr = []; byDay.set(iso, arr); }
      arr.push(s);
    }
    return Array.from(byDay.entries())
      .map(([iso, sessions]) => ({ iso, sessions: sessions.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }))
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [sorted]);

  const groups = sortMode === 'date' ? groupsByDate : groupsByTheater;

  // Dynamically pick how many theater groups fit based on the overlay height
  // — avoids the old scrollbar and the ugly static "3" cap. Measured on mount
  // and on resize; a ResizeObserver keeps it in sync when the grid reflows.
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxGroups, setMaxGroups] = useState(groups.length);
  // When the user clicks "+N salas más", show every group and let the
  // container scroll — the default view still trims via measurement, but once
  // the user explicitly asks for more, scrolling is the acceptable tradeoff.
  const [showAll, setShowAll] = useState(false);

  useLayoutEffect(() => {
    if (showAll) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      // Measure real rendered groups and the "+N más" footer so we trim
      // based on actual heights, not a fixed per-group estimate. We first
      // reveal every hidden group, measure each one's bottom edge, then
      // commit the count that fits. The toggle happens inside a
      // useLayoutEffect so React flushes it before paint — no flicker.
      const allGroups = Array.from(el.querySelectorAll<HTMLElement>('.gto-group'));
      if (!allGroups.length) return;
      const prev = allGroups.map(g => g.style.display);
      allGroups.forEach(g => { g.style.display = ''; });

      const moreEl = el.querySelector<HTMLElement>('.gto-more');
      const moreSpace = moreEl ? moreEl.offsetHeight + 8 : 0;
      const available = el.clientHeight - moreSpace;

      let fit = 0;
      for (const g of allGroups) {
        if (g.offsetTop + g.offsetHeight <= available) fit++;
        else break;
      }

      allGroups.forEach((g, i) => { g.style.display = prev[i]; });
      setMaxGroups(Math.max(1, fit));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length, showAll]);

  const effectiveMax = showAll ? groups.length : maxGroups;
  const hiddenGroups = Math.max(0, groups.length - effectiveMax);

  const openSessionModal = (s: DateEntry) => {
    const titleLabel = film.titleEn || film.title;
    const filmTitleLabel = film.year ? `${titleLabel} (${film.year})` : titleLabel;
    const hasDirectUrl = !!(s.url_tickets && s.url_tickets.trim());
    onOpenModal({
      film, session: s, filmTitleLabel, matchScore,
      ticketUrl: hasDirectUrl ? s.url_tickets : '',
      filmPageUrl: s.url_info || film.theaterLink || getFallbackUrl(film, s),
      calendarUrl: getCalendarUrl(film, s),
      hasDirectUrl,
    });
  };

  const toggleLabel = sortMode === 'date'
    ? (lang === 'es' ? 'Por fecha' : 'By date')
    : (lang === 'es' ? 'Por sala' : 'By theater');

  return (
    <>
      <div className="gto-sort-row">
        <button
          type="button"
          className="gto-sort-toggle"
          onClick={(e) => { e.stopPropagation(); onToggleSortMode(); }}
          title={lang === 'es' ? 'Cambiar orden' : 'Toggle sort'}
        >
          {toggleLabel}
          <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div
        ref={containerRef}
        className={`grid-tile-overlay-groups${showAll ? ' is-expanded' : ''}`}
      >
      {sortMode === 'theater' && (groups as typeof groupsByTheater).map(({ location, sessions }, idx) => {
        const hidden = idx >= effectiveMax;
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
          <div key={location} className="gto-group" style={hidden ? { display: 'none' } : undefined}>
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
                        key={i} type="button" className="gto-time"
                        onClick={(e) => { e.stopPropagation(); openSessionModal(s); }}
                      >{timeOf(s.timestamp)}</button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {sortMode === 'date' && (groups as typeof groupsByDate).map(({ iso, sessions }, idx) => {
        const hidden = idx >= effectiveMax;
        const isToday = iso === todayIso;
        return (
          <div key={iso} className="gto-group" style={hidden ? { display: 'none' } : undefined}>
            <div className={`gto-theater${isToday ? ' is-today' : ''}`}>
              <span className="gto-theater-name">{shortDate(iso, todayIso, lang)}</span>
            </div>
            <div className="gto-date-sessions">
              {sessions.map((s, i) => {
                const tint = theaterTint(s.location);
                const short = (s.location || '').replace(/^Cines?\s+/i, '').replace(/^Sala\s+/i, '') || s.location;
                return (
                  <button
                    key={i} type="button"
                    className={`gto-date-session${isToday ? ' is-today' : ''}`}
                    onClick={(e) => { e.stopPropagation(); openSessionModal(s); }}
                  >
                    <span className="gto-date-session-time">{timeOf(s.timestamp)}</span>
                    <span className="gto-tint" style={{ background: tint }} />
                    <span className="gto-date-session-theater">{short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {hiddenGroups > 0 && !showAll && (
        <button
          type="button"
          className="gto-more"
          onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
        >
          +{hiddenGroups} {sortMode === 'date'
            ? (lang === 'es' ? (hiddenGroups === 1 ? 'día más' : 'días más') : (hiddenGroups === 1 ? 'more day' : 'more days'))
            : (lang === 'es' ? (hiddenGroups === 1 ? 'sala más' : 'salas más') : (hiddenGroups === 1 ? 'more theater' : 'more theaters'))
          }
        </button>
      )}
      </div>
    </>
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

  const [sortMode, setSortMode] = useState<'theater' | 'date'>('theater');

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

  // Keep the overlay mounted for one extra tick with `closing=true` so the CSS
  // fade-out can play before unmount. Mirrors FilmCalendar's closing pattern.
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayClosing, setOverlayClosing] = useState(false);
  useEffect(() => {
    if (expanded) {
      setOverlayVisible(true);
      setOverlayClosing(false);
      return;
    }
    if (!overlayVisible) return;
    setOverlayClosing(true);
    const t = setTimeout(() => { setOverlayVisible(false); setOverlayClosing(false); }, 160);
    return () => clearTimeout(t);
  }, [expanded]);

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

      {overlayVisible && (
        <div
          className={`grid-tile-overlay${overlayClosing ? ' closing' : ''}`}
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
              sortMode={sortMode}
              onToggleSortMode={() => setSortMode(m => m === 'date' ? 'theater' : 'date')}
            />
          </div>
        </div>
      )}
    </div>
  );
});
