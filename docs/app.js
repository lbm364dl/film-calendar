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
            year: film.year,
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

function parseDates(dateStr) {
    try {
        // Remove brackets and quotes, split by comma
        const cleaned = dateStr.replace(/[\[\]']/g, '').trim();
        return cleaned.split(',').map(d => d.trim()).filter(d => d);
    } catch {
        return [];
    }
}

function populateMonthFilter() {
    const monthFilter = document.getElementById('month-filter');
    const months = new Set();

    allFilms.forEach(film => {
        film.dates.forEach(date => {
            const month = date.substring(0, 7); // YYYY-MM
            months.add(month);
        });
    });

    Array.from(months).sort().forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = formatMonth(month);
        monthFilter.appendChild(option);
    });
}

function formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
}

function filterFilms() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const selectedMonth = document.getElementById('month-filter').value;
    const selectedTheater = document.getElementById('theater-filter').value;
    const ratedOnly = document.getElementById('rated-only').checked;

    filteredFilms = allFilms.filter(film => {
        // Search filter
        const matchesSearch = !searchTerm ||
            film.title.toLowerCase().includes(searchTerm) ||
            (film.director && film.director.toLowerCase().includes(searchTerm)) ||
            film.theater.toLowerCase().includes(searchTerm);

        // Month filter
        const matchesMonth = !selectedMonth ||
            film.dates.some(date => date.startsWith(selectedMonth));

        // Theater filter
        const matchesTheater = !selectedTheater || film.theater === selectedTheater;

        // Rated only filter
        const matchesRated = !ratedOnly || film.rating !== null;

        return matchesSearch && matchesMonth && matchesTheater && matchesRated;
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

    const directorHTML = film.director
        ? `<div class="film-director"><strong>Director:</strong> ${escapeHtml(film.director)}</div>`
        : '';

    const yearHTML = film.year
        ? `<div class="film-year"><strong>Year:</strong> ${escapeHtml(film.year)}</div>`
        : '';

    const datesHTML = film.dates.length > 0
        ? `<div class="film-dates">
             ${film.dates.map(date => `<span class="date-badge">${formatDate(date)}</span>`).join('')}
           </div>`
        : '';

    const links = [];
    if (film.theaterLink) {
        links.push(`<a href="${escapeHtml(film.theaterLink)}" class="film-link" target="_blank">Theater ↗</a>`);
    }
    if (film.letterboxdUrl) {
        links.push(`<a href="${escapeHtml(film.letterboxdUrl)}" class="film-link" target="_blank">Letterboxd ↗</a>`);
    }
    const linksHTML = links.length > 0 ? `<div class="film-links">${links.join('')}</div>` : '';

    return `
        <div class="film-card">
            <div class="film-header">
                <div>
                    <div class="film-title">${escapeHtml(film.title)}</div>
                    ${directorHTML}
                </div>
                ${ratingHTML}
            </div>
            <div class="film-meta">
                ${yearHTML}
                <div class="film-theater"><strong>Theater:</strong> ${escapeHtml(film.theater)}</div>
            </div>
            ${datesHTML}
            ${linksHTML}
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

// Load films on page load
loadFilms();
