/**
 * Skeleton placeholders for the poster grid layout. Geometry mirrors the real
 * .grid-tile (2:3 aspect poster) so the swap to real content produces no
 * layout shift.
 *
 * Used by:
 *   - loading.tsx (server-rendered, shown while page.tsx runs)
 *   - FilmCalendar (rendered while /api/screenings is still loading)
 */

const PULSE: React.CSSProperties = {
  background: 'var(--bg-hover)',
  borderRadius: 6,
  animation: 'fc-skeleton-pulse 1.4s ease-in-out infinite',
};

function Block({ style, delay }: { style?: React.CSSProperties; delay?: number }) {
  return (
    <div
      aria-hidden
      style={{ ...PULSE, ...style, animationDelay: delay ? `${delay}ms` : undefined }}
    />
  );
}

export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  const anim = delay ? `${delay}ms` : undefined;
  // Muted cream tones for skeleton lines over the dark gradient — matches the
  // real tile's #f0ece1 info text, at low opacity so they read as placeholders.
  const line = (style?: React.CSSProperties): React.CSSProperties => ({
    borderRadius: 3,
    background: 'rgba(240,236,225,0.22)',
    ...style,
  });
  return (
    <div
      aria-hidden
      style={{ aspectRatio: '2 / 3', position: 'relative', borderRadius: 6, overflow: 'hidden', animationDelay: anim, ...PULSE }}
    >
      {/* Dark gradient + text-line placeholders — mirrors .grid-tile-gradient + .grid-tile-info */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40,
        background: 'linear-gradient(to bottom, transparent 0%, rgba(10,8,5,0.55) 40%, rgba(10,8,5,0.88) 100%)',
      }}>
        <div style={{ padding: '0 10px 10px' }}>
          {/* Title */}
          <div style={line({ height: '0.9rem', marginBottom: 5 })} />
          {/* Meta — year · director · runtime */}
          <div style={line({ height: '0.6rem', width: '55%', marginBottom: 10, opacity: 0.7 })} />
          {/* Footer — date/time chip on the right */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={line({ height: '0.6rem', width: 52, opacity: 0.7 })} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Matches the real .filter-bar layout so there's no layout shift when real
 * filters take over. Renders 6 blocks mirroring the real children in DOM
 * order (search, day-strip, calendar, theater, más-filtros, clear); the
 * filter-bar CSS handles single-row (≥1200) / two-row (769–1199) / mobile
 * grid layouts identically to the real bar, so block heights + widths match.
 * The active-chips row below reserves its own 28px via .active-chips-placeholder.
 */
export function SkeletonFilters() {
  // `flex` is consumed by the desktop flex bar; on mobile/mid-desktop the bar
  // switches to CSS grid and the flex values are ignored, so pills stretch to
  // fill their grid cells. Omitting inline width is what makes that work.
  const pill = (flex: string, h = 56): React.CSSProperties => ({
    ...PULSE, height: h, borderRadius: 8, flex, minWidth: 0,
  });
  return (
    <>
      <div className="filter-bar is-skeleton" aria-hidden>
        {/* order + widths mirror the real FiltersGrid JSX */}
        <div className="filter-bar-search" style={pill('0 1 300px')} />
        <div className="day-bar" style={{ display: 'contents' }}>
          <div className="day-strip" style={pill('0 1 520px', 56)} />
        </div>
        <div className="theater-multiselect" style={pill('1 1 180px')} />
        <div className="more-filters-btn" style={pill('0 0 56px', 56)} />
        <div className="clear-grid-btn" style={pill('0 0 56px', 56)} />
      </div>
      {/* Reserves the 28px vertical space of the active-chips row so the
          "Hoy · N películas" heading below doesn't jump when real chips arrive. */}
      <div className="active-chips-placeholder" aria-hidden />
    </>
  );
}

export function SkeletonCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div aria-hidden className="films-grid is-grid" style={{ display: 'grid' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} delay={i * 70} />
      ))}
    </div>
  );
}

export { PULSE as SKELETON_PULSE_STYLE };
