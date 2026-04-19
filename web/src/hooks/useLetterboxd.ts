'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { savePreference } from '@/lib/film-helpers';
import type { CompactBreakdown } from '@/lib/recommender';

interface UseLetterboxdOptions {
  initialWatchlistUrls: string[];
  initialWatchedUrls: string[];
  initialWatchlistActive: boolean;
  initialWatchedActive: boolean;
  initialUserId: string | null;
  initialScores: Record<number, number>;
  initialBreakdowns: Record<number, any>;
}

export function useLetterboxd(options: UseLetterboxdOptions) {
  const {
    initialWatchlistUrls, initialWatchedUrls,
    initialWatchlistActive, initialWatchedActive,
    initialUserId, initialScores, initialBreakdowns,
  } = options;

  const hasInitialScores = Object.keys(initialScores).length > 0;

  const [watchlistUrls, setWatchlistUrls] = useState<Set<string> | null>(
    () => initialWatchlistUrls.length > 0 ? new Set(initialWatchlistUrls) : null
  );
  const [watchedUrls, setWatchedUrls] = useState<Set<string> | null>(
    () => initialWatchedUrls.length > 0 ? new Set(initialWatchedUrls) : null
  );
  const [watchlistActive, setWatchlistActive] = useState(initialWatchlistActive);
  const [watchedActive, setWatchedActive] = useState(initialWatchedActive);

  const [matchScores, setMatchScores] = useState<Record<number, number>>(initialScores);
  const [breakdowns, setBreakdowns] = useState<Record<number, CompactBreakdown>>(initialBreakdowns ?? {});
  const [sortByMatch, setSortByMatch] = useState(false);
  const [enrichmentTotal, setEnrichmentTotal] = useState(0);
  const [enrichmentProcessed, setEnrichmentProcessed] = useState(0);
  const [enrichmentPolling, setEnrichmentPolling] = useState(false);
  const [recommendReady, setRecommendReady] = useState(hasInitialScores);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [showWatched, setShowWatched] = useState(true);

  const watchlistInputRef = useRef<HTMLInputElement>(null);
  const watchedInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Fetch recommendations from API
  const fetchRecommendations = useCallback(async () => {
    setScoresLoading(true);
    try {
      const resp = await fetch('/api/recommend');
      const data = await resp.json();
      if (resp.ok && data.scores) {
        setMatchScores(data.scores);
        setRecommendReady(Object.keys(data.scores).length > 0);
        if (data.breakdowns) setBreakdowns(data.breakdowns);
      }
    } catch (err) {
      console.error('Recommend error:', err);
    } finally {
      setScoresLoading(false);
    }
  }, []);

  // Poll enrichment progress (per-user)
  const pollEnrichment = useCallback(async (cancelled?: { current: boolean }) => {
    setEnrichmentPolling(true);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const resp = await fetch('/api/enrich-batch');
        const data = await resp.json();
        if (!resp.ok) break;
        if (cancelled?.current) break;

        setEnrichmentTotal(data.total);
        setEnrichmentProcessed(data.processed);

        if (data.total === 0 || data.done || data.processed >= data.total) {
          await fetchRecommendations();
          setEnrichmentPolling(false);
          return;
        }

        await new Promise(r => setTimeout(r, 4000));
        if (cancelled?.current) break;
      }
    } catch (err) {
      console.error('Enrichment poll error:', err);
    }
    if (!cancelled?.current) setEnrichmentPolling(false);
  }, [fetchRecommendations]);

  // CSV upload handler (watchlist only)
  const handleCsvUpload = useCallback((file: File, type: 'watchlist' | 'watched') => {
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const urls = new Set<string>();
        results.data.forEach((row: any) => {
          const uri = row['Letterboxd URI'];
          if (uri) urls.add(uri.trim());
        });
        if (urls.size > 0) {
          if (type === 'watchlist') {
            setWatchlistUrls(urls);
            setWatchlistActive(true);
            if (initialUserId) {
              const supabase = getBrowserSupabase();
              const wlRows = [...urls].map(url => ({ user_id: initialUserId, letterboxd_short_url: url }));
              const BATCH = 500;
              await supabase.from('user_watchlist_films').delete().eq('user_id', initialUserId);
              for (let i = 0; i < wlRows.length; i += BATCH) {
                await supabase.from('user_watchlist_films').insert(wlRows.slice(i, i + BATCH));
              }
              savePreference({ watchlist_active: true });
            }
          }
        }
      },
    });
  }, [initialUserId]);

  // ZIP upload handler
  const handleZipUpload = useCallback(async (file: File) => {
    if (!initialUserId) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setEnrichmentPolling(true);
      setEnrichmentProcessed(0);
      setRecommendReady(false);

      const uploadResp = await fetch('/api/upload-watched', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) {
        console.error('Upload error:', uploadData.error);
        return;
      }

      if (uploadData.watchedUrls?.length > 0) {
        setWatchedUrls(new Set(uploadData.watchedUrls));
      }
      if (uploadData.watchlistUrls?.length > 0) {
        setWatchlistUrls(new Set(uploadData.watchlistUrls));
      }
      setEnrichmentTotal(uploadData.total);
      setEnrichmentProcessed(uploadData.alreadyKnown);
      setRecommendReady(false);

      setWatchedActive(true);
      savePreference({ watched_active: true });

      await pollEnrichment();
    } catch (err) {
      console.error('ZIP upload error:', err);
      setEnrichmentPolling(false);
    }
  }, [initialUserId, pollEnrichment]);

  // Breakdowns are now cached in user_film_scores alongside scores — no background fetch needed

  // Auto-resume enrichment + fetch recommendations on mount
  useEffect(() => {
    if (!initialUserId || !initialWatchedActive || initialWatchedUrls.length === 0) return;

    const cancelRef = { current: false };

    async function resumeEnrichmentAndRecommend() {
      try {
        const resp = await fetch('/api/enrich-batch');
        const data = await resp.json();
        if (cancelRef.current || !resp.ok) return;

        setEnrichmentTotal(data.total);
        setEnrichmentProcessed(data.processed);

        if (data.total > 0 && !data.done && data.processed < data.total) {
          await pollEnrichment(cancelRef);
        } else if (!hasInitialScores) {
          await fetchRecommendations();
        }
      } catch (err) {
        console.error('Auto-resume error:', err);
      }
    }

    resumeEnrichmentAndRecommend();
    return () => { cancelRef.current = true; };
  }, [initialUserId, initialWatchedActive, initialWatchedUrls.length, hasInitialScores, fetchRecommendations, pollEnrichment]);

  const clearLetterboxdData = useCallback(async () => {
    setWatchlistUrls(null);
    setWatchlistActive(false);
    setWatchedUrls(null);
    setWatchedActive(false);
    setMatchScores({});
    setBreakdowns({});
    setSortByMatch(false);
    setEnrichmentTotal(0);
    setEnrichmentProcessed(0);
    setEnrichmentPolling(false);
    setRecommendReady(false);
    if (initialUserId) {
      const supabase = getBrowserSupabase();
      await Promise.all([
        supabase.from('user_watched_films').delete().eq('user_id', initialUserId),
        supabase.from('user_watchlist_films').delete().eq('user_id', initialUserId),
        supabase.from('user_film_scores').delete().eq('user_id', initialUserId),
      ]);
      savePreference({ watchlist_active: false, watched_active: false });
    }
  }, [initialUserId]);

  return {
    watchlistUrls, watchedUrls,
    watchlistActive, setWatchlistActive,
    watchedActive, setWatchedActive,
    matchScores, breakdowns,
    sortByMatch, setSortByMatch,
    enrichmentTotal, enrichmentProcessed, enrichmentPolling,
    recommendReady, scoresLoading,
    showWatched, setShowWatched,
    watchlistInputRef, watchedInputRef, zipInputRef,
    handleCsvUpload, handleZipUpload,
    clearLetterboxdData,
  };
}
