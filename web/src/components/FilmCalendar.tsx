'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';
import type { Film, DateEntry } from '@/lib/types';
import { setLangCookie, savePreference, getTheaterFallbackUrl, generateCalendarUrl } from '@/lib/film-helpers';
import { useFilmData } from '@/hooks/useFilmData';
import { useFilmFilters } from '@/hooks/useFilmFilters';
import { useUrlParams } from '@/hooks/useUrlParams';
import { useLetterboxd } from '@/hooks/useLetterboxd';
import { useSessionModal, useLbModal, useMoreFiltersModal, useEscapeKey } from '@/hooks/useModal';
import { useHelpModal } from '@/hooks/useHelpTooltip';
import AuthButton from '@/components/AuthButton';
import FilmCard from '@/components/FilmCard';
import FilmGridTile from '@/components/FilmGridTile';
import ThemeToggle from '@/components/ThemeToggle';
import ViewToggle, { useViewMode } from '@/components/ViewToggle';
import { SkeletonCardGrid, SkeletonFilters } from '@/components/SkeletonCard';
import { DayStrip, CalendarPopover, buildNextDays } from '@/components/DayStrip';
import ActiveFilterChips from '@/components/ActiveFilterChips';
import FiltersGrid from '@/components/FiltersGrid';
import SessionModal from '@/components/SessionModal';
import LetterboxdModal from '@/components/LetterboxdModal';
import MoreFiltersModal from '@/components/MoreFiltersModal';
import HelpModal from '@/components/HelpModal';

interface FilmCalendarProps {
  initialLang: LangKey;
  initialWatchlistUrls: string[];
  initialWatchedUrls: string[];
  initialWatchlistActive: boolean;
  initialWatchedActive: boolean;
  initialUserId: string | null;
  initialUserEmail: string | null;
  initialScores: Record<number, number>;
  initialBreakdowns: Record<number, any>;
  initialSortBy?: 'rating' | 'viewers' | 'affinity';
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
  initialBreakdowns,
  initialSortBy = 'rating',
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
  const { allFilms, loading, error } = useFilmData();

  // ─ Letterboxd ─
  const lb = useLetterboxd({
    initialWatchlistUrls, initialWatchedUrls,
    initialWatchlistActive, initialWatchedActive,
    initialUserId, initialScores, initialBreakdowns,
  });

