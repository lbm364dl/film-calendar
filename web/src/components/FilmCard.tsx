'use client';

import { memo } from 'react';
import { formatViewerCount } from '@/lib/film-helpers';
import { t, translateGenre, translateSpecialType } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import SessionsDisplay from './sessions/SessionsDisplay';

function buildSimilarLine(breakdown: CompactBreakdown | undefined, lang: LangKey): { title: string; value: string } | null {
  const items = breakdown?.similarTo;
  if (!items || items.length === 0) return null;
  const s = items[0];
  const value = s.value || s.reason;
  return { title: s.title, value };
}

interface FilmCardProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  matchScore?: number;
  breakdown?: CompactBreakdown;
  isWatched: boolean;
  formatDate: (dateStr: string) => string;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

export default memo(function FilmCard({
  film, lang, dateLocale,
  openPopupId, setOpenPopupId,
  matchScore, breakdown, isWatched,
  formatDate, getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: FilmCardProps) {
  const ratingValue = film.rating ? film.rating.toFixed(1) : null;
  const viewersFormatted = formatViewerCount(film.viewers);
  const viewersTooltip = viewersFormatted
    ? (lang === 'es'
      ? t(lang, 'viewersLabel', film.viewers!.toLocaleString('es-ES'))
      : t(lang, 'viewersLabel', film.viewers!.toLocaleString('en-US')))
    : '';

  const showMatch = matchScore !== undefined && !isWatched;
  const similarLine = showMatch ? buildSimilarLine(breakdown, lang) : null;
  const hasSpecial = film.dates.some(d => d.special);

  const titleText = getFilmTitle(film);
  const letterboxdLink = film.letterboxdShortUrl || film.letterboxdUrl;

  return (
    <div className="film-card">
      <div className="film-header">
        <div className="film-title">
          {titleText}{film.year && <span className="title-year"> ({film.year})</span>}
        </div>
      </div>
      {film.director && (
        <div className="film-subtitle">
          {film.director}{film.runtimeMinutes ? ` (${film.runtimeMinutes} min)` : ''}
        </div>
      )}

      {/* Genres */}
      {(film.genres.length > 0 || hasSpecial) && (
        <div className="film-genres">
          {hasSpecial && (
            <span className="special-badge">
              {translateSpecialType(film.dates.find(d => d.special)!.special!, lang)}
            </span>
          )}
          {film.genres.map((g, i) => (
            <span key={i} className="genre-badge">{translateGenre(g, lang)}</span>
          ))}
        </div>
      )}

      {/* Sessions */}
      {film.dates.length > 0 && (
        <div className="film-dates">
          <SessionsDisplay
            film={film}
            lang={lang}
            dateLocale={dateLocale}
            openPopupId={openPopupId}
            setOpenPopupId={setOpenPopupId}
            formatDate={formatDate}
            getFilmTitle={getFilmTitle}
            getCalendarUrl={getCalendarUrl}
            getFallbackUrl={getFallbackUrl}
            onOpenModal={onOpenModal}
          />
        </div>
      )}

      {/* Bottom strip: metrics + affinity */}
      <div className="card-bottom-strip">
        <div className="card-metrics">
          {ratingValue && (
            <span className="rating" title={t(lang, 'ratingTooltip', ratingValue)}>
              <span className="metric-icon rating-icon" aria-hidden="true" />
              {ratingValue}
            </span>
          )}
          {viewersFormatted && (
            <span className="viewers" title={viewersTooltip}>
              <span className="metric-icon viewers-icon" aria-hidden="true" />
              {viewersFormatted}
            </span>
          )}
          {isWatched && matchScore !== undefined && (
            <span className="watched-label">{lang === 'es' ? 'Vista' : 'Seen'}</span>
          )}
        </div>
        {showMatch && (
          <div className={`card-affinity ${matchScore! >= 70 ? 'high' : matchScore! >= 40 ? 'medium' : 'low'}`}>
            <div className="card-affinity-fill" style={{ width: `${Math.min(matchScore!, 100)}%` }} />
            <span className="card-affinity-label">{matchScore}%</span>
          </div>
        )}
        {letterboxdLink && (
          <a href={letterboxdLink} className="letterboxd-link" target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()} title="View on Letterboxd">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/letterboxd.svg" className="letterboxd-icon" alt="LB" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '🎥️'; }} />
          </a>
        )}
      </div>
      {similarLine && (
        <div className="card-similar">
          <span className="similar-title">{similarLine.title}</span>
          <span className="similar-tag">{similarLine.value}</span>
        </div>
      )}
    </div>
  );
})
