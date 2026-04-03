// ── i18n ────────────────────────────────────────────────────────────────────────
let currentLang = localStorage.getItem('lang') || 'es';

const TRANSLATIONS = {
    es: {
        viewersLabel: (n) => `Vista por ${n} personas`,
        siteTitle: '🎬 Madrid Film Calendar',
        subtitle: 'Cine Estudio • Cine Paz • Cineteca • Doré • Embajadores • Golem • Renoir • Sala Berlanga • Sala Equis • Verdi • Cinesa • Yelmo • Más próximamente...',
        searchPlaceholder: 'Buscar por título o director',
        selectDate: 'Elegir día',
        allTheaters: 'Todos los cines',
        yearFrom: 'Año desde',
        yearTo: 'Año hasta',
        watchlistFull: 'En watchlist de Letterboxd',
        watchlistShort: 'En watchlist',
        watchlistActive: 'Watchlist activa',
        watchlistBtnTitle: 'Filtrar por watchlist de Letterboxd',
        watchlistToggleTitle: 'Activar/desactivar filtro de watchlist',
        watchlistIconTitle: 'Watchlist',
        watchedFull: 'No vistas en Letterboxd',
        watchedShort: 'No vistas',
        watchedActive: 'Vistas activa',
        watchedBtnTitle: 'Filtrar por películas vistas en Letterboxd',
        watchedToggleTitle: 'Activar/desactivar filtro de no vistas',
        watchedIconTitle: 'No vistas',
        clearFilters: 'Limpiar filtros',
        clearFiltersTitle: 'Limpiar todos los filtros',
        csvTooltipTitle: '<strong>Filtrar con tus datos de Letterboxd</strong>',
        csvStep1: 'Ve a <a href="https://letterboxd.com/settings/data/" target="_blank">letterboxd.com/settings/data</a>',
        csvStep2: 'Haz clic en <em>Export your data</em>',
        csvStep3: 'Del ZIP descargado, sube <em>watchlist.csv</em> y/o <em>watched.csv</em> aquí',
        csvStep4: 'Activa/desactiva los filtros',
        csvPersistence: 'Los archivos se guardan en el navegador y sobreviven cuando vuelvas a abrir la página.',
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
        watchlistCount: (n) => `${n} películas en la watchlist`,
        watchedCount: (n) => `${n} películas vistas`,
        ratingTooltip: (rating) => `${rating} de 5 en Letterboxd`,
        removeWatchlist: 'Quitar watchlist',
        removeWatched: 'Quitar vistas',
        footerCreated: 'Creado con ayuda de IA • Patrocinado por mi amor por el cine',
        footerThanks: 'Gracias a los cines de Madrid, a <a href="https://letterboxd.com" target="_blank" rel="noopener noreferrer" class="attribution-link">Letterboxd</a> y a <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" class="attribution-link">TMDB</a>.',
        footerMistakes: 'Si encuentras algún error, <a href="mailto:ctl.covaci@gmail.com">escríbeme</a>, <a href="https://github.com/lbm364dl/film-calendar/issues">abre una issue en GitHub</a> o <a href="https://github.com/lbm364dl/film-calendar/blob/main/docs/screenings.json" target="_blank">corrígelo tú mismo</a> con una Pull Request.',
        viewOnGithub: 'Ver en GitHub',
        dubbedTooltip: 'Doblada al castellano',
        versionOriginal: 'Versión original',
        versionDubbed: 'En español',
        sortByRating: 'Ordenado por nota',
        sortByViewers: 'Ordenado por viewers',
        loadMore: (n) => `Mostrar más (${n} restantes)`,
        specialFilterFull: 'Sesiones especiales',
        specialFilterShort: 'Especiales',
        specialFilterTitle: 'Mostrar solo sesiones especiales',
        specialTooltip: (type) => `Sesión especial: ${type}`,
        searchTheaters: 'Buscar cine...',
        selectAll: 'Todos',
        selectNone: 'Ninguno',
        nTheatersSelected: (n, total) => n === total ? 'Todos los cines' : n === 0 ? 'Ningún cine' : `${n} de ${total} cines`,
        theaterTooltipTitle: '<strong>Selección de cines</strong>',
        theaterTooltipBody: 'Tu selección de cines se guarda en el navegador. Si hay cines a los que nunca vas, desmárcalos para no ver sus sesiones.',
        showSalas: (selected, total) => `${selected}/${total} sedes ▾`,
        hideSalas: 'ocultar ▴',
        allGenres: 'Todos los géneros',
        allCountries: 'Todos los países',
        searchGenres: 'Buscar género...',
        searchCountries: 'Buscar país...',
        nGenresSelected: (n, total) => n === total ? 'Todos los géneros' : n === 0 ? 'Ningún género' : `${n} de ${total} géneros`,
        nCountriesSelected: (n, total) => n === total ? 'Todos los países' : n === 0 ? 'Ningún país' : `${n} de ${total} países`,
        countryTooltipTitle: '<strong>Filtro por país</strong>',
        countryTooltipBody: 'Este filtro es orientativo. Indica que el país participó en la producción o está relacionado con la película, no necesariamente que esté en el idioma de ese país. Datos obtenidos de TMDB.',
    },
    en: {
        viewersLabel: (n) => `${n} viewers`,
        siteTitle: '🎬 Madrid Film Calendar',
        subtitle: 'Cine Estudio • Cine Paz • Cineteca • Doré • Embajadores • Golem • Renoir • Sala Berlanga • Sala Equis • Verdi • Cinesa • Yelmo • More coming...',
        searchPlaceholder: 'Search by title or director',
        selectDate: 'Select date',
        allTheaters: 'All Theaters',
        yearFrom: 'Year from',
        yearTo: 'Year to',
        watchlistFull: 'On Letterboxd watchlist',
        watchlistShort: 'On watchlist',
        watchlistActive: 'Watchlist active',
        watchlistBtnTitle: 'Filter by Letterboxd watchlist',
        watchlistToggleTitle: 'Toggle watchlist filter',
        watchlistIconTitle: 'Watchlist',
        watchedFull: 'Not watched on Letterboxd',
        watchedShort: 'Not watched',
        watchedActive: 'Watched active',
        watchedBtnTitle: 'Filter by Letterboxd watched',
        watchedToggleTitle: 'Toggle not watched filter',
        watchedIconTitle: 'Not watched',
        clearFilters: 'Clear all filters',
        clearFiltersTitle: 'Clear all filters',
        csvTooltipTitle: '<strong>Filter with your Letterboxd data</strong>',
        csvStep1: 'Go to <a href="https://letterboxd.com/settings/data/" target="_blank">letterboxd.com/settings/data</a>',
        csvStep2: 'Click <em>Export your data</em>',
        csvStep3: 'From the downloaded ZIP, upload <em>watchlist.csv</em> and/or <em>watched.csv</em> here',
        csvStep4: 'Toggle the filters on/off with the switches',
        csvPersistence: 'Files are saved in your browser and persist across page refreshes.',
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
        watchlistCount: (n) => `${n} films on watchlist`,
        watchedCount: (n) => `${n} watched films`,
        ratingTooltip: (rating) => `${rating} out of 5 on Letterboxd`,
        removeWatchlist: 'Remove watchlist',
        removeWatched: 'Remove watched',
        footerCreated: 'Created with the help of AI • Sponsored by my love for films',
        footerThanks: 'Thanks to Madrid theaters, <a href="https://letterboxd.com" target="_blank" rel="noopener noreferrer" class="attribution-link">Letterboxd</a>, and <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" class="attribution-link">TMDB</a>.',
        footerMistakes: 'If you find any mistakes, <a href="mailto:ctl.covaci@gmail.com">write to me</a>, <a href="https://github.com/lbm364dl/film-calendar/issues">open a GitHub issue</a> or <a href="https://github.com/lbm364dl/film-calendar/blob/main/docs/screenings.json" target="_blank">fix it yourself</a> via Pull Request.',
        viewOnGithub: 'View on GitHub',
        dubbedTooltip: 'Dubbed in Spanish',
        versionOriginal: 'Original version',
        versionDubbed: 'In Spanish',
        sortByRating: 'Sorted by rating',
        sortByViewers: 'Sorted by viewers',
        loadMore: (n) => `Load more (${n} remaining)`,
        specialFilterFull: 'Special sessions',
        specialFilterShort: 'Special',
        specialFilterTitle: 'Show only special sessions',
        specialTooltip: (type) => `Special session: ${type}`,
        searchTheaters: 'Search theaters...',
        selectAll: 'All',
        selectNone: 'None',
        nTheatersSelected: (n, total) => n === total ? 'All Theaters' : n === 0 ? 'No theaters' : `${n} of ${total} theaters`,
        theaterTooltipTitle: '<strong>Theater selection</strong>',
        theaterTooltipBody: 'Your theater selection is saved in your browser. Uncheck theaters you never visit to keep their sessions out of your results.',
        showSalas: (selected, total) => `${selected}/${total} venues ▾`,
        hideSalas: 'hide ▴',
        allGenres: 'All genres',
        allCountries: 'All countries',
        searchGenres: 'Search genres...',
        searchCountries: 'Search countries...',
        nGenresSelected: (n, total) => n === total ? 'All genres' : n === 0 ? 'No genres' : `${n} of ${total} genres`,
        nCountriesSelected: (n, total) => n === total ? 'All countries' : n === 0 ? 'No countries' : `${n} of ${total} countries`,
        countryTooltipTitle: '<strong>Country filter</strong>',
        countryTooltipBody: 'This filter is approximate. It means the country was involved in the production or is related to the film, not necessarily that the film is in that country\'s language. Data from TMDB.',
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

const SPECIAL_TYPE_LABELS = {
    es: {
        conference: 'Conferencia',
        shorts: 'Cortometrajes',
        festival: 'Festival',
        event: 'Evento',
        compilation: 'Compilación',
        opera: 'Ópera',
        ballet: 'Ballet',
        theater: 'Teatro',
        concert: 'Concierto',
        tv: 'TV',
    },
    en: {
        conference: 'Conference',
        shorts: 'Shorts',
        festival: 'Festival',
        event: 'Event',
        compilation: 'Compilation',
        opera: 'Opera',
        ballet: 'Ballet',
        theater: 'Theater',
        concert: 'Concert',
        tv: 'TV',
    }
};

function translateSpecialType(type) {
    if (!type) return type;
    const labels = SPECIAL_TYPE_LABELS[currentLang] || SPECIAL_TYPE_LABELS.en;
    return labels[type.toLowerCase()] || type;
}

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
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
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
    updateCsvCountLabels();
}

function updateCsvCountLabels() {
    const watchlistCountInfo = document.getElementById('watchlist-count-info');
    const watchedCountInfo = document.getElementById('watched-count-info');

    if (watchlistCountInfo && watchlistUrls) {
        watchlistCountInfo.textContent = t('watchlistCount', watchlistUrls.size);
    }

    if (watchedCountInfo && watchedUrls) {
        watchedCountInfo.textContent = t('watchedCount', watchedUrls.size);
    }
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyStaticTranslations();
    updateTheaterTriggerLabel();
    if (selectedGenres) updateFilterTriggerLabel('genre', selectedGenres, allGenres);
    if (selectedCountries) updateFilterTriggerLabel('country', selectedCountries, allCountries);
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
let watchedUrls = null;

// Whether each filter is actively applied (toggles)
let watchlistFilterActive = false;
let watchedFilterActive = false;
let specialFilterActive = false;

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
            let theaterDisplay = locations.length > 0 ? locations.map(getDisplayName).join(', ') : 'Unknown';
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
        initGenreCountryFilters(); // Initialize genre/country dropdowns from data
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
            return { timestamp: item, location: 'Unknown', url_tickets: '', url_info: '', version: null, special: null };
        } else if (typeof item === 'object' && item !== null) {
            // New format: object with timestamp/location/urls/version
            return {
                timestamp: item.timestamp,
                location: item.location || 'Unknown',
                // Map new keys to internal structure if needed, or keep them
                url_tickets: item.url_tickets || item.url || '', // Support both old 'url' and new 'url_tickets'
                url_info: item.url_info || '',
                version: item.version || null,
                special: item.special || null,
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

// Cinesa cinema locations
function isCinesaLocation(location) {
    return location && location.startsWith('Cinesa ');
}

// Yelmo cinema locations
function isYelmoLocation(location) {
    return location && location.startsWith('Yelmo ');
}

function isSpanishFilm(film) {
    const lang = film.primaryLanguage;
    if (!lang) return false;
    const values = Array.isArray(lang) ? lang : [lang];
    return values.some(v => v === 'es' || v === 'Spanish');
}

function matchesSelectedTheaters(location) {
    return selectedTheaters.has(location);
}

function filterFilms() {
    const searchTerm = normalizeText(document.getElementById('search').value);
    const allTheatersSelected = selectedTheaters.size === ALL_THEATER_VALUES.length;
    const selectedDate = document.getElementById('date-filter').value;
    const selectedVersion = document.getElementById('version-filter').dataset.current;
    const todayStart = getLocalTodayStart();

    filteredFilms = allFilms.map(film => {
        const futureDates = film.dates.filter(d => {
            const dateObj = getDateOnly(d.timestamp);
            return dateObj && dateObj >= todayStart;
        });

        // Apply theater/date/version filters at the session level so all constraints match the same session.
        const sessionFilteredDates = futureDates.filter(d => {
            if (!allTheatersSelected) {
                if (!matchesSelectedTheaters(d.location)) return false;
            }

            if (selectedDate && !d.timestamp.startsWith(selectedDate)) {
                return false;
            }

            if (selectedVersion && !isSpanishFilm(film)) {
                if (selectedVersion === 'original' && d.version === 'dubbed') return false;
                if (selectedVersion === 'dubbed' && d.version !== 'dubbed') return false;
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
        if (watchlistUrls && watchlistFilterActive) {
            matchesWatchlist = film.letterboxdShortUrl && watchlistUrls.has(film.letterboxdShortUrl);
        }

        // Watched filter (exclude watched films)
        let matchesWatched = true;
        if (watchedUrls && watchedFilterActive) {
            matchesWatched = !(film.letterboxdShortUrl && watchedUrls.has(film.letterboxdShortUrl));
        }

        // Special sessions filter
        let matchesSpecial = true;
        if (specialFilterActive) {
            matchesSpecial = film.dates.some(d => d.special);
        }

        // Genre filter
        let matchesGenre = true;
        if (selectedGenres && selectedGenres.size < allGenres.length) {
            matchesGenre = film.genres && film.genres.some(g => selectedGenres.has(g));
        }

        // Country filter
        let matchesCountry = true;
        if (selectedCountries && selectedCountries.size < allCountries.length) {
            matchesCountry = film.country && film.country.some(c => selectedCountries.has(c));
        }

        return matchesSearch && matchesYear && matchesWatchlist && matchesWatched && matchesSpecial && matchesGenre && matchesCountry;
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

    // Sort by selected criterion, then by title
    const sortBy = document.getElementById('sort-filter').dataset.current;
    sortedFilms = [...filteredFilms].sort((a, b) => {
        if (sortBy === 'viewers') {
            const av = a.viewers ?? 0;
            const bv = b.viewers ?? 0;
            if (av !== bv) return bv - av;
        } else {
            if (a.rating !== null && b.rating !== null) {
                if (a.rating !== b.rating) return b.rating - a.rating;
            }
            if (a.rating !== null) return -1;
            if (b.rating !== null) return 1;
        }
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
    const ratingValue = film.rating ? film.rating.toFixed(1) : null;
    const ratingHTML = film.rating
        ? `<div class="rating" title="${escapeHtml(t('ratingTooltip', ratingValue))}"><span class="metric-icon rating-icon" aria-hidden="true"></span>${ratingValue}</div>`
        : '';

    let viewersFormatted = formatViewerCount(film.viewers);
    let viewersTooltip = '';
    if (viewersFormatted) {
        if (currentLang === 'es') {
            viewersTooltip = t('viewersLabel', film.viewers.toLocaleString('es-ES'));
        } else {
            viewersTooltip = t('viewersLabel', film.viewers.toLocaleString('en-US'));
        }
    }
    const viewersHTML = viewersFormatted
        ? `<div class="viewers" title="${escapeHtml(viewersTooltip)}"><span class="metric-icon viewers-icon" aria-hidden="true"></span>${viewersFormatted}</div>`
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
    const hasFilmUrl = !!(dateObj.url_info && dateObj.url_info.trim() !== '');
    const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);

    let locationBadge = '';
    let locationText = '';
    if (dateObj.location && dateObj.location !== 'Unknown') {
        const locName = getDisplayName(dateObj.location);
        locationBadge = `<span class="location-badge">${escapeHtml(locName)}</span>`;
        locationText = locName;
    }

    // Version badge for dubbed sessions
    const versionBadge = dateObj.version === 'dubbed'
        ? `<span class="version-badge dubbed" title="${t('dubbedTooltip')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>ES</span></span>`
        : '';

    // Special session badge
    const specialBadge = dateObj.special
        ? `<span class="special-badge" title="${escapeHtml(t('specialTooltip', translateSpecialType(dateObj.special)))}">${escapeHtml(translateSpecialType(dateObj.special))}</span>`
        : '';

    // Create full date/time label for modal header
    const timeLabel = `${formatted}${locationText ? ' - ' + locationText : ''}`;

    return `
        <button class="date-row" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}', '${hasFilmUrl}')">
            <span class="date-badge">${formatted}</span>
            ${locationBadge}
            ${versionBadge}
            ${specialBadge}
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
    if (film.theater === 'Cineteca' || location === 'Cineteca Madrid') {
        return 'https://www.cinetecamadrid.com/';
    }
    if (film.theater === 'Doré' || location === 'Cine Doré') {
        return 'https://www.culturaydeporte.gob.es/filmoteca/el-cine-dore.html';
    }
    if (film.theater === 'Golem') {
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
function openSessionModal(event, titleLabel, timeLabel, ticketUrl, filmPageUrl, calendarUrl, hasDirectUrl, hasFilmUrl) {
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
            ${hasFilmUrl === 'true' ? `<a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                ${t('viewFilmPage')}
            </a>` : ''}
            <a href="${calendarUrl}" class="session-modal-action" target="_blank">
                ${t('addToCalendar')}
            </a>
        `;
    } else {
        actionsHtml = `
            ${hasFilmUrl === 'true' ? `<a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                ${t('buyTickets')}
            </a>` : ''}
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

function getDisplayName(location) {
    return THEATER_DISPLAY_NAMES[location] || location;
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
        return getDisplayName(locations[0]);
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
            const hasFilmUrl = !!(dateObj.url_info && dateObj.url_info.trim() !== '');
            const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);
            const titleLabel = film.year ? `${getFilmTitle(film)} (${film.year})` : getFilmTitle(film);

            const location = dateObj.location && dateObj.location !== 'Unknown'
                ? `<span class="location">${escapeHtml(getDisplayName(dateObj.location))}</span>`
                : '';

            const versionTag = dateObj.version === 'dubbed'
                ? `<span class="version-badge dubbed" title="${t('dubbedTooltip')}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>ES</span></span>`
                : '';

            const specialTag = dateObj.special
                ? `<span class="special-badge" title="${escapeHtml(t('specialTooltip', translateSpecialType(dateObj.special)))}">${escapeHtml(translateSpecialType(dateObj.special))}</span>`
                : '';

            // Create date/time label for modal header
            const dateLabel = new Date(dateObj.timestamp).toLocaleDateString(getDateLocale(), {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const timeLabel = `${dateLabel} ${time}${dateObj.location ? ' - ' + getDisplayName(dateObj.location) : ''}`;

            return `
                <button class="session-time" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}', '${hasFilmUrl}')">
                    <span class="time">${time}</span>
                    ${location}
                    ${versionTag}
                    ${specialTag}
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

// ── Theater Multi-Select ────────────────────────────────────────────────────
const THEATER_GROUPS = [
    { label: 'Renoir', children: [
        { value: 'Princesa', label: 'Princesa' },
        { value: 'Retiro', label: 'Retiro' },
        { value: 'Plaza de España', label: 'Plaza de España' },
    ]},
    { value: 'Cineteca Madrid', label: 'Cineteca' },
    { value: 'Cine Doré', label: 'Doré' },
    { value: 'Cine Estudio', label: 'Cine Estudio' },
    { value: 'Golem', label: 'Golem' },
    { value: 'Sala Berlanga', label: 'Sala Berlanga' },
    { label: 'Embajadores', children: [
        { value: 'Embajadores Glorieta', label: 'Glorieta' },
        { value: 'Embajadores Ercilla', label: 'Ercilla' },
    ]},
    { value: 'Cine Paz', label: 'Cine Paz' },
    { value: 'Sala Equis', label: 'Sala Equis' },
    { value: 'Verdi', label: 'Verdi' },
    { label: 'Cinesa', children: [
        { value: 'Cinesa Equinoccio', label: 'Equinoccio' },
        { value: 'Cinesa La Gavia', label: 'La Gavia' },
        { value: 'Cinesa La Moraleja', label: 'La Moraleja' },
        { value: 'Cinesa Las Rosas', label: 'Las Rosas' },
        { value: 'Cinesa Las Rozas', label: 'Las Rozas' },
        { value: 'Cinesa Manoteras', label: 'Manoteras' },
        { value: 'Cinesa Mendez Alvaro', label: 'Méndez Álvaro' },
        { value: 'Cinesa Nassica', label: 'Nassica' },
        { value: 'Cinesa Oasiz', label: 'Oasiz' },
        { value: 'Cinesa Parquesur', label: 'Parquesur' },
        { value: 'Cinesa Plaza Loranca 2', label: 'Plaza Loranca 2' },
        { value: 'Cinesa Principe Pio', label: 'Príncipe Pío' },
        { value: 'Cinesa Proyecciones', label: 'Proyecciones' },
        { value: 'Cinesa Xanadu', label: 'Xanadú' },
    ]},
    { label: 'Yelmo', children: [
        { value: 'Yelmo Ideal', label: 'Ideal' },
        { value: 'Yelmo Islazul', label: 'Islazul' },
        { value: 'Yelmo La Vaguada', label: 'La Vaguada' },
        { value: 'Yelmo Palafox Luxury', label: 'Palafox Luxury' },
        { value: 'Yelmo Parque Corredor', label: 'Parque Corredor' },
        { value: 'Yelmo Plaza Norte 2', label: 'Plaza Norte 2' },
        { value: 'Yelmo Planetocio', label: 'Planetocio' },
        { value: 'Yelmo Plenilunio', label: 'Plenilunio' },
        { value: 'Yelmo Rivas H2O', label: 'Rivas H2O' },
        { value: 'Yelmo TresAguas', label: 'TresAguas' },
    ]},
];

// Flat list of all selectable location values + display name map
const ALL_THEATER_VALUES = [];
const THEATER_DISPLAY_NAMES = {};
THEATER_GROUPS.forEach(g => {
    if (g.children) {
        g.children.forEach(c => {
            ALL_THEATER_VALUES.push(c.value);
            THEATER_DISPLAY_NAMES[c.value] = g.label + ' ' + c.label;
        });
    } else {
        ALL_THEATER_VALUES.push(g.value);
        THEATER_DISPLAY_NAMES[g.value] = g.label;
    }
});

let selectedTheaters = new Set(ALL_THEATER_VALUES);

// Migrate old localStorage format (chain names → individual locations)
const OLD_TO_NEW = {
    'Cines Renoir': ['Princesa', 'Retiro', 'Plaza de España'],
    'Cineteca Madrid': ['Cineteca Madrid'],
    'Cines Embajadores': ['Embajadores Glorieta', 'Embajadores Ercilla'],
    'Cinesa': THEATER_GROUPS.find(g => g.label === 'Cinesa').children.map(c => c.value),
    'Cines Yelmo': THEATER_GROUPS.find(g => g.label === 'Yelmo').children.map(c => c.value),
};

function loadTheaterSelection() {
    const saved = localStorage.getItem('selectedTheaters');
    if (saved) {
        try {
            const arr = JSON.parse(saved);
            if (Array.isArray(arr)) {
                // Migrate old chain-level values
                const expanded = [];
                arr.forEach(v => {
                    if (OLD_TO_NEW[v]) expanded.push(...OLD_TO_NEW[v]);
                    else expanded.push(v);
                });
                const valid = expanded.filter(v => ALL_THEATER_VALUES.includes(v));
                selectedTheaters = new Set(valid);
            }
        } catch (e) { /* ignore */ }
    }
}

function saveTheaterSelection() {
    localStorage.setItem('selectedTheaters', JSON.stringify([...selectedTheaters]));
}

function updateTheaterTriggerLabel() {
    const trigger = document.getElementById('theater-trigger');
    const span = trigger.querySelector('span');
    const total = ALL_THEATER_VALUES.length;
    const n = selectedTheaters.size;
    span.textContent = t('nTheatersSelected', n, total);
}

function updateGroupCheckbox(groupCb, childValues) {
    const checkedCount = childValues.filter(v => selectedTheaters.has(v)).length;
    groupCb.checked = checkedCount === childValues.length;
    groupCb.indeterminate = checkedCount > 0 && checkedCount < childValues.length;
}

function buildTheaterOptions() {
    const container = document.getElementById('theater-options');
    container.innerHTML = '';

    THEATER_GROUPS.forEach(group => {
        if (group.children) {
            const childValues = group.children.map(c => c.value);
            const searchLabel = (group.label + ' ' + group.children.map(c => c.label).join(' ')).toLowerCase();

            // Group wrapper
            const groupDiv = document.createElement('div');
            groupDiv.className = 'theater-group';
            groupDiv.dataset.label = searchLabel;

            // Group header row
            const header = document.createElement('div');
            header.className = 'theater-option theater-group-header';
            const groupCb = document.createElement('input');
            groupCb.type = 'checkbox';
            updateGroupCheckbox(groupCb, childValues);
            groupCb.addEventListener('change', (e) => {
                e.stopPropagation();
                childValues.forEach(v => {
                    if (groupCb.checked) selectedTheaters.add(v);
                    else selectedTheaters.delete(v);
                });
                groupDiv.querySelectorAll('.theater-sub-option input[type="checkbox"]')
                    .forEach(cb => cb.checked = groupCb.checked);
                updateExpandLabel();
                updateTheaterTriggerLabel();
                saveTheaterSelection();
                filterFilms();
                updateURLParams();
            });
            const headerLabel = document.createElement('label');
            headerLabel.appendChild(groupCb);
            headerLabel.appendChild(document.createTextNode(group.label));

            const expandBtn = document.createElement('button');
            expandBtn.type = 'button';
            expandBtn.className = 'theater-expand-btn';
            const updateExpandLabel = () => {
                if (groupDiv.classList.contains('expanded')) {
                    expandBtn.textContent = t('hideSalas');
                } else {
                    const selected = childValues.filter(v => selectedTheaters.has(v)).length;
                    expandBtn.textContent = t('showSalas', selected, childValues.length);
                }
            };
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                groupDiv.classList.toggle('expanded');
                updateExpandLabel();
            });
            updateExpandLabel();

            header.appendChild(headerLabel);
            header.appendChild(expandBtn);
            groupDiv.appendChild(header);

            // Children container
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'theater-sub-list';

            group.children.forEach(child => {
                const label = document.createElement('label');
                label.className = 'theater-option theater-sub-option';
                label.dataset.value = child.value;
                label.dataset.label = (group.label + ' ' + child.label).toLowerCase();
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = selectedTheaters.has(child.value);
                cb.addEventListener('change', () => {
                    if (cb.checked) selectedTheaters.add(child.value);
                    else selectedTheaters.delete(child.value);
                    updateGroupCheckbox(groupCb, childValues);
                    updateExpandLabel();
                    updateTheaterTriggerLabel();
                    saveTheaterSelection();
                    filterFilms();
                    updateURLParams();
                });
                label.appendChild(cb);
                label.appendChild(document.createTextNode(child.label));
                childrenDiv.appendChild(label);
            });

            groupDiv.appendChild(childrenDiv);
            container.appendChild(groupDiv);
        } else {
            const label = document.createElement('label');
            label.className = 'theater-option';
            label.dataset.value = group.value;
            label.dataset.label = group.label.toLowerCase();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = selectedTheaters.has(group.value);
            cb.addEventListener('change', () => {
                if (cb.checked) selectedTheaters.add(group.value);
                else selectedTheaters.delete(group.value);
                updateTheaterTriggerLabel();
                saveTheaterSelection();
                filterFilms();
                updateURLParams();
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(group.label));
            container.appendChild(label);
        }
    });
}

function initTheaterMultiselect() {
    loadTheaterSelection();
    buildTheaterOptions();
    updateTheaterTriggerLabel();

    const wrapper = document.getElementById('theater-filter');
    const trigger = document.getElementById('theater-trigger');
    const dropdown = document.getElementById('theater-dropdown');
    const searchInput = document.getElementById('theater-search');

    trigger.addEventListener('click', (e) => {
        if (e.target.closest('.theater-info-trigger')) return;
        e.stopPropagation();
        wrapper.classList.toggle('open');
        if (wrapper.classList.contains('open')) {
            searchInput.value = '';
            searchInput.focus();
            buildTheaterOptions();
        }
    });

    searchInput.addEventListener('input', () => {
        const q = normalizeText(searchInput.value);
        const isSearching = q.length > 0;

        // Standalone options
        document.querySelectorAll('#theater-options > .theater-option').forEach(opt => {
            opt.classList.toggle('hidden', !normalizeText(opt.dataset.label).includes(q));
        });

        // Groups
        document.querySelectorAll('.theater-group').forEach(group => {
            const groupLabel = normalizeText(group.dataset.label);
            const groupMatches = groupLabel.includes(q);

            // Show/hide individual children
            let anyChildVisible = false;
            group.querySelectorAll('.theater-sub-option').forEach(opt => {
                const matches = groupMatches || normalizeText(opt.dataset.label).includes(q);
                opt.classList.toggle('hidden', !matches);
                if (matches) anyChildVisible = true;
            });

            group.classList.toggle('hidden', !groupMatches && !anyChildVisible);
            // Auto-expand groups when searching, collapse when cleared
            if (isSearching && anyChildVisible) group.classList.add('expanded');
            else if (!isSearching) group.classList.remove('expanded');
        });
    });

    searchInput.addEventListener('click', (e) => e.stopPropagation());

    document.getElementById('theater-select-all').addEventListener('click', (e) => {
        e.stopPropagation();
        ALL_THEATER_VALUES.forEach(v => selectedTheaters.add(v));
        buildTheaterOptions();
        updateTheaterTriggerLabel();
        saveTheaterSelection();
        filterFilms();
        updateURLParams();
    });

    document.getElementById('theater-select-none').addEventListener('click', (e) => {
        e.stopPropagation();
        selectedTheaters.clear();
        buildTheaterOptions();
        updateTheaterTriggerLabel();
        saveTheaterSelection();
        filterFilms();
        updateURLParams();
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
            wrapper.classList.remove('show-help');
        } else if (!infoTrigger.contains(e.target) && !infoTooltip.contains(e.target)) {
            wrapper.classList.remove('show-help');
        }
    });

    const infoTrigger = document.getElementById('theater-info-trigger');
    const infoTooltip = document.getElementById('theater-info-tooltip');

    let isTouch = false;

    infoTrigger.addEventListener('touchstart', () => {
        isTouch = true;
    }, { passive: true });

    infoTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('show-help');
        isTouch = false;
    });

    infoTrigger.addEventListener('mouseenter', () => {
        if (!isTouch) wrapper.classList.add('show-help');
    });

    infoTrigger.addEventListener('mouseleave', (e) => {
        if (!isTouch && !infoTooltip.matches(':hover')) {
            wrapper.classList.remove('show-help');
        }
    });

    infoTooltip.addEventListener('mouseleave', () => {
        if (!isTouch) wrapper.classList.remove('show-help');
    });

    infoTooltip.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

initTheaterMultiselect();

// ── Genre / Country Multi-Selects ───────────────────────────────────────────
const COUNTRY_TRANSLATIONS_ES = {
    'United States of America': 'Estados Unidos', 'USA': 'EE.UU.',
    'United Kingdom': 'Reino Unido', 'UK': 'Reino Unido',
    'France': 'Francia', 'Germany': 'Alemania', 'Italy': 'Italia',
    'Spain': 'España', 'Japan': 'Japón', 'China': 'China',
    'Brazil': 'Brasil', 'Mexico': 'México', 'Argentina': 'Argentina',
    'South Korea': 'Corea del Sur', 'India': 'India', 'Russia': 'Rusia',
    'Sweden': 'Suecia', 'Denmark': 'Dinamarca', 'Norway': 'Noruega',
    'Finland': 'Finlandia', 'Poland': 'Polonia', 'Netherlands': 'Países Bajos',
    'Belgium': 'Bélgica', 'Switzerland': 'Suiza', 'Austria': 'Austria',
    'Portugal': 'Portugal', 'Ireland': 'Irlanda', 'Romania': 'Rumanía',
    'Hungary': 'Hungría', 'Czech Republic': 'República Checa',
    'Czechoslovakia': 'Checoslovaquia', 'Turkey': 'Turquía',
    'Greece': 'Grecia', 'Iran': 'Irán', 'Egypt': 'Egipto',
    'Morocco': 'Marruecos', 'Tunisia': 'Túnez', 'Colombia': 'Colombia',
    'Chile': 'Chile', 'Peru': 'Perú', 'Cuba': 'Cuba', 'Uruguay': 'Uruguay',
    'Paraguay': 'Paraguay', 'Panama': 'Panamá', 'Costa Rica': 'Costa Rica',
    'Dominican Republic': 'República Dominicana', 'Philippines': 'Filipinas',
    'Australia': 'Australia', 'New Zealand': 'Nueva Zelanda',
    'Canada': 'Canadá', 'Iceland': 'Islandia', 'Lebanon': 'Líbano',
    'Pakistan': 'Pakistán', 'Taiwan': 'Taiwán', 'Vietnam': 'Vietnam',
    'Singapore': 'Singapur', 'South Africa': 'Sudáfrica',
    'Palestinian Territory': 'Palestina', 'Latvia': 'Letonia',
    'Lithuania': 'Lituania', 'Slovakia': 'Eslovaquia',
    'Luxembourg': 'Luxemburgo', 'Andorra': 'Andorra',
    'Soviet Union': 'Unión Soviética', 'Cyprus': 'Chipre',
};

function translateCountry(country) {
    if (currentLang === 'es') return COUNTRY_TRANSLATIONS_ES[country] || country;
    return country;
}

// State for genre/country filters
let allGenres = [];
let allCountries = [];
let selectedGenres = null; // null = all (not yet initialized)
let selectedCountries = null;

function initGenreCountryFilters() {
    // Collect unique values from loaded data
    const genreSet = new Set();
    const countrySet = new Set();
    allFilms.forEach(film => {
        (film.genres || []).forEach(g => genreSet.add(g));
        (film.country || []).forEach(c => countrySet.add(c));
    });
    allGenres = [...genreSet].sort((a, b) => translateGenre(a).localeCompare(translateGenre(b), currentLang));
    allCountries = [...countrySet].sort((a, b) => translateCountry(a).localeCompare(translateCountry(b), currentLang));

    // Load from localStorage or default to all
    selectedGenres = new Set(allGenres);
    selectedCountries = new Set(allCountries);

    buildFilterDropdown('genre', allGenres, selectedGenres, translateGenre);
    buildFilterDropdown('country', allCountries, selectedCountries, translateCountry);
    updateFilterTriggerLabel('genre', selectedGenres, allGenres);
    updateFilterTriggerLabel('country', selectedCountries, allCountries);
    initFilterDropdownEvents('genre', allGenres, selectedGenres, translateGenre);
    initFilterDropdownEvents('country', allCountries, selectedCountries, translateCountry);
}


function updateFilterTriggerLabel(type, selected, all) {
    const span = document.getElementById(`${type}-trigger`).querySelector('span');
    const n = selected.size;
    const total = all.length;
    if (type === 'genre') {
        span.textContent = t('nGenresSelected', n, total);
    } else {
        span.textContent = t('nCountriesSelected', n, total);
    }
    // Remove data-i18n so applyStaticTranslations doesn't overwrite
    span.removeAttribute('data-i18n');
}

function buildFilterDropdown(type, allValues, selected, translateFn) {
    const container = document.getElementById(`${type}-options`);
    container.innerHTML = '';
    allValues.forEach(value => {
        const label = document.createElement('label');
        label.className = 'filter-dd-option';
        label.dataset.value = value;
        label.dataset.label = (translateFn(value) + ' ' + value).toLowerCase();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(value);
        cb.addEventListener('change', () => {
            if (cb.checked) selected.add(value);
            else selected.delete(value);
            updateFilterTriggerLabel(type, selected, allValues);

            filterFilms();
            updateURLParams();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(translateFn(value)));
        container.appendChild(label);
    });
}

function initFilterDropdownEvents(type, allValues, selected, translateFn) {
    const wrapper = document.getElementById(`${type}-filter`);
    const trigger = document.getElementById(`${type}-trigger`);
    const searchInput = document.getElementById(`${type}-search`);

    trigger.addEventListener('click', (e) => {
        if (e.target.closest('.country-info-trigger')) return;
        e.stopPropagation();
        // Close other filter dropdowns
        document.querySelectorAll('.filter-multiselect.open').forEach(el => {
            if (el !== wrapper) el.classList.remove('open');
        });
        wrapper.classList.toggle('open');
        if (wrapper.classList.contains('open')) {
            searchInput.value = '';
            buildFilterDropdown(type, allValues, selected, translateFn);
            searchInput.focus();
        }
    });

    searchInput.addEventListener('input', () => {
        const q = normalizeText(searchInput.value);
        document.querySelectorAll(`#${type}-options .filter-dd-option`).forEach(opt => {
            opt.classList.toggle('hidden', !normalizeText(opt.dataset.label).includes(q));
        });
    });

    searchInput.addEventListener('click', (e) => e.stopPropagation());

    wrapper.querySelector('.filter-dd-select-all').addEventListener('click', (e) => {
        e.stopPropagation();
        allValues.forEach(v => selected.add(v));
        wrapper.querySelectorAll('.filter-dd-option input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateFilterTriggerLabel(type, selected, allValues);

        filterFilms();
        updateURLParams();
    });

    wrapper.querySelector('.filter-dd-select-none').addEventListener('click', (e) => {
        e.stopPropagation();
        selected.clear();
        wrapper.querySelectorAll('.filter-dd-option input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateFilterTriggerLabel(type, selected, allValues);

        filterFilms();
        updateURLParams();
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
            wrapper.classList.remove('show-help');
        }
    });

    // Country info tooltip
    if (type === 'country') {
        const infoTrigger = document.getElementById('country-info-trigger');
        const infoTooltip = document.getElementById('country-info-tooltip');
        let isTouch = false;

        infoTrigger.addEventListener('touchstart', () => { isTouch = true; }, { passive: true });

        infoTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.toggle('show-help');
            isTouch = false;
        });

        infoTrigger.addEventListener('mouseenter', () => {
            if (!isTouch) wrapper.classList.add('show-help');
        });

        infoTrigger.addEventListener('mouseleave', () => {
            if (!isTouch && !infoTooltip.matches(':hover')) wrapper.classList.remove('show-help');
        });

        infoTooltip.addEventListener('mouseleave', () => {
            if (!isTouch) wrapper.classList.remove('show-help');
        });

        infoTooltip.addEventListener('click', (e) => e.stopPropagation());
    }
}

// Event listeners
document.getElementById('search').addEventListener('input', () => {
    filterFilms();
    updateURLParams();
});
// Toggle filter buttons (version, sort)
document.querySelectorAll('.toggle-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const values = btn.dataset.values.split(',');
        const currentIdx = values.indexOf(btn.dataset.current);
        const nextIdx = (currentIdx + 1) % values.length;
        btn.dataset.current = values[nextIdx];

        // Update label via i18n key mapping
        const labelMap = {
            'version-filter': { original: 'versionOriginal', dubbed: 'versionDubbed' },
            'sort-filter': { rating: 'sortByRating', viewers: 'sortByViewers' },
        };
        const map = labelMap[btn.id];
        if (map) {
            const span = btn.querySelector('span');
            span.dataset.i18n = map[values[nextIdx]];
            span.textContent = t(map[values[nextIdx]]);
        }

        // Active state for version filter
        if (btn.id === 'version-filter') {
            btn.classList.toggle('active', btn.dataset.current === 'original');
        }

        filterFilms();
        updateURLParams();
    });
});
// Special sessions filter
document.getElementById('special-filter').addEventListener('click', () => {
    specialFilterActive = !specialFilterActive;
    document.getElementById('special-filter').classList.toggle('active', specialFilterActive);
    filterFilms();
    updateURLParams();
});

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
    // Theater selection is a persistent preference — don't reset it
    const versionBtn = document.getElementById('version-filter');
    versionBtn.dataset.current = 'original';
    versionBtn.querySelector('span').textContent = t('versionOriginal');
    versionBtn.querySelector('span').dataset.i18n = 'versionOriginal';
    versionBtn.classList.add('active');

    const sortBtn = document.getElementById('sort-filter');
    sortBtn.dataset.current = 'rating';
    sortBtn.querySelector('span').textContent = t('sortByRating');
    sortBtn.querySelector('span').dataset.i18n = 'sortByRating';

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

    // Reset special filter
    specialFilterActive = false;
    const specialBtn = document.getElementById('special-filter');
    if (specialBtn) specialBtn.classList.remove('active');

    // Reset genre/country filters
    if (selectedGenres) {
        allGenres.forEach(v => selectedGenres.add(v));
        updateFilterTriggerLabel('genre', selectedGenres, allGenres);
    }
    if (selectedCountries) {
        allCountries.forEach(v => selectedCountries.add(v));
        updateFilterTriggerLabel('country', selectedCountries, allCountries);
    }

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
    const date = params.get('date');

    if (search) {
        document.getElementById('search').value = search;
    }

    // Handle multi-theater URL params
    const excludeParam = params.get('exclude_theaters');
    const theaterParam = params.get('theater'); // backwards compat with old single-theater URLs
    if (excludeParam) {
        if (excludeParam === 'all') {
            selectedTheaters.clear();
        } else {
            const excluded = excludeParam.split(',');
            selectedTheaters = new Set(ALL_THEATER_VALUES);
            excluded.forEach(v => selectedTheaters.delete(v));
        }
        buildTheaterOptions();
        updateTheaterTriggerLabel();
        saveTheaterSelection();
    } else if (theaterParam) {
        // Old URL format: single theater selected — expand chain names
        const expanded = OLD_TO_NEW[theaterParam];
        if (expanded) {
            selectedTheaters = new Set(expanded);
        } else if (ALL_THEATER_VALUES.includes(theaterParam)) {
            selectedTheaters = new Set([theaterParam]);
        }
        buildTheaterOptions();
        updateTheaterTriggerLabel();
        saveTheaterSelection();
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

    const version = params.get('version');
    if (version && ['original', 'dubbed'].includes(version)) {
        const versionBtn = document.getElementById('version-filter');
        versionBtn.dataset.current = version;
        const versionMap = { original: 'versionOriginal', dubbed: 'versionDubbed' };
        versionBtn.querySelector('span').dataset.i18n = versionMap[version];
        versionBtn.querySelector('span').textContent = t(versionMap[version]);
        versionBtn.classList.toggle('active', version === 'original');
    }

    const sort = params.get('sort');
    if (sort && ['rating', 'viewers'].includes(sort)) {
        const sortBtn = document.getElementById('sort-filter');
        sortBtn.dataset.current = sort;
        const sortMap = { rating: 'sortByRating', viewers: 'sortByViewers' };
        sortBtn.querySelector('span').dataset.i18n = sortMap[sort];
        sortBtn.querySelector('span').textContent = t(sortMap[sort]);
    }

    const special = params.get('special');
    if (special === '1') {
        specialFilterActive = true;
        const specialBtn = document.getElementById('special-filter');
        if (specialBtn) specialBtn.classList.add('active');
    }

    // Year filter is initialized in initYearFilter() after films load
}

function updateURLParams() {
    const search = document.getElementById('search').value;
    const date = document.getElementById('date-filter').value;

    // Get current slider values
    const minInput = document.getElementById('year-min');
    const maxInput = document.getElementById('year-max');
    const currentMin = Math.min(parseInt(minInput.value), parseInt(maxInput.value));
    const currentMax = Math.max(parseInt(minInput.value), parseInt(maxInput.value));

    const version = document.getElementById('version-filter').dataset.current;

    const params = new URLSearchParams();

    if (search) params.set('search', search);
    // Store excluded theaters in URL (compact when most are selected)
    const excluded = ALL_THEATER_VALUES.filter(v => !selectedTheaters.has(v));
    if (excluded.length > 0 && excluded.length < ALL_THEATER_VALUES.length) {
        params.set('exclude_theaters', excluded.join(','));
    } else if (excluded.length === ALL_THEATER_VALUES.length) {
        params.set('exclude_theaters', 'all');
    }
    if (date) params.set('date', date);
    if (version && version !== 'original') params.set('version', version);

    const sort = document.getElementById('sort-filter').dataset.current;
    if (sort && sort !== 'rating') params.set('sort', sort);

    // Only add year params if they differ from global bounds
    if (currentMin > minYear) params.set('min_year', currentMin);
    if (currentMax < maxYear) params.set('max_year', currentMax);

    if (specialFilterActive) params.set('special', '1');

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

// ── localStorage helpers for CSV persistence ────────────────────────────────────
function saveWatchlistToStorage(urls) {
    localStorage.setItem('watchlistUrls', JSON.stringify([...urls]));
}

function saveWatchedToStorage(urls) {
    localStorage.setItem('watchedUrls', JSON.stringify([...urls]));
}

function loadWatchlistFromStorage() {
    try {
        const data = localStorage.getItem('watchlistUrls');
        if (data) return new Set(JSON.parse(data));
    } catch (e) { /* ignore */ }
    return null;
}

function loadWatchedFromStorage() {
    try {
        const data = localStorage.getItem('watchedUrls');
        if (data) return new Set(JSON.parse(data));
    } catch (e) { /* ignore */ }
    return null;
}

function loadToggleStates() {
    watchlistFilterActive = localStorage.getItem('watchlistFilterActive') === 'true';
    watchedFilterActive = localStorage.getItem('watchedFilterActive') === 'true';
}

function saveToggleStates() {
    localStorage.setItem('watchlistFilterActive', watchlistFilterActive);
    localStorage.setItem('watchedFilterActive', watchedFilterActive);
}

// ── Restore persisted CSVs on page load ──────────────────────────────────────
function restorePersistedCSVs() {
    loadToggleStates();

    const storedWatchlist = loadWatchlistFromStorage();
    if (storedWatchlist && storedWatchlist.size > 0) {
        watchlistUrls = storedWatchlist;
        applyWatchlistUI();
    }

    const storedWatched = loadWatchedFromStorage();
    if (storedWatched && storedWatched.size > 0) {
        watchedUrls = storedWatched;
        applyWatchedUI();
    }

    syncToggleUI();
}

// ── UI state helpers ─────────────────────────────────────────────────────────

function applyWatchlistUI() {
    const container = document.querySelector('.watchlist-filter');
    container.classList.add('loaded');
    if (watchlistFilterActive) container.classList.add('active');
    document.getElementById('watchlist-count-info').style.display = 'block';
    updateCsvCountLabels();
    updateWatchlistBtnLabel();
    document.getElementById('watchlist-remove-btn').style.display = '';
}

function applyWatchedUI() {
    const container = document.querySelector('.watched-filter');
    container.classList.add('loaded');
    if (watchedFilterActive) container.classList.add('active');
    document.getElementById('watched-count-info').style.display = 'block';
    updateCsvCountLabels();
    updateWatchedBtnLabel();
    document.getElementById('watched-remove-btn').style.display = '';
}

function updateWatchlistBtnLabel() {
    const full = document.getElementById('watchlist-label-full');
    const short = document.getElementById('watchlist-label-short');
    if (watchlistUrls) {
        full.textContent = watchlistFilterActive ? t('watchlistActive') : t('watchlistFull');
        short.textContent = watchlistFilterActive ? t('watchlistActive') : t('watchlistShort');
    } else {
        full.textContent = t('watchlistFull');
        short.textContent = t('watchlistShort');
    }
}

function updateWatchedBtnLabel() {
    const full = document.getElementById('watched-label-full');
    const short = document.getElementById('watched-label-short');
    if (watchedUrls) {
        full.textContent = watchedFilterActive ? t('watchedActive') : t('watchedFull');
        short.textContent = watchedFilterActive ? t('watchedActive') : t('watchedShort');
    } else {
        full.textContent = t('watchedFull');
        short.textContent = t('watchedShort');
    }
}

function syncToggleUI() {
    const watchlistToggle = document.getElementById('watchlist-toggle');
    const watchedToggle = document.getElementById('watched-toggle');

    watchlistToggle.checked = watchlistFilterActive;
    watchedToggle.checked = watchedFilterActive;

    // Show/hide toggles based on loaded data
    document.getElementById('watchlist-toggle-wrap').style.display = watchlistUrls ? '' : 'none';
    document.getElementById('watched-toggle-wrap').style.display = watchedUrls ? '' : 'none';

    // Active state styling
    document.querySelector('.watchlist-filter').classList.toggle('active', watchlistUrls && watchlistFilterActive);
    document.querySelector('.watched-filter').classList.toggle('active', watchedUrls && watchedFilterActive);

    updateWatchlistBtnLabel();
    updateWatchedBtnLabel();
}

// ── Watchlist upload & toggle ────────────────────────────────────────────────

document.getElementById('watchlist-btn').addEventListener('click', () => {
    if (!watchlistUrls) {
        document.getElementById('watchlist-upload').click();
    }
});

document.getElementById('watchlist-toggle').addEventListener('change', (e) => {
    watchlistFilterActive = e.target.checked;
    saveToggleStates();
    syncToggleUI();
    filterFilms();
});

document.getElementById('watchlist-remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearWatchlist();
    filterFilms();
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
                watchlistFilterActive = true;
                saveWatchlistToStorage(urls);
                saveToggleStates();
                applyWatchlistUI();
                syncToggleUI();
                filterFilms();
            }
        },
        error: (error) => {
            console.error('Error parsing watchlist CSV:', error);
        }
    });
    event.target.value = '';
});

