// ── i18n ────────────────────────────────────────────────────────────────────────
let currentLang = localStorage.getItem('lang') || 'es';

const TRANSLATIONS = {
    es: {
        siteTitle: '🎬 Madrid Film Calendar',
        subtitle: 'Cineteca • Doré • Embajadores • Golem • Renoir • Sala Berlanga • Cine Estudio • Más próximamente...',
        searchPlaceholder: 'Buscar por título o director',
        selectDate: 'Elegir día',
        allTheaters: 'Todos los cines',
        yearFrom: 'Año desde',
        yearTo: 'Año hasta',
        watchlistFull: 'Watchlist Letterboxd',
        watchlistShort: 'Watchlist',
        watchlistActive: 'Watchlist activa',
        clearFilters: 'Limpiar filtros',
        watchlistTooltipTitle: '<strong>Filtrar por tu watchlist de Letterboxd</strong>',
        watchlistStep1: 'Inicia sesión en Letterboxd desde el navegador (no en la app)',
        watchlistStep2: 'Ve a tu watchlist de Letterboxd',
        watchlistStep3: 'Haz clic en <em>Export watchlist</em>',
        watchlistStep4: 'Sube el archivo <em>CSV</em> descargado aquí',
        filmCount: (n) => `${n} película${n !== 1 ? 's' : ''}`,
        calendarHint: 'Haz clic en cualquier sesión para entradas y opciones de calendario',
        loading: 'Cargando películas...',
        errorLoading: 'Error al cargar películas. Inténtalo de nuevo más tarde.',
        noResults: 'No se encontraron películas con los criterios seleccionados.',
        buyTickets: 'Comprar entradas',
        viewFilmPage: 'Ver ficha',
        addToCalendar: 'Añadir al calendario',
        nLocations: (n) => `${n} salas`,
        nTheaters: (n) => `${n} cines`,
        watchlistCount: (n) => `${n} películas cargadas de la watchlist`,
        footerCreated: 'Creado con ayuda de IA • Patrocinado por mi amor por el cine',
        footerThanks: 'Gracias a los cines de Madrid, a <a href="https://letterboxd.com" target="_blank" rel="noopener noreferrer" class="attribution-link">Letterboxd</a> y a <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" class="attribution-link">TMDB</a>.',
        footerMistakes: 'Si encuentras algún error, <a href="mailto:ctl.covaci@gmail.com">escríbeme</a>, <a href="https://github.com/lbm364dl/film-calendar/issues">abre una issue en GitHub</a> o <a href="https://github.com/lbm364dl/film-calendar/blob/main/docs/screenings.json" target="_blank">corrígelo tú mismo</a> con una Pull Request.',
        viewOnGithub: 'Ver en GitHub',
        dubbedTooltip: 'Doblada al castellano',
        loadMore: (n) => `Mostrar más (${n} restantes)`,
    },
    en: {
        siteTitle: '🎬 Madrid Film Calendar',
        subtitle: 'Cineteca • Doré • Embajadores • Golem • Renoir • Sala Berlanga • Cine Estudio • More coming...',
        searchPlaceholder: 'Search by title or director',
        selectDate: 'Select date',
        allTheaters: 'All Theaters',
        yearFrom: 'Year from',
        yearTo: 'Year to',
        watchlistFull: 'Letterboxd watchlist',
        watchlistShort: 'Watchlist',
        watchlistActive: 'Watchlist active',
        clearFilters: 'Clear all filters',
        watchlistTooltipTitle: '<strong>Filter by your Letterboxd watchlist</strong>',
        watchlistStep1: 'Log in to Letterboxd via browser (not working on app)',
        watchlistStep2: 'Go to your Letterboxd watchlist',
        watchlistStep3: 'Click <em>Export watchlist</em>',
        watchlistStep4: 'Upload the downloaded <em>CSV</em> file here',
        filmCount: (n) => `${n} film${n !== 1 ? 's' : ''}`,
        calendarHint: 'Click any session for tickets & calendar options',
        loading: 'Loading films...',
        errorLoading: 'Error loading films. Please try again later.',
        noResults: 'No films found matching your criteria.',
        buyTickets: 'Buy Tickets',
        viewFilmPage: 'View Film Page',
        addToCalendar: 'Add to Calendar',
        nLocations: (n) => `${n} locations`,
        nTheaters: (n) => `${n} theaters`,
        watchlistCount: (n) => `${n} films loaded from watchlist`,
        footerCreated: 'Created with the help of AI • Sponsored by my love for films',
        footerThanks: 'Thanks to Madrid theaters, <a href="https://letterboxd.com" target="_blank" rel="noopener noreferrer" class="attribution-link">Letterboxd</a>, and <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" class="attribution-link">TMDB</a>.',
        footerMistakes: 'If you find any mistakes, <a href="mailto:ctl.covaci@gmail.com">write to me</a>, <a href="https://github.com/lbm364dl/film-calendar/issues">open a GitHub issue</a> or <a href="https://github.com/lbm364dl/film-calendar/blob/main/docs/screenings.json" target="_blank">fix it yourself</a> via Pull Request.',
        viewOnGithub: 'View on GitHub',
        dubbedTooltip: 'Dubbed in Spanish',
        loadMore: (n) => `Load more (${n} remaining)`,
    }
};

function t(key, ...args) {
    const val = TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    return typeof val === 'function' ? val(...args) : val;
}

