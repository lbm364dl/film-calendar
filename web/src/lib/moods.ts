// Curated mood shelves. Each mood is defined by a handful of canonical
// anchor films whose embeddings we average to form a "mood vector" — every
// screening film is then cosine-ranked against these vectors.
//
// This taxonomy is intentionally small and subjective. It's a starting
// point — add/remove moods as the UX settles. Anchor films MUST exist in
// the KG (pxekdfabiecilbgfeekt); IDs below were verified 2026-04-20.

export interface MoodDef {
  id: string;
  label: { es: string; en: string };
  anchorTmdbIds: number[];
}

export const MOODS: MoodDef[] = [
  {
    id: 'slow-burn-dread',
    label: { es: 'Inquietud contemplativa', en: 'Slow-burn dread' },
    anchorTmdbIds: [
      1398,   // Stalker (1979)
      694,    // The Shining (1980)
      985,    // Eraserhead (1977)
      593,    // Solaris (1972)
    ],
  },
  {
    id: 'warm-melancholy',
    label: { es: 'Melancolía cálida', en: 'Warm melancholy' },
    anchorTmdbIds: [
      655,    // Paris, Texas (1984)
      843,    // In the Mood for Love (2000)
      153,    // Lost in Translation (2003)
      965150, // Aftersun (2022)
    ],
  },
  {
    id: 'kinetic-energy',
    label: { es: 'Energía cinética', en: 'Kinetic energy' },
    anchorTmdbIds: [
      244786, // Whiplash (2014)
      76341,  // Mad Max: Fury Road (2015)
      339403, // Baby Driver (2017)
      473033, // Uncut Gems (2019)
    ],
  },
  {
    id: 'existential-drift',
    label: { es: 'Deriva existencial', en: 'Existential drift' },
    anchorTmdbIds: [
      62,     // 2001: A Space Odyssey (1968)
      144,    // Wings of Desire (1987)
      8967,   // The Tree of Life (2011)
      581734, // Nomadland (2020)
    ],
  },
  {
    id: 'romantic-yearning',
    label: { es: 'Anhelo romántico', en: 'Romantic yearning' },
    anchorTmdbIds: [
      76,     // Before Sunrise (1995)
      398818, // Call Me by Your Name (2017)
      531428, // Portrait of a Lady on Fire (2019)
      843,    // In the Mood for Love (2000)
    ],
  },
  {
    id: 'psychological-unraveling',
    label: { es: 'Desmoronamiento psicológico', en: 'Psychological unraveling' },
    anchorTmdbIds: [
      1018,   // Mulholland Drive (2001)
      797,    // Persona (1966)
      44214,  // Black Swan (2010)
      793,    // Blue Velvet (1986)
    ],
  },
  {
    id: 'whimsical-charm',
    label: { es: 'Encanto caprichoso', en: 'Whimsical charm' },
    anchorTmdbIds: [
      120467, // The Grand Budapest Hotel (2014)
      718032, // Licorice Pizza (2021)
    ],
  },
  {
    id: 'quiet-meditation',
    label: { es: 'Meditación silenciosa', en: 'Quiet meditation' },
    anchorTmdbIds: [
      18148,  // Tokyo Story (1953)
      25237,  // Come and See (1985)
      655,    // Paris, Texas (1984)
    ],
  },
];