  // ─ Filters ─
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);

  const filters = useFilmFilters({
    allFilms,
    watchlistUrls: lb.watchlistUrls, watchedUrls: lb.watchedUrls,
    watchlistActive: lb.watchlistActive, watchedActive: lb.watchedActive,
    showWatched: lb.showWatched,
    matchScores: lb.matchScores,
    initialSortBy,
  });

  // ─ URL sync ─
  useUrlParams({
    searchTerm: filters.searchTerm,
    selectedDate: filters.selectedDate,
    selectedTheaters: filters.selectedTheaters,
    selectedGenres: filters.selectedGenres,
    selectedCountries: filters.selectedCountries,
    selectedLanguages: filters.selectedLanguages,
    allGenres: filters.allGenres,
    allCountries: filters.allCountries,
    allLanguages: filters.allLanguages,
    selectedDecades: filters.selectedDecades,
    selectedRuntimeCategories: filters.selectedRuntimeCategories,
    selectedDays: filters.selectedDays,
    decades: filters.decades,
    versionFilter: filters.versionFilter,
    sortBy: filters.sortBy,
    specialFilter: filters.specialFilter,
    lastChanceFilter: filters.lastChanceFilter,
    allFilmsLength: allFilms.length,
    setSearchTerm: filters.setSearchTerm,
    setSelectedDate: filters.setSelectedDate,
    setSelectedGenres: filters.setSelectedGenres,
    setSelectedCountries: filters.setSelectedCountries,
    setSelectedLanguages: filters.setSelectedLanguages,
    setSelectedDecades: filters.setSelectedDecades,
    setSelectedRuntimeCategories: filters.setSelectedRuntimeCategories,
    setSelectedDays: filters.setSelectedDays,
    setVersionFilter: filters.setVersionFilter,
    setSortBy: filters.setSortBy,
    setSpecialFilter: filters.setSpecialFilter,
    setLastChanceFilter: filters.setLastChanceFilter,
  });

  // ─ Auto-switch sort based on recommendation availability ─
  // Only react to transitions in recommendReady, never on initial mount:
  // the server already set the correct sort via initialSortBy.
  const prevRecommendReady = useRef(lb.recommendReady);
  useEffect(() => {
    const prev = prevRecommendReady.current;
    if (lb.recommendReady && !prev) {
      const urlSort = new URLSearchParams(window.location.search).get('sort');
      if (!urlSort) filters.setSortBy('affinity');
    } else if (prev && !lb.recommendReady && filters.sortBy === 'affinity') {
      filters.setSortBy('rating');
    }
    prevRecommendReady.current = lb.recommendReady;
  }, [lb.recommendReady, filters.setSortBy, filters.sortBy]);

  // ─ Modals ─
  const { modal, modalClosing, openModal, closeModal } = useSessionModal();
  const { showLbModal, lbModalClosing, openLbModal, closeLbModal } = useLbModal();
  const { showMoreFilters, moreFiltersClosing, openMoreFilters, closeMoreFilters } = useMoreFiltersModal();
  const helpModal = useHelpModal();

  const escapeHandlers = useMemo(() => [
    () => {
      if (showLbModal) { closeLbModal(); return; }
      if (showMoreFilters) { closeMoreFilters(); return; }
      if (modal) { closeModal(); return; }
      setOpenPopupId(null);
    },
  ], [showLbModal, closeLbModal, showMoreFilters, closeMoreFilters, closeModal]);
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

  // True while films are fetching OR during the transient window where data
  // has arrived but useDeferredValue/displayedCount haven't yet produced visible films.
  // Used to swap filters + grid for skeletons together, so the UI flips once.
  const filmsNotReady = !error && (
    loading ||
    (allFilms.length > 0 && filters.filteredFilms.length > 0 && filters.visibleFilms.length === 0)
  );

  // ─ Day strip + calendar ─
  // Count upcoming sessions per ISO date across all films (unfiltered: we show
  // a stable "how much is happening" signal regardless of current filters).
  const filmCountByIso = useMemo(() => {
    const byIso = new Map<string, Set<number>>();
    for (const film of allFilms) {
      for (const d of film.dates) {
        const iso = d.timestamp.slice(0, 10);
        if (!iso) continue;
        let set = byIso.get(iso);
        if (!set) { set = new Set(); byIso.set(iso, set); }
        set.add(film.id);
      }
    }
    const out = new Map<string, number>();
    byIso.forEach((set, iso) => out.set(iso, set.size));
    return out;
  }, [allFilms]);

  const nextDays = useMemo(() => buildNextDays(filmCountByIso), [filmCountByIso]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode();

  // ─ Dynamic header subtitle: "N películas · N cines · sábado 18 abril, 2026" ─
  const headerStats = useMemo(() => {
    const filmCount = allFilms.length;
    const theaterSet = new Set<string>();
    for (const film of allFilms) {
      for (const d of film.dates) {
        if (d.location && d.location !== 'Unknown') theaterSet.add(d.location);
      }
    }
    const theaterCount = theaterSet.size;
    const nowStr = new Date().toLocaleDateString(dateLocale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const filmsLabel = lang === 'es'
      ? `${filmCount} película${filmCount === 1 ? '' : 's'}`
      : `${filmCount} film${filmCount === 1 ? '' : 's'}`;
    const theatersLabel = lang === 'es'
      ? `${theaterCount} cine${theaterCount === 1 ? '' : 's'}`
      : `${theaterCount} theater${theaterCount === 1 ? '' : 's'}`;
    return `${filmsLabel} · ${theatersLabel} · ${nowStr}`;
  }, [allFilms, dateLocale, lang]);

  // ─ Render ─
  return (
    <div className="container" onClick={() => { setOpenPopupId(null); }}>
      {/* Header — Direction C: serif wordmark w/ italic accent on "Calendar" */}
      <header>
        <div className="header-top-row">
          <AuthButton
            lang={lang}
            userId={initialUserId}
            userEmail={initialUserEmail}
            hasLetterboxd={!!(lb.watchlistUrls || lb.watchedUrls || lb.recommendReady)}
            onOpenLetterboxd={openLbModal}
          />
          <div className="header-actions">
            <ThemeToggle />
            <div className="lang-toggle">
              <button className={`lang-btn ${lang === 'es' ? 'active' : ''}`} onClick={() => setLang('es')}>ES</button>
              <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
            </div>
          </div>
        </div>
        <h1>
          Madrid Film <span className="h1-accent">Calendar</span>
        </h1>
        <p className="subtitle">
          {allFilms.length > 0 ? headerStats : t(lang, 'subtitle')}
        </p>
      </header>

      {/* Calendar popover — rendered above the filter bar so it floats over it on desktop. */}
      {calendarOpen && !filmsNotReady && (
        <div style={{ position: 'relative', width: '100%', maxWidth: 1200, margin: '0 auto' }}>
          <CalendarPopover
            lang={lang}
            selectedDate={filters.selectedDate}
            filmCountByIso={filmCountByIso}
            onSelect={filters.setSelectedDate}
            onClose={() => setCalendarOpen(false)}
          />
        </div>
      )}

      {/* Active filter chips row */}
      {!filmsNotReady && (
        <ActiveFilterChips
          lang={lang}
          versionFilter={filters.versionFilter}
          setVersionFilter={filters.setVersionFilter}
          decades={filters.decades}
          selectedDecades={filters.selectedDecades}
          setSelectedDecades={filters.setSelectedDecades}
          selectedRuntimeCategories={filters.selectedRuntimeCategories}
          setSelectedRuntimeCategories={filters.setSelectedRuntimeCategories}
          selectedDays={filters.selectedDays}
          setSelectedDays={filters.setSelectedDays}
          allGenres={filters.allGenres}
          selectedGenres={filters.selectedGenres}
          setSelectedGenres={filters.setSelectedGenres}
          allCountries={filters.allCountries}
          selectedCountries={filters.selectedCountries}
          setSelectedCountries={filters.setSelectedCountries}
          allLanguages={filters.allLanguages}
          selectedLanguages={filters.selectedLanguages}
          setSelectedLanguages={filters.setSelectedLanguages}
          specialFilter={filters.specialFilter}
          setSpecialFilter={filters.setSpecialFilter}
          lastChanceFilter={filters.lastChanceFilter}
          setLastChanceFilter={filters.setLastChanceFilter}
          onClearAll={filters.clearAllFilters}
        />
      )}

      {/* Filters — skeleton until films arrive, so users see they're not interactive yet */}
      {filmsNotReady ? (
        <SkeletonFilters />
      ) : (
        <FiltersGrid
          lang={lang}
          searchTerm={filters.searchTerm}
          setSearchTerm={filters.setSearchTerm}
          days={nextDays}
          selectedDate={filters.selectedDate}
          setSelectedDate={filters.setSelectedDate}
          onOpenCalendar={() => setCalendarOpen(v => !v)}
          selectedTheaters={filters.selectedTheaters}
          onToggleTheater={filters.toggleTheater}
          onToggleTheaterGroup={filters.toggleTheaterGroup}
          onSelectAllTheaters={filters.selectAllTheaters}
          onSelectNoneTheaters={filters.selectNoneTheaters}
          onOpenMoreFilters={openMoreFilters}
          activeAdvancedFilterCount={filters.activeAdvancedFilterCount}
          zipInputRef={lb.zipInputRef}
          onZipUpload={lb.handleZipUpload}
          onHelp={helpModal.open}
          onClearAllFilters={filters.clearAllFilters}
        />
      )}

      {/* Stats + View toggle + Sort toggle */}
      <div className="stats">
        <div className="stats-row">
          <span>
            {filmsNotReady
              ? t(lang, 'loading')
              : (() => {
                  // "Hoy · 47 películas" or "Dom 19 abr · 12 películas" per DC.
                  const todayIso = new Date().toISOString().slice(0, 10);
                  let prefix: string;
                  if (!filters.selectedDate || filters.selectedDate === todayIso) {
                    prefix = lang === 'es' ? 'Hoy' : 'Today';
                  } else {
                    const d = new Date(filters.selectedDate + 'T12:00:00');
                    prefix = d.toLocaleDateString(dateLocale, {
                      weekday: 'short', day: 'numeric', month: 'short',
                    }).replace(/\.$/, '');
                  }
                  return (
                    <>
                      <span className="stats-prefix">{prefix}</span>
                      <span className="stats-sep"> · </span>
                      <span className="stats-count">{t(lang, 'filmCount', filters.filteredFilms.length)}</span>
                    </>
                  );
                })()}
          </span>
          <div className="stats-right">
          <ViewToggle mode={viewMode} onChange={setViewMode} disabled={filmsNotReady} lang={lang} />
          <button
            className={`sort-toggle${filters.sortBy === 'affinity' ? '' : ' sort-neutral'}`}
            disabled={filmsNotReady}
            style={filmsNotReady ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => {
              const options: Array<'rating' | 'viewers' | 'affinity'> = lb.recommendReady
                ? ['rating', 'viewers', 'affinity']
                : ['rating', 'viewers'];
              const idx = options.indexOf(filters.sortBy);
              filters.setSortBy(options[(idx + 1) % options.length]);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h12M3 18h6" />
            </svg>
            <span>
              {filters.sortBy === 'rating' ? t(lang, 'sortByRating')
                : filters.sortBy === 'viewers' ? t(lang, 'sortByViewers')
                : t(lang, 'sortByMatch')}
            </span>
          </button>
          </div>
        </div>
        <span className="calendar-hint">{t(lang, 'calendarHint')}</span>
      </div>

      {error && <div className="loading">{t(lang, 'errorLoading')}</div>}

      {/* Skeleton grid during loading AND the transient window (useDeferredValue lag
          + the displayedCount effect) so we never briefly expose the empty layout. */}
      {filmsNotReady && <SkeletonCardGrid count={9} />}

      {/* Film grid — only render when we actually have visible films to show */}
      {!loading && !error && filters.visibleFilms.length > 0 && (
        <>
          <div className={`films-grid-wrap${filters.isFiltering ? ' filtering' : ''}`}>
            {filters.isFiltering && filters.visibleFilms.length > 0 && <div className="filtering-spinner" />}
            <div className={`films-grid${viewMode === 'grid' ? ' is-grid' : ''}`} style={{ display: 'grid' }}>
              {filters.visibleFilms.map(film => (
                viewMode === 'grid' ? (
                  <FilmGridTile
                    key={film.id}
                    film={film}
                    lang={lang}
                    dateLocale={dateLocale}
                    openPopupId={openPopupId}
                    setOpenPopupId={setOpenPopupId}
                    matchScore={lb.matchScores[film.id]}
                    isWatched={!!(lb.watchedUrls && film.letterboxdShortUrl && lb.watchedUrls.has(film.letterboxdShortUrl))}
                    getFilmTitle={getFilmTitle}
                    getCalendarUrl={getCalendarUrl}
                    getFallbackUrl={getTheaterFallbackUrl}
                    onOpenModal={openModal}
                  />
                ) : (
                  <FilmCard
                    key={film.id}
                    film={film}
                    lang={lang}
                    dateLocale={dateLocale}
                    openPopupId={openPopupId}
                    setOpenPopupId={setOpenPopupId}
                    matchScore={lb.matchScores[film.id]}
                    breakdown={lb.breakdowns[film.id]}
                    isWatched={!!(lb.watchedUrls && film.letterboxdShortUrl && lb.watchedUrls.has(film.letterboxdShortUrl))}
                    formatDate={formatDate}
                    getFilmTitle={getFilmTitle}
                    getCalendarUrl={getCalendarUrl}
                    getFallbackUrl={getTheaterFallbackUrl}
                    onOpenModal={openModal}
                  />
                )
              ))}
            </div>
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

      {/* Genuine no-results state: data loaded, but filters matched nothing */}
      {!loading && !error && allFilms.length > 0 && filters.filteredFilms.length === 0 && (
        <div className="no-results" style={{ display: 'block' }}>{t(lang, 'noResults')}</div>
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

      {/* More Filters Modal */}
      {(showMoreFilters || moreFiltersClosing) && (
        <MoreFiltersModal
          show={showMoreFilters}
          closing={moreFiltersClosing}
          onClose={closeMoreFilters}
          lang={lang}
          decades={filters.decades}
          selectedDecades={filters.selectedDecades}
          setSelectedDecades={filters.setSelectedDecades}
          selectedRuntimeCategories={filters.selectedRuntimeCategories}
          setSelectedRuntimeCategories={filters.setSelectedRuntimeCategories}
          selectedDays={filters.selectedDays}
          setSelectedDays={filters.setSelectedDays}
          allGenres={filters.allGenres}
          selectedGenres={filters.selectedGenres}
          setSelectedGenres={filters.setSelectedGenres}
          allCountries={filters.allCountries}
          selectedCountries={filters.selectedCountries}
          setSelectedCountries={filters.setSelectedCountries}
          allLanguages={filters.allLanguages}
          selectedLanguages={filters.selectedLanguages}
          setSelectedLanguages={filters.setSelectedLanguages}
          versionFilter={filters.versionFilter}
          setVersionFilter={filters.setVersionFilter}
          specialFilter={filters.specialFilter}
          setSpecialFilter={filters.setSpecialFilter}
          lastChanceFilter={filters.lastChanceFilter}
          setLastChanceFilter={filters.setLastChanceFilter}
          selectedTheaters={filters.selectedTheaters}
          onToggleTheater={filters.toggleTheater}
          onToggleTheaterGroup={filters.toggleTheaterGroup}
          onSelectAllTheaters={filters.selectAllTheaters}
          onSelectNoneTheaters={filters.selectNoneTheaters}
          activeAdvancedFilterCount={filters.activeAdvancedFilterCount}
          resultsCount={filters.filteredFilms.length}
          onClearAll={filters.clearAllFilters}
          onHelp={helpModal.open}
        />
      )}

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

      {/* Help Modal */}
      {helpModal.content && (
        <HelpModal
          title={helpModal.content.title}
          body={helpModal.content.body}
          closing={helpModal.closing}
          onClose={helpModal.close}
        />
      )}
    </div>
  );
}
