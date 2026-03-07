/**
 * Supabase Edge Function: process-enrichment
 *
 * Processes batches from the film_enrichment_queue table.
 * - Takes a batch via the concurrent-safe take_enrichment_batch() RPC
 * - Resolves Letterboxd short URLs → scrapes metadata → fetches TMDB info
 * - Upserts enriched films into the films table
 * - Retries failed items (up to 5 attempts), then marks as permanently failed
 * - Self-invokes if more items remain in the queue
 *
 * Triggered by: database INSERT trigger, pg_cron (every 3 min), or direct HTTP call.
 *
 * Required env vars (auto-set by Supabase):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (falls back to SUPABASE_SERVICE_ROLE_KEY)
 * Required secrets (set via `supabase secrets set`):
 *   TMDB_API_KEY
 */

/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

// ── Configuration ────────────────────────────────────────────────────────────

const BATCH_SIZE = 15;
const TMDB_DELAY_MS = 300;
const MAX_RETRIES = 5;
const MAX_CHAIN_DEPTH = 50;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// ── TMDB helpers ─────────────────────────────────────────────────────────────

interface TmdbInfo {
  genres: string[];
  country: string[];
  primary_language: string[];
  spoken_languages: string[];
  runtime_minutes: number | null;
  year: number | null;
  director: string | null;
  title_original: string | null;
  title_en: string | null;
  title_es: string | null;
}

function getTmdbAuth(): { headers: Record<string, string>; params: Record<string, string> } {
  const token = (Deno.env.get("TMDB_API_KEY") ?? "").trim();
  if (!token) throw new Error("TMDB_API_KEY not set");

  const isV4 = (token.match(/\./g) ?? []).length === 2;
  const headers: Record<string, string> = { accept: "application/json" };
  const params: Record<string, string> = {};

  if (isV4) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    params["api_key"] = token;
  }
  return { headers, params };
}

function parseTmdbUrl(tmdbUrl: string): { mediaType: string; tmdbId: string } | null {
  const match = tmdbUrl.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  return match ? { mediaType: match[1], tmdbId: match[2] } : null;
}

// deno-lint-ignore no-explicit-any
function parseTmdbResponse(data: any, mediaType: string): TmdbInfo {
  const genres = (data.genres ?? []).filter((g: any) => g.name).map((g: any) => g.name);

  let countries = (data.production_countries ?? []).filter((c: any) => c.name).map((c: any) => c.name);
  if (mediaType === "tv" && countries.length === 0) {
    countries = data.origin_country ?? [];
  }

  let runtimeMinutes: number | null = null;
  if (mediaType === "movie") {
    if (typeof data.runtime === "number" && data.runtime > 0) runtimeMinutes = data.runtime;
  } else {
    const episodeRuntimes = (data.episode_run_time ?? []).filter((r: number) => r > 0);
    const numEpisodes = data.number_of_episodes;
    if (typeof numEpisodes === "number" && numEpisodes > 0 && episodeRuntimes.length > 0) {
      const avg = episodeRuntimes.reduce((a: number, b: number) => a + b, 0) / episodeRuntimes.length;
      runtimeMinutes = Math.round(numEpisodes * avg);
    } else if (episodeRuntimes.length > 0) {
      runtimeMinutes = episodeRuntimes[0];
    }
  }

  const origLangCode = data.original_language ?? "";
  const spokenRaw = data.spoken_languages ?? [];
  const primaryLanguage: string[] = [];
  const spokenLanguages: string[] = [];

  for (const lang of spokenRaw) {
    const langName = lang.english_name || lang.name || "";
    if (langName) spokenLanguages.push(langName);
    if (lang.iso_639_1 === origLangCode && langName && primaryLanguage.length === 0) {
      primaryLanguage.push(langName);
    }
  }
  if (primaryLanguage.length === 0 && origLangCode) primaryLanguage.push(origLangCode);

  let year: number | null = null;
  const releaseDate = mediaType === "movie" ? data.release_date : data.first_air_date;
  if (releaseDate) {
    const y = parseInt(releaseDate.substring(0, 4), 10);
    if (!isNaN(y) && y > 0) year = y;
  }

  let director: string | null = null;
  const crew = data.credits?.crew ?? [];
  const directorEntry = crew.find((c: any) => c.job === "Director");
  if (directorEntry?.name) director = directorEntry.name;

  const titleOriginal = mediaType === "movie"
    ? data.original_title || null
    : data.original_name || null;

  let titleEn: string | null = null;
  let titleEs: string | null = null;

  for (const t of data.translations?.translations ?? []) {
    const isoLang = t.iso_639_1 ?? "";
    const isoCountry = t.iso_3166_1 ?? "";
    const titleVal = t.data?.title || t.data?.name || "";

    if (isoLang === "en" && titleVal && !titleEn) {
      titleEn = titleVal;
    } else if (isoLang === "es" && titleVal) {
      if (isoCountry === "ES") titleEs = titleVal;
      else if (!titleEs) titleEs = titleVal;
    }
  }

  if (!titleEn) {
    if (origLangCode === "en") {
      titleEn = titleOriginal;
    } else {
      const mainTitle = data.title || data.name || "";
      if (mainTitle && mainTitle !== titleOriginal) titleEn = mainTitle;
    }
  }

  return {
    genres, country: countries, primary_language: primaryLanguage,
    spoken_languages: spokenLanguages, runtime_minutes: runtimeMinutes,
    year, director, title_original: titleOriginal, title_en: titleEn, title_es: titleEs,
  };
}

