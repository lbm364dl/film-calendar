'use client';

import { SESSIONS_COLLAPSE_THRESHOLD } from '@/lib/constants';
import { isRenoirLocation, isEmbajadoresLocation } from '@/lib/film-helpers';
import { t } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import SessionRow from './SessionRow';
import GroupedSessions from './GroupedSessions';

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

export default function SessionsDisplay({
  film, lang, dateLocale, openPopupId, setOpenPopupId,
  formatDate, getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: SessionsDisplayProps) {
  if (film.dates.length <= SESSIONS_COLLAPSE_THRESHOLD) {
    return (
      <>
        {film.dates.map((d, i) => (
          <SessionRow
            key={i}
            film={film}
            dateObj={d}
            lang={lang}
            formatDate={formatDate}
            getFilmTitle={getFilmTitle}
            getCalendarUrl={getCalendarUrl}
            getFallbackUrl={getFallbackUrl}
            onOpenModal={onOpenModal}
          />
        ))}
      </>
    );
  }

  const popupId = `popup-${film.id}`;
  const isOpen = openPopupId === popupId;

  // Date range
  const sorted = [...film.dates].sort((a, b) =>
    new Date(a.timestamp.replace(' ', 'T')).getTime() - new Date(b.timestamp.replace(' ', 'T')).getTime()
  );
  const first = new Date(sorted[0].timestamp.replace(' ', 'T'));
  const last = new Date(sorted[sorted.length - 1].timestamp.replace(' ', 'T'));
  const fmtShort = (d: Date) => d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  const dateRange = first.toDateString() === last.toDateString()
    ? fmtShort(first)
    : `${fmtShort(first)} – ${fmtShort(last)}`;

  // Location summary
  const locations = [...new Set(film.dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
  let locationSummary = '';
  if (locations.every(l => isRenoirLocation(l))) locationSummary = 'Renoir';
  else if (locations.every(l => isEmbajadoresLocation(l))) locationSummary = 'Embajadores';
  else if (locations.length === 1) locationSummary = locations[0];
  else if (locations.length > 1) locationSummary = t(lang, 'nTheaters', locations.length);

  return (
    <>
      <button
        className={`sessions-toggle ${isOpen ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpenPopupId(isOpen ? null : popupId);
        }}
      >
        <span className="toggle-icon">▼</span>
        <span>{dateRange}</span>
        {locationSummary && <span className="location-summary">{locationSummary}</span>}
        <span className="sessions-count">{film.dates.length}</span>
      </button>
      <div
        id={popupId}
        className={`sessions-popup ${isOpen ? 'show' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GroupedSessions
          film={film}
          lang={lang}
          dateLocale={dateLocale}
          getFilmTitle={getFilmTitle}
          getCalendarUrl={getCalendarUrl}
          getFallbackUrl={getFallbackUrl}
          onOpenModal={onOpenModal}
        />
      </div>
    </>
  );
}
