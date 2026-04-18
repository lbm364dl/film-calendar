'use client';

import { memo } from 'react';
import { formatViewerCount } from '@/lib/film-helpers';
import { t, translateGenre, translateSpecialType, translateExplainerValue } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import SessionsDisplay from './sessions/SessionsDisplay';
import Poster from './Poster';

function buildSimilarData(breakdown: CompactBreakdown | undefined, lang: LangKey): { title: string; value: string; url?: string; valueUrl?: string } | null {
  const items = breakdown?.similarTo;
  if (!items || items.length === 0) return null;
  const s = items[0];
  const rawValue = s.value || s.reason;
  const title = (lang === 'en' && s.titleEn) ? s.titleEn : s.title;
  return { title, value: translateExplainerValue(rawValue, s.reason, lang), url: s.url, valueUrl: s.valueUrl };
}

function matchTier(score: number): 'high' | 'mid' | 'warm' | 'mute' {
  if (score >= 90) return 'high';
  if (score >= 75) return 'mid';
  if (score >= 60) return 'warm';
  return 'mute';
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
  const similarData = showMatch ? buildSimilarData(breakdown, lang) : null;
  const hasSpecial = film.dates.some(d => d.special);

  const titleText = getFilmTitle(film);
  const letterboxdLink = film.letterboxdShortUrl || film.letterboxdUrl;

  // Compact meta line under the title: director · country · runtime · genres
  const metaBits: React.ReactNode[] = [];
  if (film.director) metaBits.push(<span key="d">{film.director.split(',')[0]}</span>);
  if (film.country && film.country.length > 0) metaBits.push(<span key="c">{film.country[0]}</span>);
  if (film.runtimeMinutes) metaBits.push(<span key="r">{film.runtimeMinutes}′</span>);
  const genreLabel = film.genres.slice(0, 2).map(g => translateGenre(g, lang)).join(' · ');
  if (genreLabel) metaBits.push(<span key="g" className="film-meta-dim">{genreLabel}</span>);

  return (
    <article className="film-card">
      <Poster
        filmId={film.id}
        title={titleText}
        year={film.year}
        director={film.director || null}
      />
      <div className="film-body">
        <div className="film-title-row">
          <h3 className="film-title">{titleText}</h3>
          {film.year && <span className="film-year">{film.year}</span>}
          {showMatch && (
            <span className={`match-pill match-${matchTier(matchScore!)}`}>
              <span className="match-dot" />
              {matchScore}%
            </span>
          )}
          {hasSpecial && (
            <span className="special-badge">
              {translateSpecialType(film.dates.find(d => d.special)!.special!, lang)}
            </span>
          )}
        </div>
        {metaBits.length > 0 && (
          <div className="film-meta">
            {metaBits.reduce<React.ReactNode[]>((acc, bit, i) => {
              if (i > 0) acc.push(<span key={`sep-${i}`} className="film-meta-sep">·</span>);
              acc.push(bit);
              return acc;
            }, [])}
          </div>
        )}
        {similarData && (
          <div className="film-rec">
            <span className="film-rec-prefix">{lang === 'es' ? 'Has visto' : 'You watched'}:</span>
            {similarData.url ? (
              <a href={similarData.url} className="film-rec-title" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{similarData.title}</a>
            ) : (
              <span className="film-rec-title">{similarData.title}</span>
            )}
            {similarData.valueUrl ? (
              <a href={similarData.valueUrl} className="film-rec-tag" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{similarData.value}</a>
            ) : (
              <span className="film-rec-tag">{similarData.value}</span>
            )}
          </div>
        )}

        {/* Ratings strip — small row above sessions */}
        {(ratingValue || viewersFormatted || (isWatched && matchScore !== undefined)) && (
          <div className="film-metrics">
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
              <span className="watched-label">{lang === 'es' ? 'Vista' : 'Watched'}</span>
            )}
            {letterboxdLink && (
              <a href={letterboxdLink} className="letterboxd-link" target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()} title="View on Letterboxd">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/letterboxd.svg" className="letterboxd-icon" alt="LB" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '🎥️'; }} />
              </a>
            )}
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
      </div>
    </article>
  );
})
