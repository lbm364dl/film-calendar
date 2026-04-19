'use client';

import { useMemo } from 'react';
import { translateGenre, translateSpecialType, shortenCountry } from '@/lib/translations';
import type { SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import { theaterTint, shortTheaterName } from '@/lib/theater-colors';
import { getLocalTodayStart, formatDateInputValue, isSpanishFilm } from '@/lib/film-helpers';
import Poster from './Poster';

interface SessionModalProps {
  modal: SessionModalData;
  modalClosing: boolean;
  lang: LangKey;
  onClose: () => void;
}

function matchTier(score: number): 'high' | 'mid' | 'warm' | 'mute' {
  if (score >= 90) return 'high';
  if (score >= 75) return 'mid';
  if (score >= 60) return 'warm';
  return 'mute';
}

/**
 * Locale-aware long date label:
 *   today  → "Hoy" / "Today"
 *   next   → "Mañana" / "Tomorrow"
 *   else   → "Domingo 19 abr"
 */
function longDateLabel(iso: string, lang: LangKey): string {
  const todayIso = formatDateInputValue(getLocalTodayStart());
  if (iso === todayIso) return lang === 'es' ? 'Hoy' : 'Today';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const todayDt = new Date(todayIso + 'T00:00');
  const diff = Math.round((dt.getTime() - todayDt.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return lang === 'es' ? 'Mañana' : 'Tomorrow';
  const formatted = dt.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).replace(/\.$/, '');
}

function timeOf(ts: string): string {
  const [, hm = '00:00'] = ts.split(' ');
  return hm.slice(0, 5);
}

/** Compute session end time from start + film runtime, modulo 24h. */
function endTimeOf(start: string, runtimeMinutes: number | null): string | null {
  if (!runtimeMinutes || runtimeMinutes <= 0) return null;
  const [sh, sm] = start.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return null;
  const total = sh * 60 + sm + runtimeMinutes;
  const eh = Math.floor((total / 60) % 24);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export default function SessionModal({ modal, modalClosing, lang, onClose }: SessionModalProps) {
  const { film, session } = modal;
  const titleText = lang === 'en' && film.titleEn ? film.titleEn : film.title;
  const iso = session.timestamp.slice(0, 10);
  const start = timeOf(session.timestamp);
  const endTime = endTimeOf(start, film.runtimeMinutes);
  const tint = theaterTint(session.location);
  const theaterShort = shortTheaterName(session.location) || session.location;

  const metaLine = useMemo(() => {
    const bits: string[] = [];
    if (film.director) bits.push(film.director);
    if (film.country && film.country.length > 0) bits.push(shortenCountry(film.country[0]));
    if (film.year) bits.push(String(film.year));
    return bits.join(' · ');
  }, [film.director, film.country, film.year]);

  const genresLine = useMemo(() =>
    film.genres.slice(0, 3).map(g => translateGenre(g, lang)).join(' · '),
  [film.genres, lang]);

  const matchScore = modal.matchScore;

  return (
    <div
      className={`session-modal${modalClosing ? ' closing' : ''}`}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="session-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titleText}
      >
        <button className="session-modal-close" onClick={onClose} aria-label={lang === 'es' ? 'Cerrar' : 'Close'}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header: poster + film info */}
        <div className="session-modal-head">
          <div className="session-modal-poster">
            <Poster
              filmId={film.id}
              title={titleText}
              year={film.year}
              director={film.director || null}
              posterPath={film.posterPath}
              width={92}
              height={138}
              radius={3}
            />
          </div>
          <div className="session-modal-head-body">
            <div className="session-modal-eyebrow">
              {lang === 'es' ? 'Pase seleccionado' : 'Selected session'}
            </div>
            <h2 className="session-modal-title">{titleText}</h2>
            <div className="session-modal-meta">{metaLine}{film.runtimeMinutes ? ` · ${film.runtimeMinutes}′` : ''}</div>
            {genresLine && <div className="session-modal-genres">{genresLine}</div>}
            {matchScore != null && (
              <div className={`session-modal-match match-${matchTier(matchScore)}`}>
                <span className="session-modal-match-pct">{matchScore}%</span>
                <span className="session-modal-match-text">
                  {lang === 'es' ? 'match con tu Letterboxd' : 'match with your Letterboxd'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Session details grid: Cuándo / Dónde / Nota */}
        <div className="session-modal-details">
          <div className="session-modal-row">
            <div className="session-modal-key">{lang === 'es' ? 'Cuándo' : 'When'}</div>
            <div className="session-modal-val">
              <span className="session-modal-when-date">
                {longDateLabel(iso, lang)}
              </span>
              <span className="session-modal-when-time">
                {start}
                {endTime && <span className="session-modal-when-end">–{endTime}</span>}
              </span>
            </div>
          </div>

          <div className="session-modal-row">
            <div className="session-modal-key">{lang === 'es' ? 'Dónde' : 'Where'}</div>
            <div className="session-modal-val">
              <div className="session-modal-where-name">
                <span className="session-modal-tint" style={{ background: tint }} />
                <span>{theaterShort}</span>
              </div>
            </div>
          </div>

          {session.special && (
            <div className="session-modal-row">
              <div className="session-modal-key">{lang === 'es' ? 'Nota' : 'Note'}</div>
              <div className="session-modal-note">
                {translateSpecialType(session.special, lang)}
              </div>
            </div>
          )}

          {(() => {
            // Only surface the dubbed-version label when the film is
            // foreign-language AND actually offers both versions. For
            // Spanish-original films the `dubbed` marker just reflects the
            // standard language track at commercial theaters — calling it
            // "dubbed" would be misleading. `hasOriginalVersion` is
            // precomputed upstream so it's correct even when the active
            // VOSE / "in Spanish" filter has trimmed the visible sessions.
            if (session.version !== 'dubbed') return null;
            if (isSpanishFilm(film)) return null;
            if (!film.hasOriginalVersion) return null;
            return (
              <div className="session-modal-row">
                <div className="session-modal-key">{lang === 'es' ? 'Versión' : 'Version'}</div>
                <div className="session-modal-val">
                  <span className="session-modal-dub">{lang === 'es' ? 'Doblada al español' : 'Dubbed to Spanish'}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        <div className="session-modal-actions">
          {/* Primary CTA — "Buy tickets" when we have any session-specific URL
              (ticketing or info), otherwise falls back to the theater site. */}
          <a
            className="session-modal-primary"
            href={modal.primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {modal.primaryIsSpecific
              ? (lang === 'es' ? 'Comprar entradas' : 'Buy tickets')
              : (lang === 'es' ? 'Ir al cine' : 'Go to theater site')}
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <path d="M2 2 H9 V9 M9 2 L2 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </a>

          <div className="session-modal-actions-secondary">
            {modal.secondaryInfoUrl && (
              <a
                className="session-modal-link"
                href={modal.secondaryInfoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3.5 4.5 H8.5 M3.5 6.5 H8.5 M3.5 8.5 H6.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {lang === 'es' ? 'Ver ficha' : 'Film page'}
              </a>
            )}

            <div className="session-modal-calendar">
              <span className="session-modal-calendar-label">
                {lang === 'es' ? 'Añadir a' : 'Add to'}
              </span>
              <a
                className="session-modal-cal-btn"
                href={modal.calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Google Calendar"
              >Google Calendar</a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
