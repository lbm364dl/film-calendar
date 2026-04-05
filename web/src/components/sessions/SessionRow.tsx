'use client';

import { isRenoirLocation } from '@/lib/film-helpers';
import { t, translateSpecialType } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';

interface SessionRowProps {
  film: Film;
  dateObj: DateEntry;
  lang: LangKey;
  formatDate: (dateStr: string) => string;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

export default function SessionRow({
  film, dateObj, lang, formatDate, getFilmTitle,
  getCalendarUrl, getFallbackUrl, onOpenModal,
}: SessionRowProps) {
  const formatted = formatDate(dateObj.timestamp);
  const calendarUrl = getCalendarUrl(film, dateObj);
  const titleLabel = `${getFilmTitle(film)}${film.year ? ` (${film.year})` : ''}`;
  const hasDirectUrl = !!(dateObj.url_tickets && dateObj.url_tickets.trim());
  const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
  const filmPageUrl = dateObj.url_info || film.theaterLink || getFallbackUrl(film, dateObj);

  let displayLocation = dateObj.location;
  if (isRenoirLocation(dateObj.location)) displayLocation = `Renoir ${dateObj.location}`;
  const timeLabel = `${formatted}${displayLocation && displayLocation !== 'Unknown' ? ' - ' + displayLocation : ''}`;

  return (
    <button
      className="date-row"
      onClick={(e) => {
        e.stopPropagation();
        onOpenModal({ titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl });
      }}
    >
      <span className="date-badge">{formatted}</span>
      {dateObj.location && dateObj.location !== 'Unknown' && (
        <span className="location-badge">{displayLocation}</span>
      )}
      {dateObj.version === 'dubbed' && (
        <span className="version-badge dubbed" title={t(lang, 'dubbedTooltip')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
          <span>ES</span>
        </span>
      )}
      {dateObj.special && (
        <span className="special-badge" title={t(lang, 'specialTooltip', translateSpecialType(dateObj.special, lang))}>
          {translateSpecialType(dateObj.special, lang)}
        </span>
      )}
    </button>
  );
}
