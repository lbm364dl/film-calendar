/**
 * Skeleton placeholders for the Direction C layout. Same grid geometry as the
 * real FilmCard and FiltersGrid so the swap to real content produces no layout
 * shift.
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
  return (
    <div
      className="film-card"
      aria-hidden
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Poster slot — matches <Poster w=74 h=111> */}
      <Block style={{ width: 74, height: 111, borderRadius: 3 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* Title + year + match pill row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Block style={{ height: 22, width: '60%', borderRadius: 4 }} />
          <Block style={{ height: 12, width: 36, borderRadius: 3 }} />
          <Block style={{ height: 16, width: 44, borderRadius: 999 }} />
        </div>
        {/* Meta line */}
        <Block style={{ height: 13, width: '85%', borderRadius: 3 }} />
        {/* Italic rec line */}
        <Block style={{ height: 13, width: '70%', borderRadius: 3, marginTop: 2 }} />
        {/* Time chips row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <Block style={{ height: 22, width: 90, borderRadius: 4 }} />
          <Block style={{ height: 22, width: 80, borderRadius: 4 }} />
          <Block style={{ height: 22, width: 100, borderRadius: 4 }} />
          <Block style={{ height: 22, width: 60, borderRadius: 4 }} />
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
  const pill = (w: number | string, h = 56): React.CSSProperties => ({
    ...PULSE, height: h, borderRadius: 8, width: typeof w === 'number' ? w : undefined,
    ...(typeof w !== 'number' ? { flex: w } : {}),
  });
  return (
    <>
      <div className="filter-bar is-skeleton" aria-hidden>
        {/* order + widths mirror the real FiltersGrid JSX */}
        <div className="filter-bar-search" style={pill('0 1 300px')} />
        <div className="day-bar" style={{ display: 'contents' }}>
          <div className="day-strip" style={pill('0 1 460px', 56)} />
          <div className="calendar-btn" style={pill(56, 56)} />
        </div>
        <div className="theater-multiselect" style={pill('1 1 180px')} />
        <div className="more-filters-btn" style={pill(56, 56)} />
        <div className="clear-grid-btn" style={pill(56, 56)} />
      </div>
      {/* Reserves the 28px vertical space of the active-chips row so the
          "Hoy · N películas" heading below doesn't jump when real chips arrive. */}
      <div className="active-chips-placeholder" aria-hidden />
    </>
  );
}

export function SkeletonCardGrid({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} delay={i * 70} />
      ))}
    </div>
  );
}

export { PULSE as SKELETON_PULSE_STYLE };
