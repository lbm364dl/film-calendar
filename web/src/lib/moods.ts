// Curated mood shelves. Each mood is defined by a handful of canonical
// anchor films whose embeddings we average to form a "mood vector" — every
// screening film is then cosine-ranked against these vectors.
//
// Five shelves, deliberately orthogonal so the same film doesn't dominate
// multiple shelves. Anchor films MUST exist in the KG
// (pxekdfabiecilbgfeekt); IDs below were verified 2026-04-20.

export interface MoodDef {
  id: string;
  label: { es: string; en: string };
  // Canonical vibe anchors. May be empty for shelves that rank purely by
  // Letterboxd rating (e.g. "underdogs"), in which case embedding scoring
  // and the popularity adjustment are skipped.
  anchorTmdbIds: number[];
  // Optional inclusive year window. When present, only candidate films whose
  // year falls inside [start, end] are scored — used by decade/period shelves
  // so a modern film that "feels" 70s doesn't steal a slot on the 70s shelf.
  yearRange?: { start: number; end: number };
  // Optional Letterboxd viewer cap. Films with viewers > max are excluded.
  // Use for "underdog / hidden gem" shelves.
  maxViewers?: number;
  // Optional minimum Letterboxd rating (0–5) — only meaningful when anchors
  // is empty, since embedding scoring doesn't look at ratings. Defaults to 0.
  minRating?: number;
}

export const MOODS: MoodDef[] = [
  {
    id: 'adrenaline',
    label: { es: 'Adrenalina pura', en: 'Adrenaline rush' },
    anchorTmdbIds: [
      562,    // Die Hard (1988)
      76341,  // Mad Max: Fury Road (2015)
      245891, // John Wick (2014)
      949,    // Heat (1995)
      280,    // Terminator 2: Judgment Day (1991)
    ],
  },
  {
    id: 'tearjerker',
    label: { es: 'Para llorar', en: 'Tearjerkers' },
    anchorTmdbIds: [
      12477,  // Grave of the Fireflies (1988)
      334541, // Manchester by the Sea (2016)
      14160,  // Up (2009)
      965150, // Aftersun (2022)
      637,    // Life Is Beautiful (1997)
    ],
  },
  {
    id: 'comedy',
    label: { es: 'Para reír', en: 'For laughs' },
    anchorTmdbIds: [
      115,    // The Big Lebowski (1998)
      137,    // Groundhog Day (1993)
      762,    // Monty Python and the Holy Grail (1975)
      773,    // Little Miss Sunshine (2006)
      346648, // Paddington 2 (2017)
    ],
  },
  {
    id: 'mind-benders',
    label: { es: 'Alucinaciones mentales', en: 'Mind-benders' },
    anchorTmdbIds: [
      1018,   // Mulholland Drive (2001)
      985,    // Eraserhead (1977)
      27205,  // Inception (2010)
      797,    // Persona (1966)
      62,     // 2001: A Space Odyssey (1968)
    ],
  },
  {
    id: 'slow-contemplation',
    label: { es: 'Contemplación pausada', en: 'Slow contemplation' },
    anchorTmdbIds: [
      655,    // Paris, Texas (1984)
      18148,  // Tokyo Story (1953)
      843,    // In the Mood for Love (2000)
      76,     // Before Sunrise (1995)
      581734, // Nomadland (2020)
    ],
  },
  {
    id: 'fantasy',
    label: { es: 'Fantasía y lo maravilloso', en: 'Fantasy & the magical' },
    anchorTmdbIds: [
      1417,   // Pan's Labyrinth (2006)
      120,    // The Lord of the Rings: Fellowship (2001)
      129,    // Spirited Away (2001)
      4935,   // Howl's Moving Castle (2004)
      2493,   // The Princess Bride (1987)
      399055, // The Shape of Water (2017)
    ],
  },
  {
    id: 'underdogs',
    label: { es: 'Joyas ocultas', en: 'Hidden gems' },
    anchorTmdbIds: [],         // no vibe anchor — rank by Letterboxd rating
    maxViewers: 1000,
    minRating: 3.0,
  },
  {
    id: 'sci-fi',
    label: { es: 'Ciencia ficción', en: 'Science fiction' },
    anchorTmdbIds: [
      335984, // Blade Runner 2049
      329865, // Arrival
      152601, // Her
      264660, // Ex Machina
      309006, // Annihilation
    ],
  },
  {
    id: '3am-movie',
    label: { es: 'Película de las 3 de la mañana', en: '3 AM movie vibe' },
    anchorTmdbIds: [
      550,    // Fight Club
      4129,   // Requiem for a Dream
      185,    // A Clockwork Orange
      990,    // Blue Velvet
      10858,  // Natural Born Killers
    ],
  },
];
