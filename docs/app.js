let allFilms = [];
let filteredFilms = [];

// CSV files to load (add more months as needed)
const CSV_FILES = [
    'screenings.csv'
];

// Load all CSV files
async function loadFilms() {
    const loading = document.getElementById('loading');
    const filmsGrid = document.getElementById('films-grid');

    try {
        const filmData = [];

        for (const csvFile of CSV_FILES) {
            const response = await fetch(csvFile);
            const csvText = await response.text();

            const parsed = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true
            });

            filmData.push(...parsed.data);
        }

        // Process film data
        allFilms = filmData.map(film => {
            const dates = parseDates(film.dates);

            // Derive theater from dates (unique locations)
            const locations = [...new Set(dates.map(d => d.location).filter(l => l && l !== 'Unknown'))];
            let theaterDisplay = locations.length > 0 ? locations.join(', ') : 'Unknown';
            if (locations.length > 2) theaterDisplay = `${locations.length} locations`; // truncate if too many

            // Derive main link from first date with info url, or fallback
            const mainLink = dates.find(d => d.url_info)?.url_info || '';

            return {
                theater: theaterDisplay, // Derived for display
                title: film.title,
                director: film.director,
                year: film.year ? parseInt(film.year) : null,
                dates: dates,
                theaterLink: mainLink,
                letterboxdUrl: film.letterboxd_url,
                rating: film.letterboxd_rating ? parseFloat(film.letterboxd_rating) : null,
                viewers: film.letterboxd_viewers
            };
        }).filter(film => film.title); // Remove empty entries

        // Initial render
        initYearFilter(); // Initialize slider with data bounds
        applyFiltersFromURL(); // Then apply any URL params
        filterFilms();

        loading.style.display = 'none';
        filmsGrid.style.display = 'grid';

    } catch (error) {
        console.error('Error loading films:', error);
        loading.textContent = 'Error loading films. Please try again later.';
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
            return { timestamp: item, location: 'Unknown', url_tickets: '', url_info: '' };
        } else if (typeof item === 'object' && item !== null) {
            // New format: object with timestamp/location/urls
            return {
                timestamp: item.timestamp,
                location: item.location || 'Unknown',
                // Map new keys to internal structure if needed, or keep them
                url_tickets: item.url_tickets || item.url || '', // Support both old 'url' and new 'url_tickets'
                url_info: item.url_info || ''
            };
        }
        return null;
    }).filter(x => x);
}



function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
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

function filterFilms() {
    const searchTerm = normalizeText(document.getElementById('search').value);
    const selectedTheater = document.getElementById('theater-filter').value;
    const selectedDate = document.getElementById('date-filter').value;

    filteredFilms = allFilms.filter(film => {
        // Search filter (accent-insensitive)
        const matchesSearch = !searchTerm ||
            normalizeText(film.title).includes(searchTerm) ||
            (film.director && normalizeText(film.director).includes(searchTerm));

        // Theater filter - special handling for Cines Renoir to match all Renoir locations
        let matchesTheater = true;
        if (selectedTheater) {
            if (selectedTheater === 'Cines Renoir') {
                // Match Renoir films OR any Renoir location
                matchesTheater = film.theater === 'Cines Renoir' ||
                    film.dates.some(d => isRenoirLocation(d.location));
            } else {
                matchesTheater = film.theater === selectedTheater ||
                    film.dates.some(d => d.location === selectedTheater);
            }
        }

        // Date filter (single day)
        let matchesDate = true;
        if (selectedDate) {
            matchesDate = film.dates.some(d => d.timestamp.startsWith(selectedDate));
        }

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

        return matchesSearch && matchesTheater && matchesDate && matchesYear;
    });

    renderFilms();
}

