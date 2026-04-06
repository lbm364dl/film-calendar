'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  if (film.dates.length === 1) {
    return (
      <SessionRow
        film={film}
        dateObj={film.dates[0]}
        lang={lang}
        formatDate={formatDate}
        getFilmTitle={getFilmTitle}
        getCalendarUrl={getCalendarUrl}
        getFallbackUrl={getFallbackUrl}
        onOpenModal={onOpenModal}
      />
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
    <SessionsToggleWithPortal
      popupId={popupId}
      isOpen={isOpen}
      dateRange={dateRange}
      locationSummary={locationSummary}
      sessionsCount={film.dates.length}
      film={film}
      lang={lang}
      dateLocale={dateLocale}
      setOpenPopupId={setOpenPopupId}
      getFilmTitle={getFilmTitle}
      getCalendarUrl={getCalendarUrl}
      getFallbackUrl={getFallbackUrl}
      onOpenModal={onOpenModal}
    />
  );
}

function SessionsToggleWithPortal({
  popupId, isOpen, dateRange, locationSummary, sessionsCount,
  film, lang, dateLocale, setOpenPopupId,
  getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: {
  popupId: string;
  isOpen: boolean;
  dateRange: string;
  locationSummary: string;
  sessionsCount: number;
  film: Film;
  lang: LangKey;
  dateLocale: string;
  setOpenPopupId: (id: string | null) => void;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    if (!isOpen || !toggleRef.current || !popupRef.current) return;
    const toggleRect = toggleRef.current.getBoundingClientRect();
    const popup = popupRef.current;
    popup.style.position = 'fixed';
    popup.style.top = `${toggleRect.bottom + 4}px`;
    popup.style.left = `${toggleRect.left}px`;
    popup.style.width = `${toggleRect.width}px`;
    popup.style.zIndex = '1000';
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePosition);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, updatePosition]);

  return (
    <>
      <button
        ref={toggleRef}
        className={`sessions-toggle ${isOpen ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpenPopupId(isOpen ? null : popupId);
        }}
      >
        <span className="toggle-icon">▼</span>
        <span>{dateRange}</span>
        {locationSummary && <span className="location-summary">{locationSummary}</span>}
        <span className="sessions-count">{sessionsCount}</span>
      </button>
      {mounted && createPortal(
        <div
          ref={popupRef}
          id={popupId}
          className={`sessions-popup ${isOpen ? 'show' : ''}`}
          style={!isOpen ? { position: 'fixed', visibility: 'hidden', pointerEvents: 'none' } : undefined}
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
        </div>,
        document.body
      )}
    </>
  );
}
