/**
 * TMDB API client — TypeScript port of tmdb.py.
 *
 * Fetches genres, countries, languages, runtime, and title translations
 * from the TMDB v3/v4 API.
 */

// ── Types ───────────────────────────────────────────────────────────────────────

export interface TmdbInfo {
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

// ── Constants ───────────────────────────────────────────────────────────────────

const TMDB_API_BASE = 'https://api.themoviedb.org/3';

// ── Auth helpers ────────────────────────────────────────────────────────────────

function getApiToken(): string {
    const token = process.env.TMDB_API_KEY?.trim() ?? '';
    if (!token) {
        throw new Error(
            'TMDB_API_KEY environment variable is not set. ' +
            'Set it as TMDB_API_KEY=... using either a TMDB v4 Read Access Token ' +
            'or a TMDB v3 API Key.'
        );
    }
    return token;
}

function looksLikeV4Token(token: string): boolean {
    return (token.match(/\./g) ?? []).length === 2;
}

function getHeaders(): Record<string, string> {
    const token = getApiToken();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (looksLikeV4Token(token)) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function getAuthParams(): Record<string, string> {
    const token = getApiToken();
    if (looksLikeV4Token(token)) return {};
    return { api_key: token };
}

// ── URL parser ──────────────────────────────────────────────────────────────────

export function parseTmdbUrl(tmdbUrl: string): { mediaType: string; tmdbId: string } | null {
    if (!tmdbUrl) return null;
    const match = tmdbUrl.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (match) {
        return { mediaType: match[1], tmdbId: match[2] };
    }
    return null;
}

// ── Response parser ─────────────────────────────────────────────────────────────

function parseTmdbResponse(data: Record<string, unknown>, mediaType: string): TmdbInfo {
    // Genres
    const genresRaw = (data.genres as Array<{ name?: string }>) ?? [];
    const genres = genresRaw.filter(g => g.name).map(g => g.name!);

    // Countries
    let countries: string[];
    const prodCountries = (data.production_countries as Array<{ name?: string }>) ?? [];
    countries = prodCountries.filter(c => c.name).map(c => c.name!);
    if (mediaType === 'tv' && countries.length === 0) {
        countries = (data.origin_country as string[]) ?? [];
    }

    // Runtime
    let runtimeMinutes: number | null = null;
    if (mediaType === 'movie') {
        const rt = data.runtime;
        if (typeof rt === 'number' && rt > 0) runtimeMinutes = rt;
    } else {
        const numEpisodes = data.number_of_episodes as number | undefined;
        const episodeRuntimes = (data.episode_run_time as number[]) ?? [];
        const validRuntimes = episodeRuntimes.filter(r => typeof r === 'number' && r > 0);

        if (typeof numEpisodes === 'number' && numEpisodes > 0 && validRuntimes.length > 0) {
            const avg = validRuntimes.reduce((a, b) => a + b, 0) / validRuntimes.length;
            runtimeMinutes = Math.round(numEpisodes * avg);
        } else if (validRuntimes.length > 0) {
            runtimeMinutes = validRuntimes[0];
        }
    }

    // Languages
    const origLangCode = (data.original_language as string) ?? '';
    const spokenRaw = (data.spoken_languages as Array<{
        iso_639_1?: string;
        english_name?: string;
        name?: string;
    }>) ?? [];

    const primaryLanguage: string[] = [];
    const spokenLanguages: string[] = [];

    for (const lang of spokenRaw) {
        const langName = lang.english_name || lang.name || '';
        if (langName) spokenLanguages.push(langName);
        if (lang.iso_639_1 === origLangCode && langName && primaryLanguage.length === 0) {
            primaryLanguage.push(langName);
        }
    }
    if (primaryLanguage.length === 0 && origLangCode) {
        primaryLanguage.push(origLangCode);
    }

    // Year
    let year: number | null = null;
    const releaseDate = mediaType === 'movie'
        ? (data.release_date as string)
        : (data.first_air_date as string);
    if (releaseDate) {
        const y = parseInt(releaseDate.substring(0, 4), 10);
        if (!isNaN(y) && y > 0) year = y;
    }

    // Director (from credits.crew)
    let director: string | null = null;
    const creditsObj = data.credits as { crew?: Array<{ job?: string; name?: string }> } | undefined;
    const crew = creditsObj?.crew ?? [];
    const directorEntry = crew.find(c => c.job === 'Director');
    if (directorEntry?.name) {
        director = directorEntry.name;
    }

    // Titles
    const titleOriginal = mediaType === 'movie'
        ? (data.original_title as string) || null
        : (data.original_name as string) || null;

    let titleEn: string | null = null;
    let titleEs: string | null = null;

    const translationsObj = data.translations as {
        translations?: Array<{
            iso_639_1?: string;
            iso_3166_1?: string;
            data?: { title?: string; name?: string };
        }>
    } | undefined;

    const translations = translationsObj?.translations ?? [];

    for (const t of translations) {
        const isoLang = t.iso_639_1 ?? '';
        const isoCountry = t.iso_3166_1 ?? '';
        const titleVal = t.data?.title || t.data?.name || '';

        if (isoLang === 'en' && titleVal && !titleEn) {
            titleEn = titleVal;
        } else if (isoLang === 'es' && titleVal) {
            if (isoCountry === 'ES') {
                titleEs = titleVal; // Prefer ES-ES
            } else if (!titleEs) {
                titleEs = titleVal;
            }
        }
    }

    // Fallback for English title
    if (!titleEn) {
        if (origLangCode === 'en') {
            titleEn = titleOriginal;
        } else {
            const mainTitle = (data.title as string) || (data.name as string) || '';
            if (mainTitle && mainTitle !== titleOriginal) {
                titleEn = mainTitle;
            }
        }
    }

    return {
        genres,
        country: countries,
        primary_language: primaryLanguage,
        spoken_languages: spokenLanguages,
        runtime_minutes: runtimeMinutes,
        year,
        director,
        title_original: titleOriginal,
        title_en: titleEn,
        title_es: titleEs,
    };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch metadata from TMDB for a given TMDB URL.
 * Makes a single API call (details + translations via append_to_response).
 */
export async function fetchTmdbInfo(tmdbUrl: string): Promise<TmdbInfo | null> {
    const parsed = parseTmdbUrl(tmdbUrl);
    if (!parsed) return null;

    const { mediaType, tmdbId } = parsed;

    // Try the given media type first, then fall back to the other.
    // Letterboxd sometimes links to /movie/ when the TMDB entry is /tv/ (e.g. anime).
    const typesToTry = [mediaType, mediaType === 'movie' ? 'tv' : 'movie'];

    for (const type of typesToTry) {
        const result = await fetchTmdbByTypeAndId(type, tmdbId);
        if (result) return result;
    }

    return null;
}

async function fetchTmdbByTypeAndId(mediaType: string, tmdbId: string): Promise<TmdbInfo | null> {
    const authParams = getAuthParams();
    const params = new URLSearchParams({
        append_to_response: 'translations,credits',
        ...authParams,
    });

    const url = `${TMDB_API_BASE}/${mediaType}/${tmdbId}?${params}`;

    try {
        const resp = await fetch(url, {
            headers: getHeaders(),
            signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
            if (resp.status === 401) {
                console.error('TMDB API unauthorized (401). Check TMDB_API_KEY.');
            }
            if (resp.status === 404) {
                // Not found for this media type — caller may try the other type
                return null;
            }
            console.error(`TMDB API error ${resp.status} for ${mediaType}/${tmdbId}`);
            return null;
        }

        const data = await resp.json();
        return parseTmdbResponse(data, mediaType);
    } catch (error) {
        console.error(`TMDB API error for ${mediaType}/${tmdbId}:`, error);
        return null;
    }
}
