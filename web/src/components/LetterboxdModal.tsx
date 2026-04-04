'use client';

import { t } from '@/lib/translations';
import { savePreference } from '@/lib/film-helpers';
import type { LangKey } from '@/lib/translations';

interface LetterboxdModalProps {
  lang: LangKey;
  closing: boolean;
  onClose: () => void;
  initialUserId: string | null;
  watchlistUrls: Set<string> | null;
  watchedUrls: Set<string> | null;
  watchlistActive: boolean;
  setWatchlistActive: (v: boolean) => void;
  watchedActive: boolean;
  setWatchedActive: (v: boolean) => void;
  showWatched: boolean;
  setShowWatched: (v: boolean) => void;
  enrichmentPolling: boolean;
  enrichmentTotal: number;
  enrichmentProcessed: number;
  recommendReady: boolean;
  zipInputRef: React.RefObject<HTMLInputElement | null>;
  onClearData: () => void;
}

export default function LetterboxdModal({
  lang, closing, onClose,
  initialUserId,
  watchlistUrls, watchedUrls,
  watchlistActive, setWatchlistActive,
  watchedActive, setWatchedActive,
  showWatched, setShowWatched,
  enrichmentPolling, enrichmentTotal, enrichmentProcessed,
  recommendReady,
  zipInputRef,
  onClearData,
}: LetterboxdModalProps) {
  return (
    <div className={`lb-modal-overlay${closing ? ' closing' : ''}`} onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-modal-header">
          <div className="lb-modal-title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/letterboxd.svg" className="lb-modal-logo" alt="Letterboxd" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span>Letterboxd</span>
          </div>
          <button className="lb-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="lb-modal-body">
          {/* How to get your data */}
          <section className="lb-modal-section lb-instructions">
            <h3 className="lb-section-title">{t(lang, 'lbHowToTitle')}</h3>
            <ol className="lb-steps">
              <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep1') }} />
              <li dangerouslySetInnerHTML={{ __html: t(lang, 'csvStep2') }} />
              <li dangerouslySetInnerHTML={{ __html: t(lang, 'lbStep3') }} />
            </ol>
            {!initialUserId && (
              <p className="lb-persistence-note">{t(lang, 'lbSignInPrompt')}</p>
            )}
          </section>

          {/* ZIP upload (authenticated) */}
          {initialUserId && (
            <section className="lb-modal-section">
              <h3 className="lb-section-title">{t(lang, 'lbRecommendationsTitle')}</h3>
              <div className="lb-upload-row">
                <button
                  className={`lb-upload-btn${enrichmentPolling ? ' polling' : ''}`}
                  onClick={() => zipInputRef.current?.click()}
                  disabled={enrichmentPolling}
                >
                  {enrichmentPolling
                    ? t(lang, 'uploadProgress', enrichmentTotal > 0 ? Math.round((enrichmentProcessed / enrichmentTotal) * 100) : 0)
                    : enrichmentTotal > 0
                      ? t(lang, 'reuploadLabel')
                      : t(lang, 'zipUploadLabel')}
                </button>
              </div>
              {recommendReady && (
                <div className="lb-stat">{t(lang, 'enrichmentDone')}</div>
              )}
              {(enrichmentPolling || (enrichmentTotal > 0 && !recommendReady)) && (
                <div className="lb-progress">
                  <div className="lb-progress-bar" style={{ width: enrichmentTotal > 0 ? `${(enrichmentProcessed / enrichmentTotal) * 100}%` : '0%' }} />
                  <span className="lb-progress-label">
                    {enrichmentTotal > 0
                      ? t(lang, 'uploadProgressDetail', enrichmentProcessed, enrichmentTotal)
                      : t(lang, 'uploadStarting')}
                  </span>
                </div>
              )}
              <p className="lb-reupload-note">{t(lang, 'reuploadHint')}</p>
            </section>
          )}

          {/* Filters section */}
          {(watchlistUrls || watchedUrls) && (
            <section className="lb-modal-section">
              <div className="lb-section-header">
                <h3 className="lb-section-title">{t(lang, 'lbFiltersTitle')}</h3>
                <button className="lb-clear-data-btn" onClick={onClearData}>{t(lang, 'removeLetterboxdData')}</button>
              </div>

              {/* Watchlist filter */}
              {watchlistUrls && (
                <div className="lb-filter-row">
                  <div className="lb-filter-info">
                    <span className="lb-filter-label">{t(lang, 'lbWatchlistLabel')}</span>
                    <span className="lb-filter-count">{t(lang, 'watchlistCount', watchlistUrls.size)}</span>
                  </div>
                  <div className="lb-filter-controls">
                    <label className="toggle-switch" title={t(lang, 'watchlistToggleTitle')}>
                      <input
                        type="checkbox"
                        checked={watchlistActive}
                        onChange={(e) => {
                          setWatchlistActive(e.target.checked);
                          if (initialUserId) savePreference({ watchlist_active: e.target.checked });
                        }}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              )}

              {/* Watched: hide already-watched toggle */}
              {watchedUrls && (
                <div className="lb-filter-row">
                  <div className="lb-filter-info">
                    <span className="lb-filter-label">{t(lang, 'lbWatchedLabel')}</span>
                    <span className="lb-filter-count">{t(lang, 'watchedCount', watchedUrls.size)}</span>
                  </div>
                  <div className="lb-filter-controls">
                    <label className="toggle-switch" title={t(lang, 'watchedToggleTitle')}>
                      <input
                        type="checkbox"
                        checked={watchedActive && !showWatched}
                        onChange={(e) => {
                          const hide = e.target.checked;
                          setWatchedActive(hide);
                          setShowWatched(!hide);
                          if (initialUserId) savePreference({ watched_active: hide });
                        }}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
