/**
 * The light of one Shonan day, as twelve moods.
 *
 * Every mood is authored in OKLCH [lightness, chroma, hue]. Chroma never
 * exceeds ~0.13 (the sunset horizon in the Shoreline view); editor colors
 * stay at or below ~0.09, which is what keeps the theme quiet.
 *
 * Roles
 *   room     editor background: a dark room facing the sea
 *   sky      interactive accent (focus, buttons, selection): the sky's color
 *   glow     the light source: moon silver, peach sunrise, gold, coral sun
 *   sea      the status bar: the ocean below the editor
 *   sand     beach accents in the status bar
 *   zenith / horizon / ocean / beach
 *            the Shoreline view's pixel scene (real sky brightness)
 *   text … param
 *            syntax roles. Each keeps its family all day; only the light on
 *            it changes. Lightness tiers are kept stable so roles stay apart:
 *              text 0.87–0.90 · type (sand) / param (pale rose) 0.83–0.86
 *              string 0.80–0.83
 *              keyword 0.78–0.84 (bright) · function 0.77–0.80 (middle)
 *              number 0.72–0.81 (low whenever it is bluish) · comment 0.60–0.66
 */

import { Lab, lch, mix } from './color';

export const ROLES = [
  'room',
  'sky',
  'glow',
  'sea',
  'sand',
  'zenith',
  'horizon',
  'ocean',
  'beach',
  'text',
  'comment',
  'keyword',
  'func',
  'string',
  'number',
  'type',
  'param',
] as const;

export type Role = (typeof ROLES)[number];
export type Palette = Record<Role, Lab>;

type Spec = Record<Role, readonly [number, number, number]>;

function mood(spec: Spec): Palette {
  const out = {} as Record<Role, Lab>;
  for (const role of ROLES) out[role] = lch(...spec[role]);
  return out;
}

export function mixPalettes(x: Palette, y: Palette, t: number): Palette {
  const out = {} as Record<Role, Lab>;
  for (const role of ROLES) out[role] = mix(x[role], y[role], t);
  return out;
}

/** 00:00 — black, navy, indigo, moonlight. The theme's resting identity. */
export const MIDNIGHT = mood({
  room: [0.18, 0.02, 262],
  sky: [0.62, 0.06, 255],
  glow: [0.88, 0.03, 240],
  sea: [0.16, 0.028, 258],
  sand: [0.4, 0.02, 80],
  zenith: [0.13, 0.02, 268],
  horizon: [0.23, 0.035, 258],
  ocean: [0.17, 0.03, 255],
  beach: [0.26, 0.014, 75],
  text: [0.87, 0.012, 250],
  comment: [0.6, 0.03, 255],
  keyword: [0.78, 0.07, 302], // muted lavender
  func: [0.8, 0.072, 242], // moonlight blue
  string: [0.8, 0.058, 172], // subdued seafoam
  number: [0.72, 0.078, 272], // deep muted blue
  type: [0.84, 0.048, 85], // moonlit sand
  param: [0.84, 0.032, 20],
});

/** Sun ~11° below: deep navy, blue-gray, a first muted violet. */
export const BLUE_HOUR = mood({
  room: [0.205, 0.028, 268],
  sky: [0.63, 0.065, 275],
  glow: [0.8, 0.045, 285],
  sea: [0.195, 0.04, 264],
  sand: [0.42, 0.022, 70],
  zenith: [0.22, 0.05, 270],
  horizon: [0.43, 0.05, 290],
  ocean: [0.26, 0.045, 268],
  beach: [0.32, 0.016, 60],
  text: [0.87, 0.014, 265],
  comment: [0.61, 0.035, 275],
  keyword: [0.79, 0.075, 308],
  func: [0.8, 0.072, 248],
  string: [0.81, 0.055, 178],
  number: [0.72, 0.075, 282],
  type: [0.83, 0.05, 75],
  param: [0.84, 0.034, 10],
});

/** Sun ~5° below: violet, lavender, pale pink along the horizon. */
export const DAWN = mood({
  room: [0.215, 0.03, 290],
  sky: [0.66, 0.07, 305],
  glow: [0.84, 0.06, 345],
  sea: [0.22, 0.042, 280],
  sand: [0.46, 0.028, 45],
  zenith: [0.32, 0.06, 278],
  horizon: [0.66, 0.075, 345],
  ocean: [0.37, 0.05, 290],
  beach: [0.42, 0.025, 40],
  text: [0.88, 0.016, 310],
  comment: [0.62, 0.035, 300],
  keyword: [0.8, 0.08, 318],
  func: [0.8, 0.072, 252],
  string: [0.82, 0.055, 172],
  number: [0.76, 0.065, 12],
  type: [0.84, 0.052, 74],
  param: [0.85, 0.036, 0],
});

