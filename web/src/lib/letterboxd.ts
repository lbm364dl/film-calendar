/**
 * Letterboxd HTTP scraper & ZIP export parser.
 *
 * Port of rate.py Phase 1 (requests-only, no Selenium) to TypeScript.
 * Uses cheerio for HTML parsing and jszip for ZIP extraction.
 */

import * as cheerio from 'cheerio';
import JSZip from 'jszip';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface LetterboxdInfo {
    letterboxd_url: string;
    letterboxd_rating: number | null;
    letterboxd_short_url: string | null;
    tmdb_url: string | null;
}

export interface ParsedExport {
    /** Short URLs from watched.csv (boxd.it links) */
    watchedUrls: string[];
    /** Full Letterboxd URLs from watched.csv */
    watchedFullUrls: string[];
    /** Map of short URL → user rating (from ratings.csv). Not all films have ratings. */
    ratings: Record<string, number>;
    /** Map of full URL → short URL for cross-referencing */
    fullToShort: Record<string, string>;
}

interface WatchedRow {
    'Letterboxd URI': string;
    Name?: string;
    Year?: string;
    Date?: string;
}

interface RatingRow {
    'Letterboxd URI': string;
    Rating?: string;
    Name?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── CSV parser (minimal, avoids heavy deps) ─────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0].trim();
    const headers = parseCSVLine(headerLine);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j] ?? '';
        }
        rows.push(row);
    }
    return rows;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

// ── ZIP Export Parser ────────────────────────────────────────────────────────

/**
 * Parse a Letterboxd export ZIP containing watched.csv and optionally ratings.csv.
 */
export async function parseExportZip(buffer: ArrayBuffer): Promise<ParsedExport> {
    const zip = await JSZip.loadAsync(buffer);

    // Find watched.csv and ratings.csv (may be at root or in a subfolder)
    let watchedFile: JSZip.JSZipObject | null = null;
    let ratingsFile: JSZip.JSZipObject | null = null;

    zip.forEach((path, file) => {
        const basename = path.split('/').pop()?.toLowerCase();
        if (basename === 'watched.csv') watchedFile = file;
        if (basename === 'ratings.csv') ratingsFile = file;
    });

    if (!watchedFile) {
        throw new Error('No watched.csv found in the ZIP file');
    }

    // Parse watched.csv
    const watchedText = await (watchedFile as JSZip.JSZipObject).async('string');
    const watchedRows = parseCSV(watchedText) as unknown as WatchedRow[];

    const watchedUrls: string[] = [];
    const watchedFullUrls: string[] = [];
    const fullToShort: Record<string, string> = {};

    for (const row of watchedRows) {
        const uri = row['Letterboxd URI']?.trim();
        if (uri) {
            watchedUrls.push(uri);
            // The URI column in watched.csv is the boxd.it short URL
            // We'll need to look up the full URL later, but save these for now
        }
    }

    // Parse ratings.csv (optional — not all users rate films)
    const ratings: Record<string, number> = {};
    if (ratingsFile) {
        const ratingsText = await (ratingsFile as JSZip.JSZipObject).async('string');
        const ratingRows = parseCSV(ratingsText) as unknown as RatingRow[];

        for (const row of ratingRows) {
            const uri = row['Letterboxd URI']?.trim();
            const ratingStr = row['Rating']?.trim();
            if (uri && ratingStr) {
                const rating = parseFloat(ratingStr);
                if (!isNaN(rating) && rating > 0) {
                    ratings[uri] = rating;
                }
            }
        }
    }

    return { watchedUrls, watchedFullUrls, ratings, fullToShort };
}

// ── Letterboxd HTTP Scraper (Phase 1 only) ──────────────────────────────────

/**
 * Fetch Letterboxd info from a film page using only HTTP (no Selenium).
 *
 * Extracts: rating, short_url, tmdb_url.
 * Does NOT get viewer_count (requires Selenium/JS rendering).
 */
export async function fetchLetterboxdInfo(url: string): Promise<LetterboxdInfo> {
    const result: LetterboxdInfo = {
        letterboxd_url: url,
        letterboxd_rating: null,
        letterboxd_short_url: null,
        tmdb_url: null,
    };

    if (!url) return result;

    // Normalize URL
    const normalizedUrl = url.endsWith('/') ? url : url + '/';

    try {
        const resp = await fetch(normalizedUrl, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
            console.error(`Letterboxd HTTP ${resp.status} for ${normalizedUrl}`);
            return result;
        }

        const html = await resp.text();
        const $ = cheerio.load(html);

        // Rating from twitter:data2 meta ("4.53 out of 5")
        const metaContent = $('meta[name="twitter:data2"]').attr('content') ?? '';
        const ratingMatch = metaContent.match(/([\d.]+)\s+out of/);
        if (ratingMatch) {
            result.letterboxd_rating = parseFloat(ratingMatch[1]);
        }

        // Short URL from the share input field
        const shortUrlInput = $('input[id^="url-field-film-"]');
        if (shortUrlInput.length) {
            result.letterboxd_short_url = shortUrlInput.attr('value') ?? null;
        }

        // TMDB URL — prefer the actual <a> link to themoviedb.org on the page
        // (the body data-tmdb-id attribute can be wrong for TV series)
        const tmdbLink = $('a[href*="themoviedb.org/movie/"], a[href*="themoviedb.org/tv/"]');
        if (tmdbLink.length) {
            const href = tmdbLink.first().attr('href');
            if (href) {
                result.tmdb_url = href.endsWith('/') ? href : href + '/';
            }
        }

        // Fallback: body data attributes (less reliable for TV shows)
        if (!result.tmdb_url) {
            const body = $('body');
            const tmdbId = body.attr('data-tmdb-id');
            const tmdbType = body.attr('data-tmdb-type') || 'movie';
            if (tmdbId) {
                result.tmdb_url = `https://www.themoviedb.org/${tmdbType}/${tmdbId}/`;
            }
        }
    } catch (error) {
        console.error(`Letterboxd fetch error for ${normalizedUrl}:`, error);
    }

    return result;
}

/**
 * Resolve a Letterboxd short URL (boxd.it) to the full film page URL.
 * Follows the redirect.
 */
export async function resolveShortUrl(shortUrl: string): Promise<string | null> {
    try {
        const resp = await fetch(shortUrl, {
            headers: { 'User-Agent': USER_AGENT },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
        });
        // After following redirects, resp.url is the final URL
        if (resp.ok && resp.url.includes('letterboxd.com')) {
            return resp.url;
        }
        return null;
    } catch {
        return null;
    }
}
