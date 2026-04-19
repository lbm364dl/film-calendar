'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { paletteFor } from './Poster';
import { theaterTint } from '@/lib/theater-colors';
import { getLocalTodayStart, formatDateInputValue, formatViewerCount } from '@/lib/film-helpers';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import { translateGenre, translateExplainerValue } from '@/lib/translations';

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
  sortMode, onToggleSortMode, showAllSessions,
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
  /** When true, skip the height-measurement trim + "+N más" button and
      render every theater/date group directly into a scrollable list.
      Used by the enlarged modal where there's plenty of height. */
  showAllSessions?: boolean;
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
    if (showAll || showAllSessions) return;
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

  const effectiveMax = (showAll || showAllSessions) ? groups.length : maxGroups;
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
      {!showAllSessions && (
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
      )}
      <div
        ref={containerRef}
        className={`grid-tile-overlay-groups${(showAll || showAllSessions) ? ' is-expanded' : ''}`}
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
              return (
                <div key={iso} className="gto-day">
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
        return (
          <div key={iso} className="gto-group" style={hidden ? { display: 'none' } : undefined}>
            <div className="gto-theater">
              <span className="gto-theater-name">{shortDate(iso, todayIso, lang)}</span>
            </div>
            <div className="gto-date-sessions">
              {sessions.map((s, i) => {
                const tint = theaterTint(s.location);
                const short = (s.location || '').replace(/^Cines?\s+/i, '').replace(/^Sala\s+/i, '') || s.location;
                return (
                  <button
                    key={i} type="button"
                    className="gto-date-session"
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

      {hiddenGroups > 0 && !showAll && !showAllSessions && (
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
  breakdown?: CompactBreakdown;
  isWatched: boolean;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

function buildSimilarData(breakdown: CompactBreakdown | undefined, lang: LangKey): { title: string; value: string; url?: string; valueUrl?: string } | null {
  const items = breakdown?.similarTo;
  if (!items || items.length === 0) return null;
  const s = items[0];
  const rawValue = s.value || s.reason;
  const title = (lang === 'en' && s.titleEn) ? s.titleEn : s.title;
  return { title, value: translateExplainerValue(rawValue, s.reason, lang), url: s.url, valueUrl: s.valueUrl };
}

export default memo(function FilmGridTile({
  film, lang, dateLocale,
  matchScore, breakdown, isWatched,
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
  // Two-stage reveal: the first click enlarges the card (front visible), the
  // second flips it to the sessions view. Closing always fully collapses.
  const [flipped, setFlipped] = useState(false);

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

  // FLIP animation: on click we capture the tile's rect so the fixed-position
  // modal can animate *from* that rect (origin) *to* its final centered size,
  // and reverse on close. Kept in local state because each tile owns its own
  // modal instance.
  const tileRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayClosing, setOverlayClosing] = useState(false);
  const originRectRef = useRef<DOMRect | null>(null);

  // Lock background scroll while the modal is up. We freeze the page at the
  // current scrollY by fixing the body in place — setting overflow:hidden
  // alone doesn't stop iOS scroll chaining, and the scrollbar width is
  // compensated via padding-right so the header doesn't jump.
  useEffect(() => {
    if (!overlayVisible) return;
    const scrollY = window.scrollY;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      paddingRight: document.body.style.paddingRight,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.paddingRight = prev.paddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [overlayVisible]);

  const captureOrigin = useCallback(() => {
    if (tileRef.current) originRectRef.current = tileRef.current.getBoundingClientRect();
  }, []);

  useEffect(() => {
    if (expanded) {
      if (!originRectRef.current) captureOrigin();
      setOverlayVisible(true);
      setOverlayClosing(false);
      setFlipped(false);  // always enter on the front face
      return;
    }
    if (!overlayVisible) return;
    // Re-capture the tile rect at close time — the grid may have reflowed.
    captureOrigin();
    setOverlayClosing(true);
    const t = setTimeout(() => {
      setOverlayVisible(false);
      setOverlayClosing(false);
      setFlipped(false);
      originRectRef.current = null;
    }, 260);
    return () => clearTimeout(t);
  }, [expanded]);

  // Apply the FLIP transforms once the modal is in the DOM. Opening: start at
  // origin rect → animate to identity. Closing: start at identity → animate
  // to origin rect. useLayoutEffect guarantees this runs before paint.
  useLayoutEffect(() => {
    if (!overlayVisible) return;
    const el = modalRef.current;
    const origin = originRectRef.current;
    if (!el || !origin) return;
    const target = el.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
    const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
    const sx = origin.width / target.width;
    const sy = origin.height / target.height;
    const originTransform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    if (overlayClosing) {
      // Identity → origin.
      el.style.transition = '';
      el.style.transform = '';
      void el.offsetWidth;
      el.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.26s';
      el.style.transform = originTransform;
      el.style.opacity = '0';
    } else {
      // Origin → identity.
      el.style.transition = 'none';
      el.style.transform = originTransform;
      el.style.opacity = '0';
      void el.offsetWidth;
      el.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.18s';
      el.style.transform = '';
      el.style.opacity = '1';
    }
  }, [overlayVisible, overlayClosing]);

  // When a real TMDB poster is available, paint it over the palette background
  // so the palette acts as a load-time / error fallback. Gradient + info
  // overlays on top keep text legible either way.
  const [imgFailed, setImgFailed] = useState(false);
  const showPoster = !!film.posterPath && !imgFailed;

  return (
    <div
      ref={tileRef}
      className={`grid-tile${expanded ? ' expanded' : ''}`}
      style={{ background: a, color: b }}
      onClick={(e) => {
        e.stopPropagation();
        if (!expanded) captureOrigin();
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

      {overlayVisible && typeof document !== 'undefined' && createPortal(
        <div
          className={`grid-tile-modal-wrap${overlayClosing ? ' is-closing' : ''}`}
          onClick={(e) => { e.stopPropagation(); setOpenPopupId(null); }}
          role="dialog"
          aria-modal="true"
        >
          <div
            ref={modalRef}
            className={`grid-tile-modal${flipped ? ' is-flipped' : ''}`}
            style={{ background: a, color: b }}
            onClick={(e) => {
              e.stopPropagation();
              if (flipped) return;
              // Only clicks on empty poster space should flip — clicks inside
              // text blocks (title/meta/genres/rec) or the action row stay
              // inert so users can read, select, and copy freely.
              const target = e.target as HTMLElement;
              if (target.closest(
                '.grid-tile-modal-title, .grid-tile-modal-meta, .grid-tile-modal-genres, .grid-tile-modal-rec'
              )) return;
              setFlipped(true);
            }}
          >
            {/* Front face — enlarged version of the grid thumbnail. */}
            <div className="grid-tile-modal-face grid-tile-modal-front">
              {showPoster && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="grid-tile-modal-poster"
                  src={`https://image.tmdb.org/t/p/original${film.posterPath}`}
                  alt=""
                  decoding="async"
                />
              )}
              {!showPoster && (
                <div className="grid-tile-modal-mark" style={{ color: b }} aria-hidden>{mark}</div>
              )}

              {(film.rating != null || film.viewers != null || showMatch) && (
                <div className="grid-tile-metrics grid-tile-modal-metrics">
                  {film.rating != null && (
                    <span className="grid-tile-metric grid-tile-metric-rating" aria-hidden>
                      <span className="metric-icon rating-icon" />
                      {film.rating.toFixed(1)}
                    </span>
                  )}
                  {film.viewers != null && (
                    <span className="grid-tile-metric grid-tile-metric-viewers" aria-hidden>
                      <span className="metric-icon viewers-icon" />
                      {formatViewerCount(film.viewers)}
                    </span>
                  )}
                  {showMatch && (
                    <span className={`match-pill match-${matchTier(matchScore!)}`}>
                      <span className="match-dot" />
                      {matchScore}%
                    </span>
                  )}
                </div>
              )}

              <div className="grid-tile-modal-gradient" aria-hidden />

              <div className="grid-tile-modal-front-info">
                <h3 className="grid-tile-modal-title">{titleText}</h3>
                <div className="grid-tile-modal-meta">
                  {[
                    film.year ? String(film.year) : null,
                    film.director ? film.director.split(',')[0] : null,
                    film.runtimeMinutes ? `${film.runtimeMinutes}′` : null,
                    film.country && film.country.length > 0 ? film.country[0] : null,
                  ].filter(Boolean).join(' · ')}
                </div>
                {film.genres && film.genres.length > 0 && (
                  <div className="grid-tile-modal-genres">
                    {film.genres.slice(0, 3).map(g => translateGenre(g, lang)).join(' · ')}
                  </div>
                )}
                {(() => {
                  const similarData = showMatch ? buildSimilarData(breakdown, lang) : null;
                  if (!similarData) return null;
                  return (
                    <div className="grid-tile-modal-rec">
                      <span className="grid-tile-modal-rec-prefix">{lang === 'es' ? 'Has visto' : 'You watched'}:</span>
                      {similarData.url ? (
                        <a href={similarData.url} className="grid-tile-modal-rec-title" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{similarData.title}</a>
                      ) : (
                        <span className="grid-tile-modal-rec-title">{similarData.title}</span>
                      )}
                      {similarData.valueUrl ? (
                        <a href={similarData.valueUrl} className="grid-tile-modal-rec-tag" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{similarData.value}</a>
                      ) : (
                        <span className="grid-tile-modal-rec-tag">{similarData.value}</span>
                      )}
                    </div>
                  );
                })()}
                <div className="grid-tile-modal-front-actions">
                  {(film.letterboxdShortUrl || film.letterboxdUrl) && (
                    <a
                      className="grid-tile-modal-lb-link"
                      href={film.letterboxdShortUrl || film.letterboxdUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Letterboxd"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/assets/letterboxd.svg" className="letterboxd-icon" alt="" aria-hidden />
                      <span>Letterboxd</span>
                    </a>
                  )}
                  <span className="grid-tile-modal-hint">
                    <span className="hint-verb hint-tap">{lang === 'es' ? 'Toca' : 'Tap'}</span>
                    <span className="hint-verb hint-click">{lang === 'es' ? 'Haz clic' : 'Click'}</span>
                    {' '}{lang === 'es' ? 'para ver sesiones' : 'to see sessions'}
                  </span>
                </div>
              </div>
            </div>

            {/* Back face — sessions list. Clicking on the non-interactive
                part of this face flips back to the poster. */}
            <div
              className="grid-tile-modal-face grid-tile-modal-back"
              onClick={(e) => {
                e.stopPropagation();
                const target = e.target as HTMLElement;
                // Exclude text + interactive elements so selection/copy never
                // flips the card. Empty container space (back padding,
                // sessions wrapper gaps, group gaps) still flips back to the
                // poster as intended.
                if (target.closest(
                  'button, a, .grid-tile-modal-title, .grid-tile-modal-meta, .gto-theater-name, .gto-day-label'
                )) return;
                setFlipped(false);
              }}
            >
              <div className="grid-tile-modal-back-head">
                <div className="grid-tile-modal-back-titles">
                  <h3 className="grid-tile-modal-title">{titleText}</h3>
                  <div className="grid-tile-modal-meta">
                    {[
                      film.year ? String(film.year) : null,
                      film.director ? film.director.split(',')[0] : null,
                      film.runtimeMinutes ? `${film.runtimeMinutes}′` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  <span className="grid-tile-modal-hint grid-tile-modal-back-hint">
                    <span className="hint-verb hint-tap">{lang === 'es' ? 'Toca' : 'Tap'}</span>
                    <span className="hint-verb hint-click">{lang === 'es' ? 'Haz clic' : 'Click'}</span>
                    {' '}{lang === 'es' ? 'para ver el póster' : 'to see poster'}
                  </span>
                </div>
                <div
                  className="grid-tile-modal-sort-group"
                  role="tablist"
                  aria-label={lang === 'es' ? 'Ordenar sesiones' : 'Sort sessions'}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sortMode === 'theater'}
                    className={`grid-tile-modal-sort-btn${sortMode === 'theater' ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSortMode('theater'); }}
                  >{lang === 'es' ? 'Sala' : 'Theater'}</button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sortMode === 'date'}
                    className={`grid-tile-modal-sort-btn${sortMode === 'date' ? ' active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setSortMode('date'); }}
                  >{lang === 'es' ? 'Fecha' : 'Date'}</button>
                </div>
              </div>
              <div className="grid-tile-modal-sessions">
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
                  showAllSessions
                />
              </div>
            </div>

            <button
              type="button"
              className="grid-tile-modal-close"
              onClick={(e) => { e.stopPropagation(); setOpenPopupId(null); }}
              aria-label={lang === 'es' ? 'Cerrar' : 'Close'}
            >&times;</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});
