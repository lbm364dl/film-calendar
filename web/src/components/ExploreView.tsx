'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { t } from '@/lib/translations';
import type { LangKey } from '@/lib/translations';

interface SearchFilm {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
}

interface ExploreFilmInfo {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  letterboxdUrl: string | null;
  directors?: string;
}

interface ShelfFilm {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  isScreening: boolean;
}

interface GraphLevel {
  rootFilm: ExploreFilmInfo;
  shelfFilms: ShelfFilm[];
  selectedTmdbId: number | null;
}

export default function ExploreView({ lang }: { lang: LangKey }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchFilm[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [levels, setLevels] = useState<GraphLevel[]>([]);
  const [isLoadingLevel, setIsLoadingLevel] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/explore/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults(data.films ?? []);
        setShowDropdown(true);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const fetchAndPushLevel = useCallback(async (tmdbId: number, levelIndex: number | null) => {
    setIsLoadingLevel(true);
    try {
      const res = await fetch(`/api/explore/connections?tmdb_id=${tmdbId}`);
      if (!res.ok) return;
      const data = await res.json();
      const shelfFilms: ShelfFilm[] = (data.connections ?? []).map((c: { film: ShelfFilm; isScreening: boolean }) => ({
        tmdbId: c.film.tmdbId,
        title: c.film.title,
        year: c.film.year,
        posterPath: c.film.posterPath,
        isScreening: c.isScreening ?? false,
      }));
      const newLevel: GraphLevel = { rootFilm: data.film, shelfFilms, selectedTmdbId: null };

      setLevels(prev => {
        if (levelIndex === null) return [newLevel];
        const next = prev.slice(0, levelIndex + 1);
        next[levelIndex] = { ...next[levelIndex], selectedTmdbId: tmdbId };
        return [...next, newLevel];
      });

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } finally {
      setIsLoadingLevel(false);
    }
  }, []);

  const handleSelectFilm = useCallback((film: SearchFilm) => {
    setQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    fetchAndPushLevel(film.tmdbId, null);
  }, [fetchAndPushLevel]);

  const handleClickShelfFilm = useCallback((film: ShelfFilm, levelIndex: number) => {
    fetchAndPushLevel(film.tmdbId, levelIndex);
  }, [fetchAndPushLevel]);

  return (
    <div className="explore-view">
      {/* Search box */}
      <div className="explore-search-wrap">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t(lang, 'exploreSearch')}
          onFocus={() => { if (query.trim().length >= 2) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => { if (!isSearching) setShowDropdown(false); }, 200)}
        />
        {(isSearching || (showDropdown && query.trim().length >= 2)) && (
          <div className="explore-dropdown">
            {isSearching ? (
              <div className="explore-dropdown-item explore-dropdown-status">
                <span className="explore-dropdown-spinner" />
                <span className="explore-dropdown-year">
                  {lang === 'es' ? 'Buscando...' : 'Searching...'}
                </span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="explore-dropdown-item explore-dropdown-status">
                <span className="explore-dropdown-year">{t(lang, 'exploreNoResults')}</span>
              </div>
            ) : searchResults.map(film => (
              <button key={film.tmdbId} className="explore-dropdown-item" onMouseDown={() => handleSelectFilm(film)}>
                {film.posterPath
                  ? <img className="explore-dropdown-thumb" src={`https://image.tmdb.org/t/p/w92${film.posterPath}`} alt="" />
                  : <div className="explore-dropdown-thumb" />}
                <span>
                  <span className="explore-dropdown-title">{film.title}</span>
                  {film.year && <span className="explore-dropdown-year"> ({film.year})</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {levels.length === 0 && !isLoadingLevel && (
        <p className="explore-hint">{t(lang, 'exploreHint')}</p>
      )}

      {/* Expanding graph levels */}
      {levels.map((level, i) => (
        <div key={`${level.rootFilm.tmdbId}-${i}`} className="explore-graph-level">

          {/* Edge connector between levels */}
          {i > 0 && (
            <div className="explore-edge">
              <div className="explore-edge-line" />
              <div className="explore-edge-pill">
                {level.rootFilm.posterPath && (
                  <img className="explore-edge-thumb" src={`https://image.tmdb.org/t/p/w92${level.rootFilm.posterPath}`} alt="" />
                )}
                <span className="explore-edge-title">{level.rootFilm.title}</span>
                {level.rootFilm.year && <span className="explore-edge-year"> ({level.rootFilm.year})</span>}
              </div>
              <div className="explore-edge-line" />
            </div>
          )}

          {/* Root film header — only on first level */}
          {i === 0 && (
            <div className="explore-root-header">
              {level.rootFilm.posterPath && (
                <img className="explore-root-poster" src={`https://image.tmdb.org/t/p/w185${level.rootFilm.posterPath}`} alt="" />
              )}
              <div className="explore-root-info">
                <h2 className="explore-center-title">
                  {level.rootFilm.title}
                  {level.rootFilm.year && <span className="explore-center-year"> ({level.rootFilm.year})</span>}
                </h2>
                {level.rootFilm.directors && <p className="explore-director">{level.rootFilm.directors}</p>}
                {level.rootFilm.letterboxdUrl && (
                  <a className="explore-lb-link" href={level.rootFilm.letterboxdUrl} target="_blank" rel="noopener noreferrer">
                    Letterboxd ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Poster shelf */}
          {level.shelfFilms.length === 0 ? (
            <p className="explore-empty">{t(lang, 'exploreNoConnections')}</p>
          ) : (
            <div className="explore-poster-shelf">
              {level.shelfFilms.map(film => (
                <button
                  key={film.tmdbId}
                  className={`explore-poster-card${level.selectedTmdbId === film.tmdbId ? ' explore-poster-selected' : ''}`}
                  onClick={() => handleClickShelfFilm(film, i)}
                >
                  <div className="explore-poster-img-wrap">
                    {film.posterPath
                      ? <img src={`https://image.tmdb.org/t/p/w185${film.posterPath}`} alt="" />
                      : <div className="explore-poster-placeholder" />}
                    {film.isScreening && (
                      <span className="explore-poster-screening">
                        {lang === 'es' ? 'En cartelera' : 'Screening'}
                      </span>
                    )}
                  </div>
                  <div className="explore-poster-title">{film.title}</div>
                  {film.year && <div className="explore-poster-year">{film.year}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {isLoadingLevel && (
        <div className="explore-level-loading">
          <div className="explore-level-spinner" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