async function fetchTmdbByTypeAndId(
  mediaType: string, tmdbId: string, auth: ReturnType<typeof getTmdbAuth>,
): Promise<TmdbInfo | null> {
  const params = new URLSearchParams({ append_to_response: "translations,credits", ...auth.params });
  const url = `${TMDB_API_BASE}/${mediaType}/${tmdbId}?${params}`;

  try {
    const resp = await fetch(url, { headers: auth.headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      if (resp.status === 404) return null;
      console.error(`TMDB ${resp.status} for ${mediaType}/${tmdbId}`);
      return null;
    }
    return parseTmdbResponse(await resp.json(), mediaType);
  } catch (err) {
    console.error(`TMDB error for ${mediaType}/${tmdbId}:`, err);
    return null;
  }
}

async function fetchTmdbInfo(tmdbUrl: string): Promise<TmdbInfo | null> {
  const parsed = parseTmdbUrl(tmdbUrl);
  if (!parsed) return null;

  const auth = getTmdbAuth();
  const { mediaType, tmdbId } = parsed;
  const typesToTry = [mediaType, mediaType === "movie" ? "tv" : "movie"];

  for (const type of typesToTry) {
    const result = await fetchTmdbByTypeAndId(type, tmdbId, auth);
    if (result) return result;
  }
  return null;
}

// ── Letterboxd helpers ───────────────────────────────────────────────────────

async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(shortUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok && resp.url.includes("letterboxd.com")) return resp.url;
    return null;
  } catch {
    return null;
  }
}

interface LetterboxdInfo {
  letterboxd_rating: number | null;
  tmdb_url: string | null;
}

async function fetchLetterboxdInfo(url: string): Promise<LetterboxdInfo> {
  const result: LetterboxdInfo = { letterboxd_rating: null, tmdb_url: null };
  const normalizedUrl = url.endsWith("/") ? url : url + "/";

  try {
    const resp = await fetch(normalizedUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`Letterboxd HTTP ${resp.status} for ${normalizedUrl}`);
      return result;
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    const metaContent = $('meta[name="twitter:data2"]').attr("content") ?? "";
    const ratingMatch = metaContent.match(/([\d.]+)\s+out of/);
    if (ratingMatch) result.letterboxd_rating = parseFloat(ratingMatch[1]);

    const tmdbLink = $('a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"]');
    if (tmdbLink.length) {
      const href = tmdbLink.first().attr("href");
      if (href) result.tmdb_url = href.endsWith("/") ? href : href + "/";
    }

    if (!result.tmdb_url) {
      const body = $("body");
      const tmdbId = body.attr("data-tmdb-id");
      const tmdbType = body.attr("data-tmdb-type") || "movie";
      if (tmdbId) result.tmdb_url = `https://www.themoviedb.org/${tmdbType}/${tmdbId}/`;
    }
  } catch (err) {
    console.error(`Letterboxd fetch error for ${normalizedUrl}:`, err);
  }

  return result;
}

