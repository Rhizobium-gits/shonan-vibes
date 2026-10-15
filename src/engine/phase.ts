/**
 * Sun → day phase.
 *
 * The day is a circle, φ ∈ [0, 1): 0 is solar midnight, 0.5 solar noon.
 * φ is driven by the sun's altitude, not the clock, so the same palette
 * appears at "sun 4° below the horizon, sinking" in June (19:30) and in
 * December (17:00). Rising and setting branches have their own anchors,
 * because dawn and dusk are not mirror images: dawn is violet and pale pink,
 * dusk passes through gold, orange and coral first.
 */

import type { SunState } from './sky';
import { HORIZON } from './solar';

type Anchor = readonly [altitude: number, phase: number];

// Ascending altitude.
const RISING: readonly Anchor[] = [
  [-30, 0.1], // deep night, the first hint of blue
  [-18, 0.17], // astronomical dawn
  [-11, 0.2], // blue hour
  [-5.5, 0.222], // dawn: violet, lavender, pale pink
  [HORIZON, 0.245], // sunrise
  [5, 0.27], // early morning, peach light
  [14, 0.31], // morning
  [38, 0.42], // day
];

// Descending altitude.
const SETTING: readonly Anchor[] = [
  [38, 0.58], // day
  [20, 0.66], // afternoon, blue warming
  [7, 0.715], // golden hour
  [1, 0.742], // sunset
  [-3, 0.765], // afterglow
  [-7, 0.79], // twilight
  [-12, 0.82], // dusk
  [-20, 0.88], // night
];

export function dayPhase(sun: SunState): number {
  const lo = sun.midnightAltitude;
  const hi = sun.noonAltitude;
  if (hi - lo < 1) {
    // Pole-like sky: altitude barely changes. Fall back to the hour angle.
    return (sun.hourAngle + 180) / 360;
  }
  const h = Math.min(hi, Math.max(lo, sun.altitude));
  if (sun.rising) {
    const pts: Anchor[] = [[lo, 0], ...RISING.filter(([a]) => a > lo && a < hi), [hi, 0.5]];
    return interpolate(pts, h);
  }
  const pts: Anchor[] = [[hi, 0.5], ...SETTING.filter(([a]) => a > lo && a < hi), [lo, 1]];
  return interpolate(pts, h);
}

/** Piecewise linear over anchors sorted by altitude (either direction). */
function interpolate(pts: Anchor[], h: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, p0] = pts[i];
    const [a1, p1] = pts[i + 1];
    const between = a0 <= a1 ? h >= a0 && h <= a1 : h <= a0 && h >= a1;
    if (between) {
      const t = a1 === a0 ? 0 : (h - a0) / (a1 - a0);
      return p0 + (p1 - p0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/** 0 in daylight, 1 in full night (sun below -16°). Smooth in between. */
export function nightness(sun: SunState): number {
  return smoothstep(-4, -16, sun.altitude);
}

/** 0 at night, 1 once the sun is well up. */
export function daylight(sun: SunState): number {
  return smoothstep(-2, 25, sun.altitude);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
