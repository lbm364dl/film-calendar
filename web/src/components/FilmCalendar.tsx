'use client';

import { useState, useCallback, useMemo } from 'react';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import type { Film, DateEntry } from '@/lib/types';
import { setLangCookie, savePreference, getTheaterFallbackUrl, generateCalendarUrl } from '@/lib/film-helpers';
import { useFilmData } from '@/hooks/useFilmData';
import { useFilmFilters } from '@/hooks/useFilmFilters';
import { useUrlParams } from '@/hooks/useUrlParams';
import { useLetterboxd } from '@/hooks/useLetterboxd';
import { useSessionModal, useLbModal, useEscapeKey } from '@/hooks/useModal';
import AuthButton from '@/components/AuthButton';
import FilmCard from '@/components/FilmCard';
import FiltersGrid from '@/components/FiltersGrid';
import SessionModal from '@/components/SessionModal';
import LetterboxdModal from '@/components/LetterboxdModal';

interface FilmCalendarProps {
  initialLang: LangKey;
  initialWatchlistUrls: string[];
  initialWatchedUrls: string[];
  initialWatchlistActive: boolean;
  initialWatchedActive: boolean;
  initialUserId: string | null;
  initialUserEmail: string | null;
  initialScores: Record<number, number>;
}

export default function FilmCalendar({
  initialLang,
  initialWatchlistUrls,
  initialWatchedUrls,
  initialWatchlistActive,
  initialWatchedActive,
  initialUserId,
  initialUserEmail,
  initialScores,
}: FilmCalendarProps) {
  // ─ Language ─
  const [lang, setLangState] = useState<LangKey>(initialLang);
  const setLang = useCallback((l: LangKey) => {
    setLangState(l);
    setLangCookie(l);
    if (initialUserId) savePreference({ lang: l });
  }, [initialUserId]);

  const dateLocale = lang === 'es' ? 'es-ES' : 'en-GB';

  // ─ Data ─
  const { allFilms, loading, error, yearBoundsMin, yearBoundsMax } = useFilmData();

  // ─ Letterboxd ─
  const lb = useLetterboxd({
    initialWatchlistUrls, initialWatchedUrls,
    initialWatchlistActive, initialWatchedActive,
    initialUserId, initialScores,
  });

  // ─ Filters ─
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);

  const filters = useFilmFilters({
    allFilms, yearBoundsMin, yearBoundsMax,
    watchlistUrls: lb.watchlistUrls, watchedUrls: lb.watchedUrls,
    watchlistActive: lb.watchlistActive, watchedActive: lb.watchedActive,
    showWatched: lb.showWatched,
    sortByMatch: lb.sortByMatch, matchScores: lb.matchScores,
  });

  // ─ URL sync ─
  useUrlParams({
    searchTerm: filters.searchTerm,
    selectedTheater: filters.selectedTheater,
    selectedDate: filters.selectedDate,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    yearBoundsMin, yearBoundsMax,
    allFilmsLength: allFilms.length,
    setSearchTerm: filters.setSearchTerm,
    setSelectedTheater: filters.setSelectedTheater,
    setSelectedDate: filters.setSelectedDate,
    setYearMin: filters.setYearMin,
    setYearMax: filters.setYearMax,
  });

  // ─ Modals ─
  const { modal, modalClosing, openModal, closeModal } = useSessionModal();
  const { showLbModal, lbModalClosing, openLbModal, closeLbModal } = useLbModal();

  const escapeHandlers = useMemo(() => [
    () => { if (showLbModal) { closeLbModal(); return; } closeModal(); setOpenPopupId(null); },
  ], [showLbModal, closeLbModal, closeModal]);
  useEscapeKey(escapeHandlers);

  // ─ Derived helpers ─
  const getFilmTitle = useCallback((film: Film) => {
    if (lang === 'en' && film.titleEn) return film.titleEn;
    return film.title;
  }, [lang]);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(dateLocale, {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }, [dateLocale]);

  const getCalendarUrl = useCallback((film: Film, dateObj: DateEntry) => {
    return generateCalendarUrl(getFilmTitle(film), film, dateObj);
  }, [getFilmTitle]);

  // ─ Computed ─
  const lbHasData = !!(lb.watchlistUrls || lb.watchedUrls || lb.recommendReady || lb.enrichmentTotal > 0);
  const lbFilterActive = !!((lb.watchlistUrls && lb.watchlistActive) || (lb.watchedUrls && lb.watchedActive));

  // ─ Render ─
  return (
    <div className="container" onClick={() => { setOpenPopupId(null); }}>
      {/* Header */}
      <header>
        <div className="header-top-row">
          <AuthButton lang={lang} userId={initialUserId} userEmail={initialUserEmail} />
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => setLang('es')}>ES</button>
            <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
        <h1>{t(lang, 'siteTitle')}</h1>
        <p className="subtitle">{t(lang, 'subtitle')}</p>
      </header>

      {/* Filters */}
      <FiltersGrid
        lang={lang}
        searchTerm={filters.searchTerm}
        setSearchTerm={filters.setSearchTerm}
        selectedTheater={filters.selectedTheater}
        setSelectedTheater={filters.setSelectedTheater}
        selectedDate={filters.selectedDate}
        setSelectedDate={filters.setSelectedDate}
        yearMin={filters.yearMin}
        setYearMin={filters.setYearMin}
        yearMax={filters.yearMax}
        setYearMax={filters.setYearMax}
        yearBoundsMin={yearBoundsMin}
        yearBoundsMax={yearBoundsMax}
        lbHasData={lbHasData}
        lbFilterActive={lbFilterActive}
        onOpenLbModal={openLbModal}
        onClearAllFilters={filters.clearAllFilters}
        watchlistInputRef={lb.watchlistInputRef}
        watchedInputRef={lb.watchedInputRef}
        zipInputRef={lb.zipInputRef}
        onCsvUpload={lb.handleCsvUpload}
        onZipUpload={lb.handleZipUpload}
      />

      {/* Stats + Sort toggle */}
      <div className="stats">
        <span>{t(lang, 'filmCount', filters.filteredFilms.length)}</span>
        {lb.recommendReady && (
          <button
            className={`sort-toggle ${lb.sortByMatch ? 'active' : ''}`}
            onClick={() => lb.setSortByMatch(!lb.sortByMatch)}
          >
            {lb.sortByMatch ? t(lang, 'sortByRating') : t(lang, 'sortByMatch')}
          </button>
        )}
        <span className="calendar-hint">{t(lang, 'calendarHint')}</span>
      </div>

      {/* Loading / Error */}
      {loading && <div className="loading">{t(lang, 'loading')}</div>}
      {error && <div className="loading">{t(lang, 'errorLoading')}</div>}

      {/* Film grid */}
      {!loading && !error && (
        <>
          {filters.filteredFilms.length === 0 ? (
            <div className="no-results" style={{ display: 'block' }}>{t(lang, 'noResults')}</div>
          ) : (
            <>
              <div className="films-grid" style={{ display: 'grid' }}>
                {filters.visibleFilms.map(film => (
                  <FilmCard
                    key={film.id}
                    film={film}
                    lang={lang}
                    dateLocale={dateLocale}
                    openPopupId={openPopupId}
                    setOpenPopupId={setOpenPopupId}
                    matchScores={lb.matchScores}
                    breakdowns={lb.breakdowns}
                    recommendReady={lb.recommendReady}
                    formatDate={formatDate}
                    getFilmTitle={getFilmTitle}
                    getCalendarUrl={getCalendarUrl}
                    getFallbackUrl={getTheaterFallbackUrl}
                    onOpenModal={openModal}
                  />
                ))}
              </div>
              {filters.remaining > 0 && (
                <div className="load-more-container">
                  <button className="load-more-btn" onClick={filters.loadMore}>
                    {t(lang, 'loadMore', filters.remaining)}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-content">
          <p>{t(lang, 'footerCreated')}</p>
          <p dangerouslySetInnerHTML={{ __html: t(lang, 'footerThanks') }} />
          <p dangerouslySetInnerHTML={{ __html: t(lang, 'footerMistakes') }} />
          <p>
            <a className="github-link" href="https://github.com/lbm364dl/film-calendar" target="_blank" rel="noopener noreferrer">
              <svg className="github-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.38 6.84 9.74.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.17-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1.01.07 1.54 1.07 1.54 1.07.9 1.58 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.04.8-.23 1.65-.35 2.5-.35s1.7.12 2.5.35c1.91-1.31 2.75-1.04 2.75-1.04.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.59.69.48 3.97-1.36 6.83-5.2 6.83-9.74C22 6.58 17.52 2 12 2z" />
              </svg>
              <span>{t(lang, 'viewOnGithub')}</span>
            </a>
          </p>
        </div>
      </footer>

      {/* Letterboxd Modal */}
      {(showLbModal || lbModalClosing) && (
        <LetterboxdModal
          lang={lang}
          closing={lbModalClosing}
          onClose={closeLbModal}
          initialUserId={initialUserId}
          watchlistUrls={lb.watchlistUrls}
          watchedUrls={lb.watchedUrls}
          watchlistActive={lb.watchlistActive}
          setWatchlistActive={lb.setWatchlistActive}
          watchedActive={lb.watchedActive}
          setWatchedActive={lb.setWatchedActive}
          showWatched={lb.showWatched}
          setShowWatched={lb.setShowWatched}
          enrichmentPolling={lb.enrichmentPolling}
          enrichmentTotal={lb.enrichmentTotal}
          enrichmentProcessed={lb.enrichmentProcessed}
          recommendReady={lb.recommendReady}
          zipInputRef={lb.zipInputRef}
          onClearData={lb.clearLetterboxdData}
        />
      )}

      {/* Session Modal */}
      {modal && (
        <SessionModal
          modal={modal}
          modalClosing={modalClosing}
          lang={lang}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