function getDateLocale() {
    return currentLang === 'es' ? 'es-ES' : 'en-GB';
}

function getFilmTitle(film) {
    if (currentLang === 'en' && film.titleEn) {
        return film.titleEn;
    }
    return film.title;
}

const GENRE_TRANSLATIONS_ES = {
    'action': 'Acción',
    'adventure': 'Aventura',
    'animation': 'Animación',
    'biography': 'Biografía',
    'comedy': 'Comedia',
    'crime': 'Crimen',
    'documentary': 'Documental',
    'drama': 'Drama',
    'family': 'Familiar',
    'fantasy': 'Fantasía',
    'film-noir': 'Cine negro',
    'history': 'Historia',
    'horror': 'Terror',
    'music': 'Música',
    'musical': 'Musical',
    'mystery': 'Misterio',
    'romance': 'Romance',
    'science fiction': 'Ciencia ficción',
    'short': 'Cortometraje',
    'sport': 'Deporte',
    'thriller': 'Thriller',
    'tv movie': 'Película para TV',
    'war': 'Bélico',
    'western': 'Wéstern',
};

function translateGenre(genre) {
    if (!genre || currentLang !== 'es') {
        return genre;
    }

    const normalized = genre.trim().toLowerCase();
    return GENRE_TRANSLATIONS_ES[normalized] || genre;
}

function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.documentElement.lang = currentLang;
    document.title = 'Madrid Film Calendar';
    const currentDateFilter = document.getElementById('date-filter');
    if (currentDateFilter) {
        currentDateFilter.lang = currentLang === 'es' ? 'es-ES' : 'en-GB';
        updateDatePlaceholder();
    }
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyStaticTranslations();
    if (allFilms.length > 0) {
        renderFilms();
    }
}

// ── App state ───────────────────────────────────────────────────────────────────
let allFilms = [];
let filteredFilms = [];
let sortedFilms = [];
let displayedCount = 0;
let watchlistUrls = null;

// ── Pagination ──────────────────────────────────────────────────────────────────
const ROWS_PER_PAGE = 10;

function getColumnsPerRow() {
    const grid = document.getElementById('films-grid');
    const style = getComputedStyle(grid);
    const cols = style.gridTemplateColumns.split(' ').length;
    return cols || 1;
}

function getPageSize() {
    return getColumnsPerRow() * ROWS_PER_PAGE;
}

function updateLoadMoreButton() {
    const container = document.getElementById('load-more-container');
    const btn = document.getElementById('load-more-btn');
    const remaining = sortedFilms.length - displayedCount;
    if (remaining > 0) {
        container.style.display = '';
        btn.textContent = t('loadMore', remaining);
    } else {
        container.style.display = 'none';
    }
}

function showMore() {
    const filmsGrid = document.getElementById('films-grid');
    const pageSize = getPageSize();
    const nextBatch = sortedFilms.slice(displayedCount, displayedCount + pageSize);
    filmsGrid.insertAdjacentHTML('beforeend', nextBatch.map(film => createFilmCard(film)).join(''));
    displayedCount += nextBatch.length;
    updateLoadMoreButton();
}

// Data file to load
const DATA_FILE = 'screenings.json';