function renderFilms() {
    const filmsGrid = document.getElementById('films-grid');
    const noResults = document.getElementById('no-results');
    const filmCount = document.getElementById('film-count');

    filmCount.textContent = `${filteredFilms.length} film${filteredFilms.length !== 1 ? 's' : ''}`;

    if (filteredFilms.length === 0) {
        filmsGrid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Sort by rating (highest first), then by title
    const sorted = [...filteredFilms].sort((a, b) => {
        if (a.rating !== null && b.rating !== null) {
            return b.rating - a.rating;
        }
        if (a.rating !== null) return -1;
        if (b.rating !== null) return 1;
        return a.title.localeCompare(b.title);
    });

    filmsGrid.innerHTML = sorted.map(film => createFilmCard(film)).join('');
}

function createFilmCard(film) {
    const ratingHTML = film.rating
        ? `<div class="rating">⭐ ${film.rating.toFixed(1)}</div>`
        : '';

    // Build compact title: "Title (Director, Year)"
    let titleText = escapeHtml(film.title);
    const metadata = [];
    if (film.director) metadata.push(escapeHtml(film.director));
    if (film.year) metadata.push(film.year);
    if (metadata.length > 0) {
        titleText += ` <span class="title-meta">(${metadata.join(', ')})</span>`;
    }

    const datesHTML = film.dates.length > 0
        ? `<div class="film-dates">
             ${createSessionsDisplay(film)}
           </div>`
        : '';

    // Letterboxd icon link
    // Place your icon at: docs/assets/letterboxd.svg (or change extension below)
    const letterboxdHTML = film.letterboxdUrl
        ? `<a href="${escapeHtml(film.letterboxdUrl)}" class="letterboxd-link" target="_blank" onclick="event.stopPropagation()" title="View on Letterboxd">
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
                    ${letterboxdHTML}
                </div>
            </div>
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
    const titleLabel = `${film.title}${film.year ? ` (${film.year})` : ''}`;

    // Check if session has a direct ticket URL
    const hasDirectUrl = dateObj.url_tickets && dateObj.url_tickets.trim() !== '';
    const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
    const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);

    let locationBadge = '';
    let locationText = '';
    if (dateObj.location && dateObj.location !== 'Unknown') {
        // For inline rows, prefix "Renoir " to Renoir location names
        const displayLocation = isRenoirLocation(dateObj.location)
            ? `Renoir ${dateObj.location}`
            : dateObj.location;
        locationBadge = `<span class="location-badge">${escapeHtml(displayLocation)}</span>`;
        locationText = displayLocation;
    }

    // Create full date/time label for modal header
    const timeLabel = `${formatted}${locationText ? ' - ' + locationText : ''}`;

    return `
        <button class="date-row" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}')">
            <span class="date-badge">${formatted}</span>
            ${locationBadge}
        </button>
    `;
}

// Get fallback URL for a theater when film doesn't have a theater link
function getTheaterFallbackUrl(film, dateObj) {
    const location = dateObj.location || '';
    if (isRenoirLocation(location)) {
        return 'https://www.cinesrenoir.com/';
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
                Buy Tickets
            </a>
            <a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                View Film Page
            </a>
            <a href="${calendarUrl}" class="session-modal-action" target="_blank">
                Add to Calendar
            </a>
        `;
    } else {
        actionsHtml = `
            <a href="${filmPageUrl}" class="session-modal-action" target="_blank">
                Buy Tickets
            </a>
            <a href="${calendarUrl}" class="session-modal-action" target="_blank">
                Add to Calendar
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

    const formatShort = (d) => d.toLocaleDateString('en-GB', {
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

    if (locations.length === 1) {
        // Single non-Renoir location
        return locations[0];
    }

    // Multiple different theaters
    return `${locations.length} theaters`;
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
        const dayLabel = dayDate.toLocaleDateString('en-GB', {
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
            const time = new Date(dateObj.timestamp).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const calendarUrl = generateCalendarUrl(film, dateObj);

            // Check if session has a direct ticket URL
            const hasDirectUrl = dateObj.url_tickets && dateObj.url_tickets.trim() !== '';
            const ticketUrl = hasDirectUrl ? dateObj.url_tickets : '';
            const filmPageUrl = dateObj.url_info || film.theaterLink || getTheaterFallbackUrl(film, dateObj);
            const titleLabel = film.year ? `${film.title} (${film.year})` : film.title;

            const location = dateObj.location && dateObj.location !== 'Unknown'
                ? `<span class="location">${escapeHtml(dateObj.location)}</span>`
                : '';

            // Create date/time label for modal header
            const dateLabel = new Date(dateObj.timestamp).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const timeLabel = `${dateLabel} ${time}${dateObj.location ? ' - ' + dateObj.location : ''}`;

            return `
                <button class="session-time" onclick="openSessionModal(event, '${escapeHtml(titleLabel)}', '${escapeHtml(timeLabel)}', '${escapeHtml(ticketUrl)}', '${escapeHtml(filmPageUrl)}', '${escapeHtml(calendarUrl)}', '${hasDirectUrl}')">
                    <span class="time">${time}</span>
                    ${location}
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

    return date.toLocaleDateString('en-GB', {
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

function updateDatePlaceholder() {
    if (dateFilter.value) {
        dateFilter.classList.add('has-value');
    } else {
        dateFilter.classList.remove('has-value');
    }
}

dateFilter.addEventListener('change', () => {
    filterFilms();
    updateDatePlaceholder();
    // updateURLParams handled by debounce
});

let minYear = 1900;
let maxYear = new Date().getFullYear();

function initYearFilter() {
    // Calculate global min/max years
    const validYears = allFilms
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
        document.getElementById('date-filter').value = date;
        updateDatePlaceholder();
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

        const title = encodeURIComponent(`${film.title} (${film.year || ''})`);

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

// Load films on page load
loadFilms();