/** The sun on the horizon: pink, peach, soft orange entering the room. */
export const SUNRISE = mood({
  room: [0.222, 0.022, 305],
  sky: [0.7, 0.075, 25],
  glow: [0.86, 0.08, 58],
  sea: [0.245, 0.045, 268],
  sand: [0.54, 0.04, 58],
  zenith: [0.48, 0.07, 262],
  horizon: [0.8, 0.09, 58],
  ocean: [0.47, 0.06, 258],
  beach: [0.56, 0.04, 60],
  text: [0.89, 0.018, 55],
  comment: [0.63, 0.03, 320],
  keyword: [0.79, 0.08, 335], // lavender-pink
  func: [0.78, 0.07, 248], // cool blue, warm-tinted
  string: [0.83, 0.06, 160], // pale sea green
  number: [0.81, 0.075, 52], // soft peach
  type: [0.85, 0.055, 88],
  param: [0.85, 0.036, 20],
});

/** Sun ~14°: the orange fades into pale blue, then ocean blue. */
export const MORNING = mood({
  room: [0.24, 0.034, 245],
  sky: [0.7, 0.07, 235],
  glow: [0.9, 0.05, 80],
  sea: [0.285, 0.06, 242],
  sand: [0.6, 0.04, 80],
  zenith: [0.62, 0.09, 245],
  horizon: [0.86, 0.04, 220],
  ocean: [0.52, 0.09, 240],
  beach: [0.72, 0.04, 80],
  text: [0.89, 0.014, 230],
  comment: [0.64, 0.03, 250],
  keyword: [0.83, 0.062, 215],
  func: [0.77, 0.085, 252],
  string: [0.82, 0.07, 162],
  number: [0.79, 0.06, 40],
  type: [0.85, 0.058, 86],
  param: [0.85, 0.034, 30],
});

/** Midday: clear ocean blue, soft cyan, bright coastal air. Still a dark room. */
export const DAY = mood({
  room: [0.265, 0.04, 240],
  sky: [0.72, 0.085, 225],
  glow: [0.93, 0.035, 95],
  sea: [0.32, 0.075, 238],
  sand: [0.66, 0.045, 82],
  zenith: [0.62, 0.11, 245],
  horizon: [0.86, 0.05, 215],
  ocean: [0.5, 0.1, 235],
  beach: [0.8, 0.045, 85],
  text: [0.9, 0.012, 230],
  comment: [0.66, 0.03, 240], // soft gray-blue
  keyword: [0.84, 0.065, 200], // clear, muted cyan
  func: [0.77, 0.09, 252], // ocean blue
  string: [0.83, 0.08, 158], // sea green
  number: [0.75, 0.075, 290], // slightly warm blue
  type: [0.86, 0.065, 88], // sand in sunlight
  param: [0.86, 0.034, 35],
});

/** Sun ~20° and sinking: the blue slowly warms. */
export const AFTERNOON = mood({
  room: [0.255, 0.034, 248],
  sky: [0.72, 0.07, 240],
  glow: [0.91, 0.06, 85],
  sea: [0.305, 0.065, 242],
  sand: [0.64, 0.05, 76],
  zenith: [0.62, 0.09, 250],
  horizon: [0.85, 0.05, 85],
  ocean: [0.5, 0.085, 240],
  beach: [0.78, 0.05, 80],
  text: [0.895, 0.014, 70],
  comment: [0.65, 0.03, 255],
  keyword: [0.83, 0.062, 215],
  func: [0.77, 0.085, 255],
  string: [0.83, 0.075, 155],
  number: [0.78, 0.065, 330],
  type: [0.85, 0.065, 82],
  param: [0.855, 0.034, 30],
});

/** Sun ~7°: blue water, gold light. */
export const GOLDEN = mood({
  room: [0.24, 0.026, 262],
  sky: [0.74, 0.08, 78],
  glow: [0.85, 0.1, 75],
  sea: [0.28, 0.055, 250],
  sand: [0.6, 0.065, 70],
  zenith: [0.55, 0.08, 260],
  horizon: [0.82, 0.1, 78],
  ocean: [0.45, 0.07, 250],
  beach: [0.7, 0.07, 75],
  text: [0.89, 0.02, 75],
  comment: [0.64, 0.03, 290],
  keyword: [0.81, 0.075, 300],
  func: [0.77, 0.075, 258], // warm blue
  string: [0.82, 0.065, 145],
  number: [0.78, 0.09, 62],
  type: [0.86, 0.06, 92],
  param: [0.85, 0.036, 25],
});

/** The sun touching the sea: orange, coral. */
export const SUNSET = mood({
  room: [0.225, 0.022, 315],
  sky: [0.7, 0.09, 45],
  glow: [0.78, 0.12, 45],
  sea: [0.24, 0.045, 268],
  sand: [0.52, 0.06, 50],
  zenith: [0.42, 0.07, 285],
  horizon: [0.72, 0.13, 45],
  ocean: [0.38, 0.06, 270],
  beach: [0.55, 0.06, 50],
  text: [0.885, 0.02, 50],
  comment: [0.63, 0.035, 320], // dusty purple-gray
  keyword: [0.8, 0.08, 302], // violet
  func: [0.78, 0.07, 262], // warm blue
  string: [0.81, 0.055, 150], // muted seafoam, warmed
  number: [0.78, 0.09, 55], // soft orange
  type: [0.85, 0.06, 88],
  param: [0.84, 0.036, 15],
});