// Load films from JSON
async function loadFilms() {
    const loading = document.getElementById('loading');
    const filmsGrid = document.getElementById('films-grid');

    try {
        const response = await fetch(DATA_FILE);
        const filmData = await response.json();

        // Process film data
        allFilms = filmData.map(film => {
            const dates = Array.isArray(film.dates) ? film.dates : parseDates(film.dates);

            // Derive theater from dates (unique locations)
            const locations = [...new Set(dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
            let theaterDisplay = locations.length > 0 ? locations.join(', ') : 'Unknown';
            if (locations.length > 2) theaterDisplay = t('nLocations', locations.length);

            // Derive main link from first date with info url, or fallback
            const mainLink = dates.find(d => d.url_info)?.url_info || '';

            return {
                theater: theaterDisplay,
                title: film.title,
                director: film.director,
                year: film.year ? parseInt(film.year) : null,
                dates: dates,
                theaterLink: mainLink,
                letterboxdUrl: film.letterboxd_url,
                letterboxdShortUrl: film.letterboxd_short_url,
                runtimeMinutes: film.runtime_minutes || null,
                titleEn: film.title_en || '',
                titleOriginal: film.title_original || '',
                rating: film.letterboxd_rating ? parseFloat(film.letterboxd_rating) : null,
                viewers: film.letterboxd_viewers,
                genres: film.genres || [],
                country: film.country || [],
                primaryLanguage: film.primary_language || [],
                spokenLanguages: film.spoken_languages || [],
                tmdbUrl: film.tmdb_url,
            };
        }).filter(film => film.title);

        // Initial render
        initYearFilter(); // Initialize slider with data bounds
        applyFiltersFromURL(); // Then apply any URL params
        filterFilms();

        loading.style.display = 'none';
        filmsGrid.style.display = 'grid';

    } catch (error) {
        console.error('Error loading films:', error);
        loading.textContent = t('errorLoading');
    }
}

// Parse dates which can be:
// 1. Old format: "['2025-02-01 10:00']" (Python list string)
// 2. New format: "[{'timestamp': '2025-02-01 10:00', 'location': 'Princesa', ...}]" (Python list of dicts string)
function parseDates(dateStr) {
    if (!dateStr) return [];

    try {
        // Attempt to parse as JSON first (if strictly valid JSON)
        try {
            const parsed = JSON.parse(dateStr);
            return normalizeParsedDates(parsed);
        } catch (e) {
            // Not valid JSON (likely Python string with single quotes)
            // Replace single quotes with double quotes
            let jsonString = dateStr.replace(/'/g, '"');

            // Handle specific Pythonisms if needed
            const parsed = JSON.parse(jsonString);
            return normalizeParsedDates(parsed);
        }
    } catch (e) {
        console.warn("Failed to parse dates:", dateStr, e);
        // Fallback: simple timestamp extraction
        const matches = dateStr.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g);
        if (matches) {
            return matches.map(ts => ({ timestamp: ts, location: 'Unknown', url_tickets: '', url_info: '' }));
        }
        return [];
    }
}

function normalizeParsedDates(parsed) {
    if (!Array.isArray(parsed)) return [];

    return parsed.map(item => {
        if (typeof item === 'string') {
            // Old format: plain string timestamp
            return { timestamp: item, location: 'Unknown', url_tickets: '', url_info: '', version: null };
        } else if (typeof item === 'object' && item !== null) {
            // New format: object with timestamp/location/urls/version
            return {
                timestamp: item.timestamp,
                location: item.location || 'Unknown',
                // Map new keys to internal structure if needed, or keep them
                url_tickets: item.url_tickets || item.url || '', // Support both old 'url' and new 'url_tickets'
                url_info: item.url_info || '',
                version: item.version || null,
            };
        }
        return null;
    }).filter(x => x);
}



function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString(getDateLocale(), { year: 'numeric', month: 'long' });
}

function getLocalTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateInputValue(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDateOnly(timestamp) {
    if (!timestamp) return null;
    const [datePart, timePart = '00:00'] = timestamp.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hour || 0, minute || 0);
}

// Remove accents for search
function normalizeText(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Renoir cinema locations
const RENOIR_LOCATIONS = ['Princesa', 'Retiro', 'Plaza de España'];

function isRenoirLocation(location) {
    return location && RENOIR_LOCATIONS.includes(location);
}

// Embajadores cinema locations
const EMBAJADORES_LOCATIONS = ['Embajadores Glorieta', 'Embajadores Ercilla'];

function isEmbajadoresLocation(location) {
    return location && EMBAJADORES_LOCATIONS.includes(location);
}

function filterFilms() {
    const searchTerm = normalizeText(document.getElementById('search').value);
    const selectedTheater = document.getElementById('theater-filter').value;
    const selectedDate = document.getElementById('date-filter').value;
    const todayStart = getLocalTodayStart();

    filteredFilms = allFilms.map(film => {
        const futureDates = film.dates.filter(d => {
            const dateObj = getDateOnly(d.timestamp);
            return dateObj && dateObj >= todayStart;
        });

        // Apply theater/date filters at the session level so both constraints match the same session.
        const sessionFilteredDates = futureDates.filter(d => {
            if (selectedTheater) {
                if (selectedTheater === 'Cines Renoir') {
                    if (!isRenoirLocation(d.location)) return false;
                } else if (selectedTheater === 'Cines Embajadores') {
                    if (!isEmbajadoresLocation(d.location)) return false;
                } else if (d.location !== selectedTheater) {
                    return false;
                }
            }

            if (selectedDate && !d.timestamp.startsWith(selectedDate)) {
                return false;
            }

            return true;
        });

        return {
            ...film,
            dates: sessionFilteredDates
        };
    }).filter(film => {
        if (film.dates.length === 0) return false;
        // Search filter (accent-insensitive)
        const matchesSearch = !searchTerm ||
            normalizeText(film.title).includes(searchTerm) ||
            (film.titleEn && normalizeText(film.titleEn).includes(searchTerm)) ||
            (film.director && normalizeText(film.director).includes(searchTerm));

        // Year filter
        let matchesYear = true;
        const minInput = document.getElementById('year-min');
        const maxInput = document.getElementById('year-max');
        if (minInput && maxInput) {
            const currentMin = Math.min(parseInt(minInput.value), parseInt(maxInput.value));
            const currentMax = Math.max(parseInt(minInput.value), parseInt(maxInput.value));

            if (film.year) {
                matchesYear = film.year >= currentMin && film.year <= currentMax;
            } else {
                // Should we show films with no year? 
                // If the range is the full range, yes. If strict subset, maybe?
                // For now, let's include them only if the filter covers the full range (implied default)
                // Or separate toggle? Let's just exclude if outside known range for now to be safe, 
                // or include if "unknown" is acceptable.
                // Decision: Include if range covers standard min/max, otherwise exclude?
                // Simplest: If year is null, it doesn't match a specific range unless we have a specific rule.
                // Let's exclude unknown years when filtering.
                matchesYear = false;
                // BUT if filter is at default (full range), ideally we show everything.
                if (currentMin === minYear && currentMax === maxYear) matchesYear = true;
            }
        }

        // Watchlist filter
        let matchesWatchlist = true;
        if (watchlistUrls) {
            matchesWatchlist = film.letterboxdShortUrl && watchlistUrls.has(film.letterboxdShortUrl);
        }

        return matchesSearch && matchesYear && matchesWatchlist;
    });

    renderFilms();
}

function renderFilms() {
    const filmsGrid = document.getElementById('films-grid');
    const noResults = document.getElementById('no-results');
    const filmCount = document.getElementById('film-count');

    filmCount.textContent = t('filmCount', filteredFilms.length);

    if (filteredFilms.length === 0) {
        filmsGrid.innerHTML = '';
        noResults.style.display = 'block';
        document.getElementById('load-more-container').style.display = 'none';
        return;
    }

    noResults.style.display = 'none';

    // Sort by rating (highest first), then by title
    sortedFilms = [...filteredFilms].sort((a, b) => {
        if (a.rating !== null && b.rating !== null) {
            return b.rating - a.rating;
        }
        if (a.rating !== null) return -1;
        if (b.rating !== null) return 1;
        return a.title.localeCompare(b.title);
    });

    // Reset and show first batch
    filmsGrid.innerHTML = '';
    displayedCount = 0;
    showMore();
}

function formatViewerCount(n) {
    if (n == null) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return Math.round(n / 1_000) + 'k';
    return n.toString();
}

function createFilmCard(film) {
    const ratingHTML = film.rating
        ? `<div class="rating">⭐ ${film.rating.toFixed(1)}</div>`
        : '';

    const viewersFormatted = formatViewerCount(film.viewers);
    const viewersHTML = viewersFormatted
        ? `<div class="viewers" title="${film.viewers?.toLocaleString()} viewers">👁️ ${viewersFormatted}</div>`
        : '';

    // Build compact title: "Title (Director, Year · 105 min)"
    let titleText = escapeHtml(getFilmTitle(film));
    const metadata = [];
    if (film.director) metadata.push(escapeHtml(film.director));
    if (film.year) metadata.push(film.year);
    if (film.runtimeMinutes) metadata.push(`${film.runtimeMinutes} min`);
    if (metadata.length > 0) {
        titleText += ` <span class="title-meta">(${metadata.join(', ')})</span>`;
    }

    // Genres badge
    const genresHTML = film.genres && film.genres.length > 0
        ? `<div class="film-genres">${film.genres.map(g => `<span class="genre-badge">${escapeHtml(translateGenre(g))}</span>`).join('')}</div>`
        : '';

    const datesHTML = film.dates.length > 0
        ? `<div class="film-dates">
             ${createSessionsDisplay(film)}
           </div>`
        : '';

    // Letterboxd icon link (prefer short URL if available)
    const letterboxdLink = film.letterboxdShortUrl || film.letterboxdUrl;
    const letterboxdHTML = letterboxdLink
        ? `<a href="${escapeHtml(letterboxdLink)}" class="letterboxd-link" target="_blank" onclick="event.stopPropagation()" title="View on Letterboxd">
             <img src="assets/letterboxd.svg" class="letterboxd-icon" alt="LB" onerror="this.outerHTML='📽️'">
           </a>`
        : '';

    return `
        <div class="film-card">
            <div class="film-header">
                <div class="film-title-row">
                    <div class="film-title">${titleText}</div>
                </div>
                <div class="card-actions">
                    ${ratingHTML}
                    ${viewersHTML}
                    ${letterboxdHTML}
                </div>
            </div>
            ${genresHTML}
            ${datesHTML}
        </div>
    `;
}

// Threshold for showing collapsible sessions
const SESSIONS_COLLAPSE_THRESHOLD = 2;

function createSessionsDisplay(film) {
    if (film.dates.length <= SESSIONS_COLLAPSE_THRESHOLD) {
        // Show all sessions inline
        return film.dates.map(dateObj => createSessionRow(film, dateObj)).join('');
    }

    // Many sessions - show collapse toggle
    const dateRange = getDateRange(film.dates);
    const locationSummary = getLocationSummary(film.dates);
    const popupId = `popup-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <button class="sessions-toggle" onclick="toggleSessionsPopup(event, '${popupId}')">
            <span class="toggle-icon">▼</span>
            <span>${dateRange}</span>
            ${locationSummary ? `<span class="location-summary">${locationSummary}</span>` : ''}
            <span class="sessions-count">${film.dates.length}</span>
        </button>
        <div id="${popupId}" class="sessions-popup" onclick="event.stopPropagation()">
            ${createGroupedSessions(film)}
        </div>
    `;
}

function createSessionRow(film, dateObj) {
    const formatted = formatDate(dateObj.timestamp);
    const calendarUrl = generateCalendarUrl(film, dateObj);
    const titleLabel = `${getFilmTitle(film)}${film.year ? ` (${film.year})` : ''}`;

    // Check if session has a direct ticket URL
    const hasDirectUrl = dateObj.url_tickets && dateObj.url_tickets.trim() !== '';
    const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
    const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);

    let locationBadge = '';
    let locationText = '';
    if (dateObj.location && dateObj.location !== 'Unknown') {
        // For inline rows, prefix cinema name to sub-location names
        let displayLocation = dateObj.location;
        if (isRenoirLocation(dateObj.location)) {
            displayLocation = `Renoir ${dateObj.location}`;
        }
        locationBadge = `<span class="location-badge">${escapeHtml(displayLocation)}</span>`;
        locationText = displayLocation;
    }

    // Version badge for dubbed sessions
    const versionBadge = dateObj.version === 'dubbed'
        ? `<span class="version-badge dubbed" title="${t('dubbedTooltip')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>ES</span></span>`
        : '';

    // Create full date/time label for modal header
    const timeLabel = `${formatted}${locationText ? ' - ' + locationText : ''}`;

    return `
        <button class="date-row" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}')">
            <span class="date-badge">${formatted}</span>
            ${locationBadge}
            ${versionBadge}
        </button>
    `;
}

// Get fallback URL for a theater when film doesn't have a theater link
function getTheaterFallbackUrl(film, dateObj) {
    const location = dateObj.location || '';
    if (isRenoirLocation(location)) {
        return 'https://www.cinesrenoir.com/';
    }
    if (isEmbajadoresLocation(location)) {
        return 'https://cinesembajadores.es/madrid/';
    }
    if (film.theater === 'Cineteca Madrid') {
        return 'https://www.cinetecamadrid.com/';
    }
    if (film.theater === 'Cine Doré') {
        return 'https://www.culturaydeporte.gob.es/filmoteca/el-cine-dore.html';
    }
    if (film.theater === 'Golem Madrid') {
        return 'https://www.golem.es/golem/golem-madrid';
    }
    if (film.theater === 'Sala Berlanga' || location === 'Sala Berlanga') {
        return 'https://salaberlanga.com/programacion-de-actividades/';
    }
    return '#';
}

function toggleSessionAction(event, actionId) {
    event.stopPropagation();
    event.preventDefault();

    const actionMenu = document.getElementById(actionId);

    // Close all other action menus first
    document.querySelectorAll('.session-actions.show').forEach(m => {
        if (m.id !== actionId) {
            m.classList.remove('show');
        }
    });

    // Toggle this menu
    actionMenu.classList.toggle('show');
}

// Open session action modal (for popup sessions)
function openSessionModal(event, titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl) {
    event.stopPropagation();
    event.preventDefault();

    const modal = document.getElementById('session-modal');
    const timeSpan = document.getElementById('session-modal-time');
    const titleSpan = document.getElementById('session-modal-title');
    const actionsDiv = document.getElementById('session-modal-actions');

    titleSpan.textContent = titleLabel;
    timeSpan.textContent = timeLabel;

    // Build action buttons (no emojis)
    let actionsHtml = '';
    if (hasDirectUrl === 'true') {
        actionsHtml = `
            <a href="${ticketUrl}" class="session-modal-action" target="_blank">
                ${t('buyTickets')}
            </a>
            <a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                ${t('viewFilmPage')}
            </a>
            <a href="${calendarUrl}" class="session-modal-action" target="_blank">
                ${t('addToCalendar')}
            </a>
        `;
    } else {
        actionsHtml = `
            <a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                ${t('buyTickets')}
            </a>
            <a href="${calendarUrl}" class="session-modal-action" target="_blank">
                ${t('addToCalendar')}
            </a>
        `;
    }

    actionsDiv.innerHTML = actionsHtml;
    modal.classList.add('show');
}

function closeSessionModal(event) {
    // Stop propagation to prevent closing sessions popup
    if (event) {
        event.stopPropagation();
        // Only close if clicking overlay itself, not content
        if (event.target !== event.currentTarget) return;
    }

    const modal = document.getElementById('session-modal');
    if (!modal.classList.contains('show')) {
        return;
    }

    modal.classList.add('closing');
    const finish = () => {
        modal.classList.remove('show');
        modal.classList.remove('closing');
    };
    setTimeout(finish, 220);
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSessionModal();
        document.querySelectorAll('.sessions-popup.show').forEach(p => {
            closeSessionsPopup(p, p.previousElementSibling);
        });
    }
});

