export const ROWS_PER_PAGE = 10;
export const SESSIONS_COLLAPSE_THRESHOLD = 2;

export const RENOIR_LOCATIONS = ['Princesa', 'Retiro', 'Plaza de España'];
export const EMBAJADORES_LOCATIONS = ['Embajadores Glorieta', 'Embajadores Ercilla'];

export const THEATER_LOCATIONS: Record<string, string> = {
  'Plaza de España': 'Cines Renoir Plaza de España, C. de Martín de los Heros, 12, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Princesa': 'Cines Renoir Princesa, Calle de la Princesa, 3, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Retiro': 'Cines Renoir Retiro, C. de Narváez, 42, Retiro, 28009 Madrid, Spain',
  'Cine Doré': 'Cine Doré, C. de Sta. Isabel, 3, Centro, 28012 Madrid, Spain',
  'Cineteca': 'Cineteca, Pl. de Legazpi, 8, Arganzuela, 28045 Madrid, Spain',
  'Golem': 'Golem Madrid, C. de Martín de los Heros, 14, Moncloa - Aravaca, 28008 Madrid, Spain',
  'Sala Berlanga': 'Sala Berlanga, C. de Andrés Mellado, 53, Chamberí, 28015 Madrid, Spain',
};

// ── Theater groups for multi-select ────────────────────────────────────────

export interface TheaterGroup {
  label: string;
  value?: string;
  children?: { value: string; label: string }[];
}

export const THEATER_GROUPS: TheaterGroup[] = [
  { label: 'Renoir', children: [
    { value: 'Princesa', label: 'Princesa' },
    { value: 'Retiro', label: 'Retiro' },
    { value: 'Plaza de España', label: 'Plaza de España' },
  ]},
  { value: 'Cineteca Madrid', label: 'Cineteca' },
  { value: 'Cine Doré', label: 'Doré' },
  { value: 'Cine Estudio', label: 'Cine Estudio' },
  { value: 'Golem', label: 'Golem' },
  { value: 'Sala Berlanga', label: 'Sala Berlanga' },
  { label: 'Embajadores', children: [
    { value: 'Embajadores Glorieta', label: 'Glorieta' },
    { value: 'Embajadores Ercilla', label: 'Ercilla' },
  ]},
  { value: 'Cine Paz', label: 'Cine Paz' },
  { value: 'Sala Equis', label: 'Sala Equis' },
  { value: 'Verdi', label: 'Verdi' },
  { label: 'Cinesa', children: [
    { value: 'Cinesa Equinoccio', label: 'Equinoccio' },
    { value: 'Cinesa La Gavia', label: 'La Gavia' },
    { value: 'Cinesa La Moraleja', label: 'La Moraleja' },
    { value: 'Cinesa Las Rosas', label: 'Las Rosas' },
    { value: 'Cinesa Las Rozas', label: 'Las Rozas' },
    { value: 'Cinesa Manoteras', label: 'Manoteras' },
    { value: 'Cinesa Mendez Alvaro', label: 'Méndez Álvaro' },
    { value: 'Cinesa Nassica', label: 'Nassica' },
    { value: 'Cinesa Oasiz', label: 'Oasiz' },
    { value: 'Cinesa Parquesur', label: 'Parquesur' },
    { value: 'Cinesa Plaza Loranca 2', label: 'Plaza Loranca 2' },
    { value: 'Cinesa Principe Pio', label: 'Príncipe Pío' },
    { value: 'Cinesa Proyecciones', label: 'Proyecciones' },
    { value: 'Cinesa Xanadu', label: 'Xanadú' },
  ]},
  { label: 'Yelmo', children: [
    { value: 'Yelmo Ideal', label: 'Ideal' },
    { value: 'Yelmo Islazul', label: 'Islazul' },
    { value: 'Yelmo La Vaguada', label: 'La Vaguada' },
    { value: 'Yelmo Palafox Luxury', label: 'Palafox Luxury' },
    { value: 'Yelmo Parque Corredor', label: 'Parque Corredor' },
    { value: 'Yelmo Plaza Norte 2', label: 'Plaza Norte 2' },
    { value: 'Yelmo Planetocio', label: 'Planetocio' },
    { value: 'Yelmo Plenilunio', label: 'Plenilunio' },
    { value: 'Yelmo Rivas H2O', label: 'Rivas H2O' },
    { value: 'Yelmo TresAguas', label: 'TresAguas' },
  ]},
];

// Flat list of all theater location values
export const ALL_THEATER_VALUES: string[] = [];
export const THEATER_DISPLAY_NAMES: Record<string, string> = {};

for (const g of THEATER_GROUPS) {
  if (g.children) {
    for (const c of g.children) {
      ALL_THEATER_VALUES.push(c.value);
      THEATER_DISPLAY_NAMES[c.value] = g.label + ' ' + c.label;
    }
  } else if (g.value) {
    ALL_THEATER_VALUES.push(g.value);
    THEATER_DISPLAY_NAMES[g.value] = g.label;
  }
}

// Old chain names → individual location values (for localStorage/URL migration)
export const OLD_THEATER_MAPPING: Record<string, string[]> = {
  'Cines Renoir': RENOIR_LOCATIONS,
  'Cineteca Madrid': ['Cineteca Madrid'],
  'Cines Embajadores': EMBAJADORES_LOCATIONS,
  'Cinesa': THEATER_GROUPS.find(g => g.label === 'Cinesa')!.children!.map(c => c.value),
  'Cines Yelmo': THEATER_GROUPS.find(g => g.label === 'Yelmo')!.children!.map(c => c.value),
};

// ── Runtime categories for chip filter ─────────────────────────────────────

export const RUNTIME_CATEGORIES = [
  { label: '< 1h', min: 0, max: 59 },
  { label: '1–1.5h', min: 60, max: 89 },
  { label: '1.5–2h', min: 90, max: 119 },
  { label: '2–3h', min: 120, max: 179 },
  { label: '3h+', min: 180, max: Infinity },
];

// ── Day of week ────────────────────────────────────────────────────────────

export const DAY_LABELS: Record<string, string[]> = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

// Chip index → JS getDay() value: 0=Mon(1), 1=Tue(2), ..., 6=Sun(0)
export const CHIP_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0];

// ── Special session type labels ────────────────────────────────────────────

export const SPECIAL_TYPE_LABELS: Record<string, Record<string, string>> = {
  es: {
    conference: 'Conferencia', shorts: 'Cortometrajes', festival: 'Festival',
    event: 'Evento', compilation: 'Compilación', opera: 'Ópera',
    ballet: 'Ballet', theater: 'Teatro', concert: 'Concierto', tv: 'TV',
    tv_show: 'Serie de TV',
    live_music: 'Música en directo', double_session: 'Doble sesión',
  },
  en: {
    conference: 'Conference', shorts: 'Shorts', festival: 'Festival',
    event: 'Event', compilation: 'Compilation', opera: 'Opera',
    ballet: 'Ballet', theater: 'Theater', concert: 'Concert', tv: 'TV',
    tv_show: 'TV series',
    live_music: 'Live music', double_session: 'Double feature',
  },
};
