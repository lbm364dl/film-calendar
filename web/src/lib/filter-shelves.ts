import type { Film } from '@/lib/types';

export interface ShelfCtx {
  todayStr: string;
  weekendStrs: Set<string>;
  lastDaysCutoff: string;
}

export interface FilterShelfDef {
  id: string;
  label: { es: string; en: string };
  filter: (film: Film, ctx: ShelfCtx) => boolean;
  sort: (a: Film, b: Film, ctx: ShelfCtx) => number;
  minFilms: number;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildShelfCtx(now: Date): ShelfCtx {
  const todayStr = toDateStr(now);

  const weekendStrs = new Set<string>();
  for (let i = 0; i <= 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) weekendStrs.add(toDateStr(d));
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 3);
  const lastDaysCutoff = toDateStr(cutoff);

  return { todayStr, weekendStrs, lastDaysCutoff };
}

function lastFutureDate(film: Film, ctx: ShelfCtx): string | null {
  let last: string | null = null;
  for (const d of film.dates) {
    const dateStr = d.timestamp.slice(0, 10);
    if (dateStr >= ctx.todayStr) {
      if (last === null || dateStr > last) last = dateStr;
    }
  }
  return last;
}

function firstSessionMatching(film: Film, predicate: (d: Film['dates'][number]) => boolean): string | null {
  let earliest: string | null = null;
  for (const d of film.dates) {
    if (predicate(d)) {
      if (earliest === null || d.timestamp < earliest) earliest = d.timestamp;
    }
  }
  return earliest;
}

function sortByFirstSession(
  predicate: (d: Film['dates'][number], ctx: ShelfCtx) => boolean,
): (a: Film, b: Film, ctx: ShelfCtx) => number {
  return (a, b, ctx) => {
    const ta = firstSessionMatching(a, d => predicate(d, ctx)) ?? '';
    const tb = firstSessionMatching(b, d => predicate(d, ctx)) ?? '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  };
}

function sortByRatingDesc(a: Film, b: Film): number {
  return (b.rating ?? 0) - (a.rating ?? 0);
}

function sortByViewersDesc(a: Film, b: Film): number {
  return (b.viewers ?? 0) - (a.viewers ?? 0);
}

export const FILTER_SHELVES: FilterShelfDef[] = [
  {
    id: 'today',
    label: { es: 'Hoy', en: 'Today' },
    filter: (film, ctx) => film.dates.some(d => d.timestamp.slice(0, 10) === ctx.todayStr),
    sort: sortByFirstSession((d, ctx) => d.timestamp.slice(0, 10) === ctx.todayStr),
    minFilms: 1,
  },
  {
    id: 'weekend',
    label: { es: 'Este fin de semana', en: 'This weekend' },
    filter: (film, ctx) => film.dates.some(d => ctx.weekendStrs.has(d.timestamp.slice(0, 10))),
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'last-days',
    label: { es: 'Últimos días', en: 'Last days' },
    filter: (film, ctx) => {
      const last = lastFutureDate(film, ctx);
      return last !== null && last <= ctx.lastDaysCutoff;
    },
    sort: (a, b, ctx) => {
      const la = lastFutureDate(a, ctx) ?? '';
      const lb = lastFutureDate(b, ctx) ?? '';
      return la < lb ? -1 : la > lb ? 1 : 0;
    },
    minFilms: 2,
  },
  {
    id: 'concert',
    label: { es: 'Conciertos y música en vivo', en: 'Concerts & live music' },
    filter: (film) => film.dates.some(d => d.special === 'concert' || d.special === 'live_music'),
    sort: sortByFirstSession(d => d.special === 'concert' || d.special === 'live_music'),
    minFilms: 1,
  },
  {
    id: 'opera',
    label: { es: 'Ópera', en: 'Opera' },
    filter: (film) => film.dates.some(d => d.special === 'opera'),
    sort: sortByFirstSession(d => d.special === 'opera'),
    minFilms: 1,
  },
  {
    id: 'coloquio',
    label: { es: 'Pases con coloquio', en: 'Screenings with Q&A' },
    filter: (film) => film.dates.some(d => d.special === 'conference' || d.special === 'event'),
    sort: sortByFirstSession(d => d.special === 'conference' || d.special === 'event'),
    minFilms: 1,
  },
  {
    id: 'top-rated',
    label: { es: 'Las mejor valoradas', en: 'Top rated' },
    filter: (film) => film.rating != null,
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 3,
  },
  {
    id: 'most-watched',
    label: { es: 'Las más vistas', en: 'Most watched' },
    filter: (film) => film.viewers != null,
    sort: (a, b) => sortByViewersDesc(a, b),
    minFilms: 3,
  },
  {
    id: 'spanish',
    label: { es: 'Cine español', en: 'Spanish cinema' },
    filter: (film) => film.country.includes('Spain'),
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'animation',
    label: { es: 'Animación', en: 'Animation' },
    filter: (film) => film.genres.includes('Animation'),
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'action',
    label: { es: 'Acción', en: 'Action' },
    filter: (film) => film.genres.includes('Action'),
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'classics',
    label: { es: 'Clásicos (hasta los 50)', en: 'Classics (up to the 50s)' },
    filter: (film) => film.year != null && film.year <= 1959,
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'sixties-seventies',
    label: { es: 'Años 60 y 70', en: '60s & 70s' },
    filter: (film) => film.year != null && film.year >= 1960 && film.year <= 1979,
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
  {
    id: 'eighties-nineties',
    label: { es: 'Años 80 y 90', en: '80s & 90s' },
    filter: (film) => film.year != null && film.year >= 1980 && film.year <= 1999,
    sort: (a, b) => sortByRatingDesc(a, b),
    minFilms: 2,
  },
];
