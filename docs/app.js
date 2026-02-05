let allFilms = [];
let filteredFilms = [];

// CSV files to load (add more months as needed)
const CSV_FILES = [
    'calendar/2026-02.csv'
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
        allFilms = filmData.map(film => ({
            theater: film.theater,
            title: film.title,
            director: film.director,
            year: film.year ? parseInt(film.year) : null,
            dates: parseDates(film.dates),
            theaterLink: film.theater_film_link,
            letterboxdUrl: film.letterboxd_url,
            rating: parseFloat(film.letterboxd_rating) || null,
            viewers: film.letterboxd_viewers
        })).filter(film => film.title); // Remove empty entries

        // Initial render
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
// 2. New format: "[{'timestamp': '2025-02-01 10:00', 'location': 'Princesa'}]" (Python list of dicts string)
function parseDates(dateStr, defaultLocation) {
    if (!dateStr) return [];

    try {
        // Attempt to parse as JSON first (if strictly valid JSON)
        try {
            const parsed = JSON.parse(dateStr);
            return normalizeParsedDates(parsed, defaultLocation);
        } catch (e) {
            // Not valid JSON (likely Python string with single quotes)
            // Naive approach: replace single quotes with double quotes
            // This works if the content (location names) doesn't contain single quotes/apostrophes.
            // If it does, we might need a more robust parser or just rely on the fallback.
            let jsonString = dateStr.replace(/'/g, '"');

            // Handle specific Pythonisms if needed (None -> null, False -> false, etc - unlikely for dates)
            const parsed = JSON.parse(jsonString);
            return normalizeParsedDates(parsed, defaultLocation);
        }
    } catch (e) {
        console.warn("Failed to parse dates:", dateStr, e);
        // Fallback: try to just extract timestamps using regex if parsing fails completely
        // Matches "YYYY-MM-DD HH:MM"
        const matches = dateStr.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g);
        if (matches) {
            return matches.map(ts => ({ timestamp: ts, location: defaultLocation }));
        }
        return [];
    }
}

function normalizeParsedDates(parsed, defaultLocation) {
    if (!Array.isArray(parsed)) return [];

    return parsed.map(item => {
        if (typeof item === 'string') {
            // Old format: plain string timestamp
            return { timestamp: item, location: defaultLocation };
        } else if (typeof item === 'object' && item !== null) {
            // New format: object with timestamp/location
            return {
                timestamp: item.timestamp,
                location: item.location || defaultLocation
            };
        }
        return null;
    }).filter(x => x);
}



function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
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
    const ratedOnly = document.getElementById('rated-only').checked;
    const selectedDate = document.getElementById('date-filter').value;

    filteredFilms = allFilms.filter(film => {
        // Search filter (accent-insensitive)
        const matchesSearch = !searchTerm ||
            normalizeText(film.title).includes(searchTerm) ||
            (film.director && normalizeText(film.director).includes(searchTerm)) ||
            normalizeText(film.theater).includes(searchTerm);

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

        // Rated only filter
        const matchesRated = !ratedOnly || film.rating !== null;

        // Date filter (single day)
        let matchesDate = true;
        if (selectedDate) {
            matchesDate = film.dates.some(d => d.timestamp.startsWith(selectedDate));
        }

        return matchesSearch && matchesTheater && matchesRated && matchesDate;
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

    // Make card clickable to theater link
    const cardClickable = film.theaterLink ? `onclick="window.open('${escapeHtml(film.theaterLink)}', '_blank')"` : '';

    return `
        <div class="film-card" ${cardClickable} style="${film.theaterLink ? 'cursor: pointer;' : ''}">
            <div class="film-header">
                <div class="film-title-row">
                    <div class="film-title">${titleText}</div>
                </div>
                <div class="card-actions">
                    ${ratingHTML}
                    ${letterboxdHTML}
                </div>
            </div>
            <div class="film-theater">${escapeHtml(film.theater)}</div>
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
        <div id="${popupId}" class="sessions-popup">
            ${createGroupedSessions(film)}
        </div>
    `;
}

function createSessionRow(film, dateObj) {
    const formatted = formatDate(dateObj.timestamp);
    const calendarUrl = generateCalendarUrl(film, dateObj);
    const ticketUrl = getTicketUrl(film, dateObj);
    const actionId = `action-${Math.random().toString(36).substr(2, 9)}`;

    let locationBadge = '';
    if (dateObj.location && dateObj.location !== 'Unknown') {
        // For inline rows, prefix "Renoir " to Renoir location names
        const displayLocation = isRenoirLocation(dateObj.location)
            ? `Renoir ${dateObj.location}`
            : dateObj.location;
        locationBadge = `<span class="location-badge">${escapeHtml(displayLocation)}</span>`;
    }

    return `
        <div class="session-wrapper">
            <button class="date-row" onclick="toggleSessionAction(event, '${actionId}')">
                <span class="date-badge">${formatted}</span>
                ${locationBadge}
            </button>
            <div id="${actionId}" class="session-actions">
                <a href="${ticketUrl}" class="session-action" target="_blank" onclick="event.stopPropagation()">
                    🎟️ Buy Tickets
                </a>
                <a href="${calendarUrl}" class="session-action" target="_blank" onclick="event.stopPropagation()">
                    📅 Add to Calendar
                </a>
            </div>
        </div>
    `;
}

// Placeholder function to get ticket URL - user will customize this later
function getTicketUrl(film, dateObj) {
    // Use the film's theater link as base, can be customized per cinema
    if (film.theaterLink) {
        return film.theaterLink;
    }
    // Fallback placeholder URLs by theater
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

// Close session action menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.session-wrapper')) {
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

    const formatShort = (d) => d.toLocaleDateString('es-ES', {
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
    return `${locations.length} cines`;
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
        const dayLabel = dayDate.toLocaleDateString('es-ES', {
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
            const time = new Date(dateObj.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const calendarUrl = generateCalendarUrl(film, dateObj);
            const ticketUrl = getTicketUrl(film, dateObj);
            const actionId = `popup-action-${Math.random().toString(36).substr(2, 9)}`;
            const location = dateObj.location && dateObj.location !== 'Unknown'
                ? `<span class="location">${escapeHtml(dateObj.location)}</span>`
                : '';

            return `
                <div class="session-time-wrapper">
                    <button class="session-time" onclick="toggleSessionAction(event, '${actionId}')">
                        <span class="time">${time}</span>
                        ${location}
                    </button>
                    <div id="${actionId}" class="session-actions session-actions-popup">
                        <a href="${ticketUrl}" class="session-action" target="_blank" onclick="event.stopPropagation()">
                            🎟️ Buy Tickets
                        </a>
                        <a href="${calendarUrl}" class="session-action" target="_blank" onclick="event.stopPropagation()">
                            📅 Add to Calendar
                        </a>
                    </div>
                </div>
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
            p.classList.remove('show');
            p.previousElementSibling?.classList.remove('active');
        }
    });

    // Toggle this popup
    popup.classList.toggle('show');
    button.classList.toggle('active');

    // Reset scroll position when opening
    if (popup.classList.contains('show')) {
        popup.scrollTop = 0;
    }
}

// Close popups when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.sessions-popup') && !e.target.closest('.sessions-toggle')) {
        document.querySelectorAll('.sessions-popup.show').forEach(p => {
            p.classList.remove('show');
            p.previousElementSibling?.classList.remove('active');
        });
    }
});

function formatDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    return date.toLocaleDateString('es-ES', {
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
document.getElementById('search').addEventListener('input', filterFilms);
document.getElementById('theater-filter').addEventListener('change', filterFilms);
document.getElementById('rated-only').addEventListener('change', filterFilms);
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
});

// Make entire input clickable to open picker (better UX)
dateFilter.addEventListener('click', function () {
    try {
        this.showPicker();
    } catch (e) {
        // Fallback for browsers that don't support showPicker
    }
});

function generateCalendarUrl(film, dateObj) {
    try {
        const dateStr = dateObj.timestamp;
        // Date format is usually "YYYY-MM-DD HH:MM"
        const [datePart, timePart] = dateStr.split(' ');
        if (!datePart || !timePart) return '#';

        const start = new Date(dateStr.replace(' ', 'T'));
        const end = new Date(start.getTime() + (2 * 60 * 60 * 1000)); // Assume 2 hours duration

        const formatGCal = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');

        const title = encodeURIComponent(`${film.title} (${film.year || ''})`);
        const details = encodeURIComponent(`Director: ${film.director}\nLink: ${film.theaterLink || ''}`);
        const location = encodeURIComponent(dateObj.location || film.theater);
        const dates = `${formatGCal(start)}/${formatGCal(end)}`;

        return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${dates}`;
    } catch (e) {
        console.error('Error generating calendar URL', e);
        return '#';
    }
}

// Load films on page load
loadFilms();