// ── Watched upload & toggle ──────────────────────────────────────────────────

document.getElementById('watched-btn').addEventListener('click', () => {
    if (!watchedUrls) {
        document.getElementById('watched-upload').click();
    }
});

document.getElementById('watched-toggle').addEventListener('change', (e) => {
    watchedFilterActive = e.target.checked;
    saveToggleStates();
    syncToggleUI();
    filterFilms();
});

document.getElementById('watched-remove-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearWatched();
    filterFilms();
});

document.getElementById('watched-upload').addEventListener('change', (event) => {
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
                watchedUrls = urls;
                watchedFilterActive = true;
                saveWatchedToStorage(urls);
                saveToggleStates();
                applyWatchedUI();
                syncToggleUI();
                filterFilms();
            }
        },
        error: (error) => {
            console.error('Error parsing watched CSV:', error);
        }
    });
    event.target.value = '';
});

// ── Info tooltip ─────────────────────────────────────────────────────────────

document.getElementById('csv-info-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    e.currentTarget.classList.toggle('show');
});

document.getElementById('csv-tooltip').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.addEventListener('click', () => {
    const trigger = document.getElementById('csv-info-trigger');
    trigger.classList.remove('show');
});

// ── Clear helpers ────────────────────────────────────────────────────────────

function clearWatchlist() {
    watchlistUrls = null;
    watchlistFilterActive = false;
    localStorage.removeItem('watchlistUrls');
    saveToggleStates();
    const container = document.querySelector('.watchlist-filter');
    container.classList.remove('active', 'loaded');
    document.getElementById('watchlist-upload').value = '';
    document.getElementById('watchlist-count-info').style.display = 'none';
    document.getElementById('watchlist-count-info').textContent = '';
    document.getElementById('watchlist-remove-btn').style.display = 'none';
    syncToggleUI();
}

function clearWatched() {
    watchedUrls = null;
    watchedFilterActive = false;
    localStorage.removeItem('watchedUrls');
    saveToggleStates();
    const container = document.querySelector('.watched-filter');
    container.classList.remove('active', 'loaded');
    document.getElementById('watched-upload').value = '';
    document.getElementById('watched-count-info').style.display = 'none';
    document.getElementById('watched-count-info').textContent = '';
    document.getElementById('watched-remove-btn').style.display = 'none';
    syncToggleUI();
}

// Restore on page load
restorePersistedCSVs();
