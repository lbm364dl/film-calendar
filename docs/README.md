# Madrid Film Calendar Website

A minimalist website to browse and search films showing at Cineteca Madrid and Cine Doré.

## Features
- 🔍 Real-time search by title, director, or theater
- 📅 Filter by month and theater
- ⭐ Sort by Letterboxd ratings
- 🎨 Clean, modern dark theme
- 📱 Fully responsive design

## GitHub Pages Setup

1. Push this repository to GitHub
2. Go to Settings → Pages
3. Set source to "Deploy from a branch"
4. Select branch: `main` (or `master`)
5. Select folder: `/docs`
6. Click Save

Your site will be live at: `https://your-username.github.io/film-calendar/`

## Local Development

To test locally, run a simple HTTP server:

```bash
# Python 3
cd docs
python3 -m http.server 8000

# Then visit http://localhost:8000
```

## Adding More Months

1. Place your CSV file in `docs/calendar/` (e.g., `2026-03.csv`)
2. Edit `docs/app.js` and add the file to `CSV_FILES` array:

```javascript
const CSV_FILES = [
    'calendar/2026-02.csv',
    'calendar/2026-03.csv'
];
```

## CSV Format

The site expects CSVs with these columns:
- `theater` - Theater name
- `title` - Film title
- `director` - Director name
- `year` - Release year
- `dates` - Screening dates (array format)
- `theater_film_link` - Link to theater's film page
- `letterboxd_url` - Letterboxd URL
- `letterboxd_rating` - Rating (0-5)
- `letterboxd_viewers` - Number of viewers
