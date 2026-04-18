import { SkeletonCardGrid, SkeletonFilters, SKELETON_PULSE_STYLE as PULSE } from '@/components/SkeletonCard';

/**
 * Instant skeleton shown while page.tsx's server work completes.
 * Mirrors the real site layout (same container, header, filters-grid, films-grid,
 * film-card) so the swap to real content is visually seamless — no layout shift.
 */
export default function Loading() {
  return (
    <div className="container">
      <header>
        <div className="header-top-row">
          <div aria-hidden style={{ ...PULSE, width: 96, height: 32, borderRadius: 20 }} />
          <div aria-hidden style={{ ...PULSE, width: 72, height: 30, borderRadius: 8 }} />
        </div>
        {/* Real title/subtitle — identical to post-load, stays in place at swap */}
        <h1>🎬 Madrid Film Calendar</h1>
        <p className="subtitle">
          Cine Estudio • Cine Paz • Cineteca • Doré • Embajadores • Golem • Renoir • Sala Berlanga • Sala Equis • Verdi • Cinesa • Yelmo
        </p>
      </header>

      <SkeletonFilters />

      <div className="stats">
        <div className="stats-row">
          <div aria-hidden style={{ ...PULSE, width: 120, height: 18, borderRadius: 4 }} />
          <div aria-hidden style={{ ...PULSE, width: 190, height: 30, borderRadius: 20 }} />
        </div>
      </div>

      <SkeletonCardGrid count={9} />
    </div>
  );
}
