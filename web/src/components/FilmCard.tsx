'use client';

import { memo } from 'react';
import { formatViewerCount } from '@/lib/film-helpers';
import { t, translateGenre } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import SessionsDisplay from './sessions/SessionsDisplay';

function buildScoreTooltip(score: number, breakdown: CompactBreakdown | undefined, lang: LangKey): string {
  const base = lang === 'es' ? `${score}% de afinidad` : `${score}% match`;
  if (!breakdown) return base;

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

  const coveragePct = Math.round(breakdown.coverage * 100);
  const coverageLabel = lang === 'es' ? `Datos: ${coveragePct}%` : `Data: ${coveragePct}%`;

  return topCats ? `${base}\n${topCats}\n${coverageLabel}` : `${base}\n${coverageLabel}`;
}

interface FilmCardProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  matchScores: Record<number, number>;
  breakdowns: Record<number, CompactBreakdown>;
  recommendReady: boolean;
  watchedUrls: Set<string> | null;
  formatDate: (dateStr: string) => string;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

export default memo(function FilmCard({
  film, lang, dateLocale,
  openPopupId, setOpenPopupId,
  matchScores, breakdowns, recommendReady, watchedUrls,
  formatDate, getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: FilmCardProps) {
  const ratingValue = film.rating ? film.rating.toFixed(1) : null;
  const viewersFormatted = formatViewerCount(film.viewers);
  const viewersTooltip = viewersFormatted
    ? (lang === 'es'
      ? t(lang, 'viewersLabel', film.viewers!.toLocaleString('es-ES'))
      : t(lang, 'viewersLabel', film.viewers!.toLocaleString('en-US')))
    : '';

  const filmMatchScore = matchScores[film.id];
  const filmBreakdown = breakdowns[film.id];
  const isWatched = !!(watchedUrls && film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl));
  const showMatch = recommendReady && filmMatchScore !== undefined && !isWatched;
  const scoreTooltip = showMatch ? buildScoreTooltip(filmMatchScore, filmBreakdown, lang) : '';

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
      {film.genres.length > 0 && (
        <div className="film-genres">
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
          {isWatched && recommendReady && (
            <span className="watched-label">{lang === 'es' ? 'Vista' : 'Seen'}</span>
          )}
        </div>
        {showMatch && (
          <div
            className={`card-affinity ${filmMatchScore >= 70 ? 'high' : filmMatchScore >= 40 ? 'medium' : 'low'}`}
            title={scoreTooltip}
          >
            <div className="card-affinity-fill" style={{ width: `${Math.min(filmMatchScore, 100)}%` }} />
            <span className="card-affinity-label">{filmMatchScore}%</span>
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