// ── Main handler ─────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = (
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  )!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Parse chain depth from body (prevents infinite self-invocation)
  let chainDepth = 0;
  try {
    const body = await req.json();
    chainDepth = body.chain_depth ?? 0;
  } catch { /* no body is fine */ }

  // Take a batch from the queue (concurrent-safe via FOR UPDATE SKIP LOCKED)
  const { data: batch, error: rpcError } = await supabase
    .rpc("take_enrichment_batch", { batch_size: BATCH_SIZE });

  if (rpcError) {
    console.error("take_enrichment_batch error:", rpcError);
    return new Response(JSON.stringify({ error: rpcError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!batch || batch.length === 0) {
    return new Response(JSON.stringify({ processed: 0, remaining: 0, done: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processedCount = 0;

  for (const item of batch) {
    const shortUrl = item.letterboxd_short_url;

    try {
      // 1. Resolve short URL → full Letterboxd URL
      const fullUrl = await resolveShortUrl(shortUrl);
      if (!fullUrl) throw new Error(`Could not resolve short URL: ${shortUrl}`);

      // 2. Scrape Letterboxd page
      const lbInfo = await fetchLetterboxdInfo(fullUrl);

      // 3. Fetch TMDB metadata
      let tmdbInfo: TmdbInfo | null = null;
      if (lbInfo.tmdb_url) {
        tmdbInfo = await fetchTmdbInfo(lbInfo.tmdb_url);
        await delay(TMDB_DELAY_MS);
      }

      // 4. Build film data
      const slugMatch = fullUrl.match(/\/film\/([^/]+)/);
      const slug = slugMatch?.[1] ?? "";
      const fallbackTitle = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const filmData: Record<string, unknown> = {
        title: tmdbInfo?.title_es || tmdbInfo?.title_en || tmdbInfo?.title_original || fallbackTitle,
        letterboxd_url: fullUrl,
        letterboxd_short_url: shortUrl,
        letterboxd_rating: lbInfo.letterboxd_rating,
        tmdb_url: lbInfo.tmdb_url,
      };

      if (tmdbInfo) {
        filmData.genres = tmdbInfo.genres;
        filmData.country = tmdbInfo.country;
        filmData.primary_language = tmdbInfo.primary_language;
        filmData.spoken_languages = tmdbInfo.spoken_languages;
        filmData.runtime_minutes = tmdbInfo.runtime_minutes;
        filmData.year = tmdbInfo.year;
        filmData.director = tmdbInfo.director;
        filmData.title_original = tmdbInfo.title_original;
        filmData.title_en = tmdbInfo.title_en;
        filmData.title_es = tmdbInfo.title_es;
      }

      // 5. Upsert into films table
      const { error: upsertError } = await supabase
        .from("films")
        .upsert(filmData, { onConflict: "letterboxd_short_url" });

      if (upsertError) throw new Error(`Upsert failed for ${shortUrl}: ${upsertError.message}`);

      // 6. Mark as done
      await supabase
        .from("film_enrichment_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", item.id);

      processedCount++;
      console.log(`Enriched: ${shortUrl} → ${filmData.title}`);
    } catch (err) {
      const newRetryCount = (item.retry_count ?? 0) + 1;
      const exhausted = newRetryCount >= MAX_RETRIES;

      console.error(`Failed (attempt ${newRetryCount}/${MAX_RETRIES}) ${shortUrl}:`, err);

      await supabase
        .from("film_enrichment_queue")
        .update({
          status: exhausted ? "failed" : "pending",
          retry_count: newRetryCount,
          locked_at: null,
          processed_at: exhausted ? new Date().toISOString() : null,
        })
        .eq("id", item.id);
    }
  }

  // Count remaining work
  const { count: remaining } = await supabase
    .from("film_enrichment_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const done = (remaining ?? 0) === 0;

  // Self-invoke if more work to do (with depth limit)
  if (!done && chainDepth < MAX_CHAIN_DEPTH) {
    const selfUrl = `${supabaseUrl}/functions/v1/process-enrichment`;
    fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ chain_depth: chainDepth + 1 }),
    }).catch((err) => console.error("Self-invoke failed:", err));
  }

  console.log(`Batch done: ${processedCount} processed, ${remaining ?? 0} remaining`);

  return new Response(
    JSON.stringify({ processed: processedCount, remaining: remaining ?? 0, done }),
    { headers: { "Content-Type": "application/json" } },
  );
});
