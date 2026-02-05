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

        // Populate month filter
        populateMonthFilter();

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

function populateMonthFilter() {
    const monthFilter = document.getElementById('month-filter');
    const months = new Set();

    allFilms.forEach(film => {
        film.dates.forEach(dateObj => {
            const month = dateObj.timestamp.substring(0, 7); // YYYY-MM
            months.add(month);
        });
    });

    // Clear existing except first "All months" option if any (HTML structure assumed)
    // Actually typically we append. Let's just clear and rebuild or check duplicates?
    // The original code appended. We should probably clear if calling multiple times, but loadFilms calls it once.

    Array.from(months).sort().forEach(month => {
        // Check if option exists
        if (!monthFilter.querySelector(`option[value="${month}"]`)) {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = formatMonth(month);
            monthFilter.appendChild(option);
        }
    });
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

function filterFilms() {
    const searchTerm = normalizeText(document.getElementById('search').value);
    const selectedMonth = document.getElementById('month-filter').value;
    const selectedTheater = document.getElementById('theater-filter').value;
    const ratedOnly = document.getElementById('rated-only').checked;
    const selectedDate = document.getElementById('date-filter').value;

    filteredFilms = allFilms.filter(film => {
        // Search filter (accent-insensitive)
        const matchesSearch = !searchTerm ||
            normalizeText(film.title).includes(searchTerm) ||
            (film.director && normalizeText(film.director).includes(searchTerm)) ||
            normalizeText(film.theater).includes(searchTerm);

        // Month filter
        const matchesMonth = !selectedMonth ||
            film.dates.some(d => d.timestamp.startsWith(selectedMonth));

        // Theater filter (General film theater OR specific screening location?)
        // Usually we filter by the film's "main" theater, but now screens can be elsewhere?
        // Let's match if the film is listed under that theater OR has a screening there.
        // For simplicity, keep using film.theater (source) + screening location check?
        // User likely wants to find films showing at X.
        const matchesTheater = !selectedTheater ||
            film.theater === selectedTheater ||
            film.dates.some(d => d.location === selectedTheater);

        // Rated only filter
        const matchesRated = !ratedOnly || film.rating !== null;

        // Date filter (single day)
        // Show film if it has ANY screening on the selected date
        let matchesDate = true;
        if (selectedDate) {
            matchesDate = film.dates.some(d => d.timestamp.startsWith(selectedDate));
        }

        return matchesSearch && matchesMonth && matchesTheater && matchesRated && matchesDate;
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
             ${film.dates.map(dateObj => {
            const formatted = formatDate(dateObj.timestamp);
            const calendarUrl = generateCalendarUrl(film, dateObj);

            // Highlight location if different from main theater (or always show?)
            // If location is "Unknown" or same as theater, maybe hide to save space?
            // User requested "display specific location per screening".
            // Renoir films have "Cines Renoir" as main theater, but "Princesa" etc as location.
            // So we should show it.
            let locationBadge = '';
            if (dateObj.location && dateObj.location !== 'Unknown') {
                locationBadge = `<span class="location-badge">${escapeHtml(dateObj.location)}</span>`;
            }

            return `
                    <div class="date-row">
                        <a href="${calendarUrl}" class="calendar-btn" target="_blank" title="Add to Google Calendar" onclick="event.stopPropagation()">
                            <img src="assets/calendar.svg" class="calendar-icon" alt="Cal" onerror="this.outerHTML='📅'">
                        </a>
                        <span class="date-badge">${formatted}</span>
                        ${locationBadge}
                    </div>
                 `;
        }).join('')}
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
document.getElementById('month-filter').addEventListener('change', filterFilms);
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
