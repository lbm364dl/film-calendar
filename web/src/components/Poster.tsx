'use client';

/**
 * Abstract two-tone poster — mirrors the Direction C design language.
 * No real artwork (avoids copyright): deterministic palette per film id so the
 * same film always gets the same face. Replace with a TMDB <img> later by
 * populating film.posterUrl and swapping the internals.
 */

const PALETTES: Array<{ a: string; b: string; mark: string }> = [
  { a: '#f5d35a', b: '#c23a30', mark: '☂' },
  { a: '#d9c49a', b: '#3a4a3c', mark: '✦' },
  { a: '#eae7dc', b: '#2e4f66', mark: '◐' },
  { a: '#1f3024', b: '#e7e3d3', mark: '▭' },
  { a: '#4a3a2c', b: '#b6a072', mark: '⎊' },
  { a: '#e8e2d2', b: '#7d1e1e', mark: '↯' },
  { a: '#b23a2e', b: '#f3ead8', mark: '◉' },
  { a: '#c47a2a', b: '#264a3d', mark: '〰' },
  { a: '#e73a4c', b: '#f3e9d2', mark: '◇' },
  { a: '#f3c672', b: '#2d6a8e', mark: '☀' },
  { a: '#2a2a2a', b: '#d4c08a', mark: '✚' },
  { a: '#ffd0d0', b: '#b21e2e', mark: '✺' },
  { a: '#6a8caf', b: '#efe8d5', mark: '⌘' },
  { a: '#caa24a', b: '#1e1a14', mark: '✧' },
  { a: '#7a5d82', b: '#f0e9d8', mark: '◈' },
  { a: '#4a7f5c', b: '#f0eadd', mark: '⦿' },
];

export function paletteFor(id: number | string, title: string) {
  const hash = (String(id) + title).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

export interface PosterProps {
  filmId: number | string;
  title: string;
  year?: number | null;
  director?: string | null;
  width?: number;
  height?: number;
  radius?: number;
}

export default function Poster({
  filmId, title, year, director,
  width = 74, height = 111, radius = 3,
}: PosterProps) {
  const { a, b, mark } = paletteFor(filmId, title);
  return (
    <div
      className="mfc-poster"
      aria-hidden
      style={{
        width, height, position: 'relative', overflow: 'hidden',
        background: a, color: b, flexShrink: 0, borderRadius: radius,
      }}
    >
      {/* Mark */}
      <div
        style={{
          position: 'absolute', inset: 0, bottom: '38%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: width * 0.55, lineHeight: 1, color: b, fontWeight: 400,
        }}
      >{mark}</div>
      {/* Bottom band */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%',
          background: b, color: a, padding: `${width * 0.05}px ${width * 0.06}px`,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontSize: width * 0.085, fontWeight: 700, lineHeight: 1.05,
            fontFamily: 'Georgia, serif', letterSpacing: -0.2,
            textTransform: 'uppercase',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >{title}</div>
        {(year || director) && (
          <div
            style={{
              fontSize: width * 0.06, opacity: 0.8,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
            }}
          >
            {year ? year : ''}{year && director ? ' · ' : ''}{director ? director.split(',')[0] : ''}
          </div>
        )}
      </div>
    </div>
  );
}
