/**
 * Film-card-shaped skeleton. Used by:
 *   - loading.tsx (server-rendered, shown while page.tsx runs)
 *   - FilmCalendar (rendered while /api/screenings is still loading)
 * Same shape in both so the swap to real cards is seamless.
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
      style={{ animation: 'fc-skeleton-pulse 1.4s ease-in-out infinite', animationDelay: `${delay}ms` }}
    >
      <Block style={{ height: 22, width: '75%', borderRadius: 4 }} />
      <Block style={{ height: 14, width: '55%', borderRadius: 4, marginTop: 10 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        <Block style={{ height: 20, width: 60, borderRadius: 10 }} />
        <Block style={{ height: 20, width: 75, borderRadius: 10 }} />
        <Block style={{ height: 20, width: 50, borderRadius: 10 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <Block style={{ height: 16, width: '85%', borderRadius: 4 }} />
        <Block style={{ height: 16, width: '70%', borderRadius: 4 }} />
        <Block style={{ height: 16, width: '78%', borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
        <Block style={{ height: 14, width: 42, borderRadius: 4 }} />
        <Block style={{ height: 14, width: 42, borderRadius: 4 }} />
        <Block style={{ height: 14, flex: 1, borderRadius: 7 }} />
        <Block style={{ height: 20, width: 20, borderRadius: 4 }} />
      </div>
    </div>
  );
}

/**
 * Matches the real .filters-grid exactly: 12-col, 3 rows, same heights as the real
 * controls (row 1: theater trigger min-height 52px; rows 2 & 3: inputs/buttons with
 * 0.75rem vertical padding + ~1rem font ≈ 42px). Cells positioned identically so
 * the swap to real filters produces no height change and no layout shift.
 */
export function SkeletonFilters() {
  // Real heights: row 1 is set by .theater-multiselect-trigger min-height: 52px.
  // Rows 2 & 3 are ~45px: 0.75rem vertical padding (24px) + 1rem font × line-height
  // normal (~19.2px) + 1px border top & bottom.
  const ROW1 = 52;
  const ROW2 = 45;
  const ROW3 = 45;
  return (
    <div className="filters-grid" aria-hidden>
      <div style={{ gridColumn: '1 / 10', gridRow: 1, ...PULSE, height: ROW1 }} />
      <div style={{ gridColumn: '10 / 13', gridRow: 1, ...PULSE, height: ROW1 }} />
      <div style={{ gridColumn: '1 / 9', gridRow: 2, ...PULSE, height: ROW2, animationDelay: '80ms' }} />
      <div style={{ gridColumn: '9 / 13', gridRow: 2, ...PULSE, height: ROW2, animationDelay: '80ms' }} />
      <div style={{ gridColumn: '1 / 8', gridRow: 3, ...PULSE, height: ROW3, animationDelay: '160ms' }} />
      <div style={{ gridColumn: '8 / 13', gridRow: 3, ...PULSE, height: ROW3, animationDelay: '160ms' }} />
    </div>
  );
}

export function SkeletonCardGrid({ count = 9 }: { count?: number }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(350px, 100%), 1fr))',
        gap: '1.5rem',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} delay={i * 70} />
      ))}
    </div>
  );
}

export { PULSE as SKELETON_PULSE_STYLE };
