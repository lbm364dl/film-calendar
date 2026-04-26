'use client';

import { memo } from 'react';
import type { Film, SessionModalData, DateEntry } from '@/lib/types';
import type { LangKey } from '@/lib/translations';
import type { CompactBreakdown } from '@/lib/recommender';
import type { MoodShelf } from '@/hooks/useMoodShelves';
import type { SimilarNeighborLite } from '@/components/FilmGridTile';
import FilmGridTile from '@/components/FilmGridTile';

interface Props {
  shelves: MoodShelf[];
  lang: LangKey;
  dateLocale: string;
  matchScores: Record<number, number>;
  breakdowns: Record<number, CompactBreakdown>;
  similarByFilmId: Record<number, SimilarNeighborLite[]>;
  watchedUrls: Set<string> | null;
  openPopupId: string | null;
  setOpenPopupId: (id: string | null) => void;
  getFilmTitle: (film: Film) => string;
  getCalendarUrl: (film: Film, dateObj: DateEntry) => string;
  getFallbackUrl: (film: Film, dateObj: DateEntry) => string;
  onOpenModal: (data: SessionModalData) => void;
}

function MoodShelvesInner({
  shelves, lang, dateLocale,
  matchScores, breakdowns, similarByFilmId, watchedUrls,
  openPopupId, setOpenPopupId,
  getFilmTitle, getCalendarUrl, getFallbackUrl, onOpenModal,
}: Props) {
  if (shelves.length === 0) return null;

  return (
    <section className="mood-shelves" aria-label={lang === 'es' ? 'Estanterías por ambiente' : 'Mood shelves'}>
      {shelves.map(shelf => (
        <div key={shelf.id} className="mood-shelf">
          <h3 className="mood-shelf-title">{shelf.label[lang]}</h3>
          <div className="mood-shelf-row">
            {shelf.films.map(film => (
              <div key={film.id} className="mood-shelf-tile-wrap">
                <FilmGridTile
                  film={film}
                  lang={lang}
                  dateLocale={dateLocale}
                  openPopupId={openPopupId}
                  setOpenPopupId={setOpenPopupId}
                  matchScore={matchScores[film.id]}
                  breakdown={breakdowns[film.id]}
                  generalSimilar={similarByFilmId[film.id]}
                  isWatched={!!(watchedUrls && film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl))}
                  getFilmTitle={getFilmTitle}
                  getCalendarUrl={getCalendarUrl}
                  getFallbackUrl={getFallbackUrl}
                  onOpenModal={onOpenModal}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export default memo(MoodShelvesInner);
