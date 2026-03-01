'use client';

import dynamic from 'next/dynamic';

// Load fully on client — no SSR since data comes from Supabase at runtime
const FilmCalendar = dynamic(() => import('@/components/FilmCalendar'), {
  ssr: false,
  loading: () => (
    <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
      Cargando...
    </div>
  ),
});

export default function Home() {
  return <FilmCalendar />;
}
