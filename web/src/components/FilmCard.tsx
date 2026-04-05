'use client';

import { memo } from 'react';
import { formatViewerCount } from '@/lib/film-helpers';
import { t, translateGenre, translateSpecialType } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import SessionsDisplay from './sessions/SessionsDisplay';

function buildScoreTooltip(
  score: number,
  breakdown: CompactBreakdown | undefined,
  lang: LangKey,
): string {
  const base = lang === 'es' ? `${score}% de afinidad` : `${score}% match`;
  if (!breakdown) return base;

  const similarNames = breakdown.similarTo ?? [];
  const similarLine = similarNames.length > 0
    ? (lang === 'es' ? 'Similar a: ' : 'Similar to: ') + similarNames.join(', ')
    : '';

  const catLabels: Record<string, string> = {
    genre: lang === 'es' ? 'Género' : 'Genre',
    director: 'Director',
    cast: lang === 'es' ? 'Reparto' : 'Cast',
    keyword: lang === 'es' ? 'Temática' : 'Keywords',
    decade: lang === 'es' ? 'Época' : 'Decade',
    country: lang === 'es' ? 'País' : 'Country',
    lang: lang === 'es' ? 'Idioma' : 'Language',
    company: lang === 'es' ? 'Productora' : 'Studio',
    rating: lang === 'es' ? 'Valoración' : 'Rating',
    runtime: lang === 'es' ? 'Duración' : 'Runtime',
  };

  const topCats = Object.entries(breakdown.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, frac]) => `${catLabels[cat] ?? cat} ${Math.round(frac * 100)}%`)
    .join(', ');

  const parts = [base];
  if (similarLine) parts.push(similarLine);
  if (topCats) parts.push(topCats);
  return parts.join('\n');
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
  const scoreTooltip = showMatch ? buildScoreTooltip(matchScore, breakdown, lang) : '';
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
          <div
            className={`card-affinity ${matchScore! >= 70 ? 'high' : matchScore! >= 40 ? 'medium' : 'low'}`}
            title={scoreTooltip}
          >
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
    </div>
  );
})
