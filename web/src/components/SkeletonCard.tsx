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
 * Matches the real .filter-bar flex layout — single horizontal row with
 * search (flex 1 1 260px), day strip (flex 1 1 0), calendar icon, theater
 * pill, more-filters, clear. Height 44px matches the real controls.
 */
export function SkeletonFilters() {
  const row: React.CSSProperties = { ...PULSE, height: 44, borderRadius: 8 };
  return (
    <div className="filter-bar" aria-hidden>
      <div style={{ ...row, flex: '1 1 260px', minWidth: 180 }} />
      <div style={{ ...row, flex: '1 1 0', minWidth: 220, animationDelay: '80ms' }} />
      <div style={{ ...row, width: 130, animationDelay: '160ms' }} />
      <div style={{ ...row, width: 120, animationDelay: '240ms' }} />
    </div>
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