/** Sun ~3° below: coral fading to pink and violet. */
export const AFTERGLOW = mood({
  room: [0.215, 0.026, 330],
  sky: [0.68, 0.085, 5],
  glow: [0.74, 0.1, 15],
  sea: [0.215, 0.045, 285],
  sand: [0.46, 0.045, 30],
  zenith: [0.32, 0.07, 295],
  horizon: [0.62, 0.11, 10],
  ocean: [0.3, 0.05, 290],
  beach: [0.42, 0.04, 30],
  text: [0.88, 0.018, 20],
  comment: [0.62, 0.035, 320],
  keyword: [0.8, 0.08, 305],
  func: [0.79, 0.07, 262],
  string: [0.81, 0.055, 162],
  number: [0.79, 0.08, 30],
  type: [0.84, 0.055, 80],
  param: [0.84, 0.036, 5],
});

/** Sun ~7° below: violet into indigo. */
export const TWILIGHT = mood({
  room: [0.2, 0.03, 290],
  sky: [0.64, 0.075, 300],
  glow: [0.7, 0.07, 310],
  sea: [0.195, 0.045, 278],
  sand: [0.4, 0.02, 40],
  zenith: [0.24, 0.06, 285],
  horizon: [0.45, 0.08, 310],
  ocean: [0.24, 0.05, 285],
  beach: [0.32, 0.02, 320],
  text: [0.87, 0.015, 290],
  comment: [0.61, 0.035, 290],
  keyword: [0.8, 0.075, 308],
  func: [0.8, 0.072, 255],
  string: [0.81, 0.058, 170],
  number: [0.73, 0.055, 335],
  type: [0.83, 0.052, 75],
  param: [0.84, 0.036, 355],
});

/** Sun ~12° below: indigo, deep navy, almost night. */
export const DUSK = mood({
  room: [0.188, 0.026, 275],
  sky: [0.62, 0.065, 278],
  glow: [0.76, 0.045, 270],
  sea: [0.172, 0.038, 268],
  sand: [0.38, 0.02, 70],
  zenith: [0.17, 0.04, 275],
  horizon: [0.3, 0.05, 280],
  ocean: [0.19, 0.04, 270],
  beach: [0.26, 0.014, 70],
  text: [0.87, 0.013, 262],
  comment: [0.6, 0.032, 275],
  keyword: [0.79, 0.072, 305],
  func: [0.8, 0.072, 248],
  string: [0.8, 0.06, 172],
  number: [0.72, 0.078, 278],
  type: [0.84, 0.05, 78],
  param: [0.84, 0.032, 15],
});

/** The static theme, and the anchor that `intensity` blends toward. */
export const BASE = MIDNIGHT;

export interface Keyframe {
  /** Position on the day circle (0 = solar midnight, 0.5 = solar noon). */
  at: number;
  name: string;
  palette: Palette;
}

/**
 * One continuous day. Neighboring keyframes are always close relatives, so
 * no segment of the circle ever swings across the color wheel.
 */
export const KEYFRAMES: readonly Keyframe[] = [
  { at: 0.0, name: 'Night', palette: MIDNIGHT },
  { at: 0.1, name: 'Late night', palette: mixPalettes(MIDNIGHT, BLUE_HOUR, 0.12) },
  { at: 0.17, name: 'First light', palette: mixPalettes(MIDNIGHT, BLUE_HOUR, 0.5) },
  { at: 0.2, name: 'Blue hour', palette: BLUE_HOUR },
  { at: 0.222, name: 'Dawn', palette: DAWN },
  { at: 0.245, name: 'Sunrise', palette: SUNRISE },
  { at: 0.27, name: 'Early morning', palette: mixPalettes(SUNRISE, MORNING, 0.5) },
  { at: 0.31, name: 'Morning', palette: MORNING },
  { at: 0.42, name: 'Day', palette: DAY },
  { at: 0.58, name: 'Day', palette: DAY },
  { at: 0.66, name: 'Afternoon', palette: AFTERNOON },
  { at: 0.715, name: 'Golden hour', palette: GOLDEN },
  { at: 0.742, name: 'Sunset', palette: SUNSET },
  { at: 0.765, name: 'Afterglow', palette: AFTERGLOW },
  { at: 0.79, name: 'Twilight', palette: TWILIGHT },
  { at: 0.82, name: 'Dusk', palette: DUSK },
  { at: 0.88, name: 'Evening', palette: mixPalettes(DUSK, MIDNIGHT, 0.55) },
  { at: 1.0, name: 'Night', palette: MIDNIGHT },
];
