/**
 * Per-theater tint colors used as tiny dots next to theater names in the
 * Direction C session panels. Colors are from the DC sample data palette;
 * each theater (or theater group) gets a distinct warm/cool hue.
 */

import { isRenoirLocation, isEmbajadoresLocation } from './film-helpers';

const TINTS = {
  filmoteca: '#c2593a',  // Doré — terracotta
  cineteca:  '#6a8caf',  // blue-grey
  berlanga:  '#caa24a',  // mustard
  equis:     '#c8757f',  // dusty pink
  verdi:     '#4a7f5c',  // forest
  renoir:    '#9270a8',  // violet
  golem:     '#556a86',  // steel
  paz:       '#8a6a3e',  // tobacco
  embj:      '#7a5d82',  // plum
  estudio:   '#555e6a',  // slate
  cinesa:    '#b24a52',  // brick
  yelmo:     '#4a7f6a',  // teal
  fallback:  '#8a7f6a',  // warm grey
};

export function theaterTint(location: string): string {
  if (!location) return TINTS.fallback;
  const l = location.toLowerCase();
  if (/\bdor[eé]\b/.test(l) || l.includes('filmoteca')) return TINTS.filmoteca;
  if (l.includes('cineteca')) return TINTS.cineteca;
  if (l.includes('berlanga')) return TINTS.berlanga;
  if (l.includes('equis')) return TINTS.equis;
  if (l.includes('verdi')) return TINTS.verdi;
  if (isRenoirLocation(location) || l.includes('renoir')) return TINTS.renoir;
  if (l.includes('golem')) return TINTS.golem;
  if (l.includes('paz')) return TINTS.paz;
  if (isEmbajadoresLocation(location) || l.includes('embajadores')) return TINTS.embj;
  if (l.includes('estudio')) return TINTS.estudio;
  if (l.includes('cinesa')) return TINTS.cinesa;
  if (l.includes('yelmo')) return TINTS.yelmo;
  return TINTS.fallback;
}

/** Display name for a theater location shown in session chips.
 *  Keeps brand prefixes (Cine, Sala, Cinesa, Yelmo, …) so the name reads
 *  correctly ("Cine Paz", "Sala Equis", "Cinesa Manoteras"), and prepends
 *  the Renoir brand to the bare single-name Renoir locations in Madrid. */
const RENOIR_LOCATIONS = new Set(['Princesa', 'Plaza de España', 'Retiro']);

/** Hardcoded display order for theater lists. Lower index = earlier.
 *  Theaters not matched fall to the end (alphabetical among themselves). */
export function theaterOrderIndex(location: string): number {
  if (!location) return 999;
  const l = location.toLowerCase();
  if (/\bdor[eé]\b/.test(l) || l.includes('filmoteca')) return 0;
  if (l.includes('cineteca')) return 1;
  if (l.includes('berlanga')) return 2;
  if (l.includes('estudio')) return 3;
  if (l.includes('golem')) return 4;
  if (isRenoirLocation(location) || l.includes('renoir')) return 5;
  if (l.includes('equis')) return 6;
  if (isEmbajadoresLocation(location) || l.includes('embajadores')) return 7;
  if (l.includes('verdi')) return 8;
  if (l.includes('paz')) return 9;
  if (l.includes('cinesa')) return 10;
  if (l.includes('yelmo')) return 11;
  return 999;
}

export function shortTheaterName(location: string): string {
  if (!location) return '';
  const trimmed = location.trim();
  if (RENOIR_LOCATIONS.has(trimmed)) return `Renoir ${trimmed}`;
  return trimmed;
}
