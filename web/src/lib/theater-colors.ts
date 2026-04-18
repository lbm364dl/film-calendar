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
  if (l.includes('doré') || l.includes('dore') || l.includes('filmoteca')) return TINTS.filmoteca;
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

/** Short display name for the location shown in chips (trims "Cines " / "Cinesa ..." prefixes). */
export function shortTheaterName(location: string): string {
  if (!location) return '';
  return location
    .replace(/^Cines?\s+/i, '')
    .replace(/^Sala\s+/i, '')
    .trim();
}