// Close session action menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.session-wrapper') && !e.target.closest('.session-time-wrapper')) {
        document.querySelectorAll('.session-actions.show').forEach(m => {
            m.classList.remove('show');
        });
    }
});


function getDateRange(dates) {
    if (dates.length === 0) return '';

    const sortedDates = [...dates].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );

    const firstDate = new Date(sortedDates[0].timestamp);
    const lastDate = new Date(sortedDates[sortedDates.length - 1].timestamp);

    const formatShort = (d) => d.toLocaleDateString(getDateLocale(), {
        day: 'numeric',
        month: 'short'
    });

    if (firstDate.toDateString() === lastDate.toDateString()) {
        return formatShort(firstDate);
    }

    return `${formatShort(firstDate)} – ${formatShort(lastDate)}`;
}

function getLocationSummary(dates) {
    // Get unique locations
    const locations = [...new Set(dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];

    if (locations.length === 0) return '';

    // Check if all locations are Renoir cinemas (even if just one)
    const allRenoir = locations.every(loc => isRenoirLocation(loc));
    if (allRenoir) {
        return 'Renoir';
    }

    // Check if all locations are Embajadores cinemas
    const allEmbajadores = locations.every(loc => isEmbajadoresLocation(loc));
    if (allEmbajadores) {
        return 'Embajadores';
    }

    if (locations.length === 1) {
        // Single location
        return locations[0];
    }

    // Multiple different theaters
    return t('nTheaters', locations.length);
}

function createGroupedSessions(film) {
    // Group sessions by day
    const grouped = {};

    film.dates.forEach(dateObj => {
        const date = new Date(dateObj.timestamp);
        const dayKey = date.toISOString().split('T')[0];

        if (!grouped[dayKey]) {
            grouped[dayKey] = [];
        }
        grouped[dayKey].push(dateObj);
    });

    // Sort days
    const sortedDays = Object.keys(grouped).sort();

    return sortedDays.map(dayKey => {
        const sessions = grouped[dayKey];
        const dayDate = new Date(dayKey + 'T12:00:00');
        const dayLabel = dayDate.toLocaleDateString(getDateLocale(), {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });

        // Sort sessions by time
        sessions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return `
            <div class="sessions-day">
                <div class="sessions-day-header">${dayLabel}</div>
                <div class="sessions-day-times">
                    ${sessions.map(dateObj => {
            const time = new Date(dateObj.timestamp).toLocaleTimeString(getDateLocale(), {
                hour: '2-digit',
                minute: '2-digit'
            });

            const calendarUrl = generateCalendarUrl(film, dateObj);

            // Check if session has a direct ticket URL
            const hasDirectUrl = dateObj.url_tickets && dateObj.url_tickets.trim() !== '';
            const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
            const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);
            const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);

            const location = dateObj.location && dateObj.location !== 'Unknown'
                ? `<span class="location">${escapeHtml(dateObj.location)}</span>`
                : '';

            const versionTag = dateObj.version === 'dubbed'
                ? `<span class="version-badge dubbed" title="${t('dubbedTooltip')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>ES</span></span>`
                : '';

            // Create date/time label for modal header
            const dateLabel = new Date(dateObj.timestamp).toLocaleDateString(getDateLocale(), {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const timeLabel = `${dateLabel} ${time}${dateObj.location ? ' - ' + dateObj.location : ''}`;

            return `
                <button class="session-time" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}')">
                    <span class="time">${time}</span>
                    ${location}
                    ${versionTag}
                </button>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function toggleSessionsPopup(event, popupId) {
    event.stopPropagation();

    const button = event.currentTarget;
    const popup = document.getElementById(popupId);

    // Close all other popups first
    document.querySelectorAll('.sessions-popup.show').forEach(p => {
        if (p.id !== popupId) {
            closeSessionsPopup(p, p.previousElementSibling);
        }
    });

    // Toggle this popup
    if (popup.classList.contains('show')) {
        closeSessionsPopup(popup, button);
    } else {
        popup.classList.remove('closing');
        popup.classList.add('show');
        button.classList.add('active');
        popup.scrollTop = 0;
    }
}

function closeSessionsPopup(popup, button) {
    if (!popup.classList.contains('show')) {
        return;
    }

    popup.classList.add('closing');
    if (button) {
        button.classList.remove('active');
    }
    setTimeout(() => {
        popup.classList.remove('show', 'closing');
    }, 160);
}

// Close popups when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sessions-popup') && !e.target.closest('.sessions-toggle')) {
        document.querySelectorAll('.sessions-popup.show').forEach(p => {
            closeSessionsPopup(p, p.previousElementSibling);
        });
    }
});

function formatDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    return date.toLocaleDateString(getDateLocale(), {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
document.getElementById('search').addEventListener('input', () => {
    filterFilms();
    updateURLParams();
});
document.getElementById('theater-filter').addEventListener('change', () => {
    filterFilms();
    updateURLParams();
});
document.getElementById('theater-filter').addEventListener('change', () => {
    filterFilms();
    updateURLParams();
});
// Rated only filter removed
const dateFilter = document.getElementById('date-filter');

function setDateFilterMin() {
    const today = getLocalTodayStart();
    dateFilter.min = formatDateInputValue(today);
}

function formatSelectedDateForDisplay(dateValue) {
    if (!dateValue) return '';

    const [year, month, day] = dateValue.split('-').map(Number);
    if (!year || !month || !day) return dateValue;

    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(getDateLocale(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function updateDatePlaceholder() {
    if (dateFilter.value) {
        dateFilter.classList.add('has-value');
        const localizedDate = formatSelectedDateForDisplay(dateFilter.value);
        dateFilter.dataset.displayValue = localizedDate;
        dateFilter.title = localizedDate;
    } else {
        dateFilter.classList.remove('has-value');
        delete dateFilter.dataset.displayValue;
        dateFilter.title = '';
    }
}

function handleDateFilterChange() {
    filterFilms();
    updateDatePlaceholder();
    updateURLParams();
}

dateFilter.addEventListener('input', handleDateFilterChange);
dateFilter.addEventListener('change', handleDateFilterChange);

setDateFilterMin();

let minYear = 1900;
let maxYear = new Date().getFullYear();

function initYearFilter() {
    // Calculate min/max years only from films that still have upcoming sessions
    const todayStart = getLocalTodayStart();
    const validYears = allFilms
        .filter(film => film.dates?.some(d => {
            const dateObj = getDateOnly(d.timestamp);
            return dateObj && dateObj >= todayStart;
        }))
        .map(f => f.year)
        .filter(y => y !== null && !isNaN(y));

    if (validYears.length > 0) {
        minYear = Math.min(...validYears);
        maxYear = Math.max(...validYears);
    }

    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');

    // Set slider range and inputs
    [yearMinInput, yearMaxInput, yearMinVal, yearMaxVal].forEach(input => {
        input.min = minYear;
        input.max = maxYear;
    });

    // Set initial values from URL or defaults
    const params = new URLSearchParams(window.location.search);
    const startMin = params.get('min_year') || minYear;
    const startMax = params.get('max_year') || maxYear;

    yearMinInput.value = startMin;
    yearMaxInput.value = startMax;
    yearMinVal.value = startMin;
    yearMaxVal.value = startMax;

    updateSliderDisplay();
}

function updateSliderDisplay() {
    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');

    let minVal = parseInt(yearMinInput.value);
    let maxVal = parseInt(yearMaxInput.value);

    // Validate range
    if (minVal > maxVal) {
        const temp = minVal;
        minVal = maxVal;
        maxVal = temp;
    }

    // Update text inputs if they aren't focused (to avoid interrupting typing)
    if (document.activeElement !== yearMinVal) yearMinVal.value = minVal;
    if (document.activeElement !== yearMaxVal) yearMaxVal.value = maxVal;

    updateTrack(minVal, maxVal);
}

function updateTrack(minVal, maxVal) {
    const track = document.querySelector('.slider-track');
    const range = maxYear - minYear;
    if (range <= 0) return;

    const ratio1 = (minVal - minYear) / range;
    const ratio2 = (maxVal - minYear) / range;

    // Align gradient stops with the center of the thumbs (16px width)
    const thumbW = 16;
    const stop1 = `calc(${thumbW / 2}px + (100% - ${thumbW}px) * ${ratio1})`;
    const stop2 = `calc(${thumbW / 2}px + (100% - ${thumbW}px) * ${ratio2})`;

    track.style.background = `linear-gradient(to right, var(--border) ${stop1}, var(--accent) ${stop1}, var(--accent) ${stop2}, var(--border) ${stop2})`;
}

// Event listeners for SLIDERS
['year-min', 'year-max'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        updateSliderDisplay();
        filterFilms();

        // Debounce URL update
        clearTimeout(window.updateUrlTimeout);
        window.updateUrlTimeout = setTimeout(updateURLParams, 500);
    });
});

// Event listeners for TEXT inputs
['year-min-val', 'year-max-val'].forEach(id => {
    const input = document.getElementById(id);
    input.addEventListener('change', () => {
        validateAndSyncInputs();
        filterFilms();

        // Debounce URL update
        clearTimeout(window.updateUrlTimeout);
        window.updateUrlTimeout = setTimeout(updateURLParams, 500);
    });
});

// Clear filters button
document.getElementById('clear-filters').addEventListener('click', () => {
    // Reset inputs
    document.getElementById('search').value = '';
    document.getElementById('date-filter').value = '';
    updateDatePlaceholder();
    document.getElementById('theater-filter').value = '';

    // Reset watchlist filter
    clearWatchlist();

    // Reset year filter
    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');

    yearMinInput.value = minYear;
    yearMaxInput.value = maxYear;
    yearMinVal.value = minYear;
    yearMaxVal.value = maxYear;

    updateSliderDisplay();

    // updateURLParams will act on changed values, but let's clear URL explicitly
    const url = new URL(window.location);
    url.search = '';
    window.history.pushState({}, '', url);

    filterFilms();
});

function validateAndSyncInputs() {
    const yearMinInput = document.getElementById('year-min');
    const yearMaxInput = document.getElementById('year-max');
    const yearMinVal = document.getElementById('year-min-val');
    const yearMaxVal = document.getElementById('year-max-val');

    let minVal = parseInt(yearMinVal.value);
    let maxVal = parseInt(yearMaxVal.value);

    // Clamp to global bounds
    if (minVal < minYear) minVal = minYear;
    if (maxVal > maxYear) maxVal = maxYear;
    if (minVal > maxYear) minVal = maxYear;
    if (maxVal < minYear) maxVal = minYear;

    // Ensure min <= max
    if (minVal > maxVal) {
        const temp = minVal;
        minVal = maxVal;
        maxVal = temp;
    }

    // Update inputs with clamped values
    yearMinVal.value = minVal;
    yearMaxVal.value = maxVal;

    // Sync sliders
    yearMinInput.value = minVal;
    yearMaxInput.value = maxVal;

    updateTrack(minVal, maxVal);
}

// URL Parameter Handling
function applyFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);

    const search = params.get('search');
    const theater = params.get('theater');
    const date = params.get('date');

    if (search) {
        document.getElementById('search').value = search;
    }

    if (theater) {
        const theaterSelect = document.getElementById('theater-filter');
        // Verify it's a valid option
        if ([...theaterSelect.options].some(o => o.value === theater)) {
            theaterSelect.value = theater;
        }
    }

    if (date) {
        const minDate = dateFilter.min;
        if (!minDate || date >= minDate) {
            document.getElementById('date-filter').value = date;
            updateDatePlaceholder();
        } else {
            document.getElementById('date-filter').value = '';
            updateDatePlaceholder();
        }
    }

    // Year filter is initialized in initYearFilter() after films load
}

function updateURLParams() {
    const search = document.getElementById('search').value;
    const theater = document.getElementById('theater-filter').value;
    const date = document.getElementById('date-filter').value;

    // Get current slider values
    const minInput = document.getElementById('year-min');
    const maxInput = document.getElementById('year-max');
    const currentMin = Math.min(parseInt(minInput.value), parseInt(maxInput.value));
    const currentMax = Math.max(parseInt(minInput.value), parseInt(maxInput.value));

    const params = new URLSearchParams();

    if (search) params.set('search', search);
    if (theater) params.set('theater', theater);
    if (date) params.set('date', date);

    // Only add year params if they differ from global bounds
    if (currentMin > minYear) params.set('min_year', currentMin);
    if (currentMax < maxYear) params.set('max_year', currentMax);

    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
}


// Make entire input clickable to open picker (better UX)
dateFilter.addEventListener('click', function () {
    try {
        this.showPicker();
    } catch (e) {
        // Fallback for browsers that don't support showPicker
    }
});

// Google Maps links for theaters
const THEATER_LOCATIONS = {
    // Plaza de España - Cines Renoir
    'Plaza de España': 'Cines Renoir Plaza de España, C. de Martín de los Heros, 12, Moncloa - Aravaca, 28008 Madrid, Spain',
    // Princesa - Cines Renoir
    'Princesa': 'Cines Renoir Princesa, Calle de la Princesa, 3, Moncloa - Aravaca, 28008 Madrid, Spain',
    // Retiro - Cines Renoir
    'Retiro': 'Cines Renoir Retiro, C. de Narváez, 42, Retiro, 28009 Madrid, Spain',
    // Filmoteca Española - Cine Doré
    'Cine Doré': 'Cine Doré, C. de Sta. Isabel, 3, Centro, 28012 Madrid, Spain',
    // Cineteca Madrid
    'Cineteca': 'Cineteca, Pl. de Legazpi, 8, Arganzuela, 28045 Madrid, Spain',
    // Golem
    'Golem': 'Golem Madrid, C. de Martín de los Heros, 14, Moncloa - Aravaca, 28008 Madrid, Spain',
    // Sala Berlanga
    'Sala Berlanga': 'Sala Berlanga, C. de Andrés Mellado, 53, Chamberí, 28015 Madrid, Spain',
};

function generateCalendarUrl(film, dateObj) {
    try {
        const dateStr = dateObj.timestamp;
        // Date format is usually "YYYY-MM-DD HH:MM"
        const [datePart, timePart] = dateStr.split(' ');
        if (!datePart || !timePart) return '#';

        const start = new Date(dateStr.replace(' ', 'T'));
        const end = new Date(start.getTime() + (2 * 60 * 60 * 1000)); // Assume 2 hours duration

        // Format as local time for Google Calendar (YYYYMMDDTHHMMSS without Z)
        const formatGCal = (date) => {
            const pad = (n) => n.toString().padStart(2, '0');
            return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
        };

        const title = encodeURIComponent(`${getFilmTitle(film)} (${film.year || ''})`);

        let locationRaw = dateObj.location || film.theater;
        // Try to finding a map link
        // Check exact match or partial match (e.g. "Sala 1, Plaza de España")
        let mapLink = THEATER_LOCATIONS[locationRaw];
        if (!mapLink) {
            // Try to find if any key is contained in the location string
            const foundKey = Object.keys(THEATER_LOCATIONS).find(k => locationRaw.includes(k));
            if (foundKey) mapLink = THEATER_LOCATIONS[foundKey];
        }

        const details = encodeURIComponent(`Director: ${film.director}\nLink: ${film.theaterLink || ''}\nLocation: ${mapLink || ''}`);
        const location = encodeURIComponent(mapLink || locationRaw);
        const dates = `${formatGCal(start)}/${formatGCal(end)}`;

        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${dates}`;
    } catch (e) {
        console.error('Error generating calendar URL', e);
        return '#';
    }
}

// Language toggle
document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
});

// Apply initial translations
applyStaticTranslations();

// Load films on page load
// Load More button
document.getElementById('load-more-btn').addEventListener('click', showMore);

loadFilms();

// Watchlist filter
document.getElementById('watchlist-btn').addEventListener('click', () => {
    if (watchlistUrls) {
        clearWatchlist();
        filterFilms();
    } else {
        document.getElementById('watchlist-upload').click();
    }
});

// Prevent info trigger click from bubbling to the button
document.getElementById('watchlist-info-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    e.currentTarget.classList.toggle('show');
});

document.getElementById('watchlist-tooltip').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.addEventListener('click', () => {
    const trigger = document.getElementById('watchlist-info-trigger');
    trigger.classList.remove('show');
});

document.getElementById('watchlist-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        complete: (results) => {
            const urls = new Set();
            results.data.forEach(row => {
                const uri = row['Letterboxd URI'];
                if (uri) urls.add(uri.trim());
            });

            if (urls.size > 0) {
                watchlistUrls = urls;
                document.querySelector('.watchlist-filter').classList.add('active');
                document.getElementById('watchlist-label-full').textContent = t('watchlistActive');
                document.getElementById('watchlist-label-short').textContent = t('watchlistShort');
                document.getElementById('watchlist-count-info').style.display = 'block';
                document.getElementById('watchlist-count-info').textContent = t('watchlistCount', urls.size);
                filterFilms();
            }
        },
        error: (error) => {
            console.error('Error parsing watchlist CSV:', error);
        }
    });

    // Reset file input so same file can be re-uploaded
    event.target.value = '';
});

function clearWatchlist() {
    watchlistUrls = null;
    document.querySelector('.watchlist-filter').classList.remove('active');
    document.getElementById('watchlist-label-full').textContent = t('watchlistFull');
    document.getElementById('watchlist-label-short').textContent = t('watchlistShort');
    document.getElementById('watchlist-upload').value = '';
    document.getElementById('watchlist-count-info').style.display = 'none';
    document.getElementById('watchlist-count-info').textContent = '';
}
