'use client';

import { t } from '@/lib/translations';
import type { Film, DateEntry, SessionModalData } from '@/lib/types';
import type { LangKey } from '@/lib/translations';

interface GroupedSessionsProps {
  film: Film;
  lang: LangKey;
  dateLocale: string;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

export default function GroupedSessions({
  film, lang, dateLocale, getFilmTitle,
  getCalendarUrl, getFallbackUrl, onOpenModal,
}: GroupedSessionsProps) {
  const grouped: Record<string, DateEntry[]> = {};
  film.dates.forEach(d => {
    const dayKey = d.timestamp.split(' ')[0];
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(d);
  });
  const sortedDays = Object.keys(grouped).sort();

  return (
    <>
      {sortedDays.map(dayKey => {
        const sessions = grouped[dayKey].sort((a, b) =>
          new Date(a.timestamp.replace(' ', 'T')).getTime() - new Date(b.timestamp.replace(' ', 'T')).getTime()
        );
        const dayDate = new Date(dayKey + 'T12:00:00');
        const dayLabel = dayDate.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' });

        return (
          <div className="sessions-day" key={dayKey}>
            <div className="sessions-day-header">{dayLabel}</div>
            <div className="sessions-day-times">
              {sessions.map((dateObj, i) => {
                const time = new Date(dateObj.timestamp.replace(' ', 'T')).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
                const calendarUrl = getCalendarUrl(film, dateObj);
                const hasDirectUrl = !!(dateObj.url_tickets && dateObj.url_tickets.trim());
                const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
                const filmPageUrl = dateObj.url_info || film.theaterLink || getFallbackUrl(film, dateObj);
                const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);
                const dateLabel = new Date(dateObj.timestamp.replace(' ', 'T')).toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' });
                const timeLabel = `${dateLabel} ${time}${dateObj.location ? ' - ' + dateObj.location : ''}`;

                return (
                  <button
                    key={i}
                    className="session-time"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenModal({ titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl });
                    }}
                  >
                    <span className="time">{time}</span>
                    {dateObj.location && dateObj.location !== 'Unknown' && (
                      <span className="location">{dateObj.location}</span>
                    )}
                    {dateObj.version === 'dubbed' && (
                      <span className="version-badge dubbed" title={t(lang, 'dubbedTooltip')}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                        <span>ES</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
