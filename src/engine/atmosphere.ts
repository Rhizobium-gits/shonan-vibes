/**
 * time → sun → day phase → environment palette → (modifiers) → final palette
 *
 * Environmental modifiers (season, cloud cover) are part of the "dynamic"
 * signal and fade out with intensity. Taste modifiers (ocean saturation,
 * night darkness) apply to whatever is shown, static or not. The contrast
 * guard runs last, so no combination of settings can make code hard to read.
 */

import {
  Lab,
  ensureContrast,
  lighten,
  mix,
  nudgeHue,
  rotateHue,
  scaleChroma,
  withLightness,
} from './color';
import { BASE, KEYFRAMES, Palette, Role, mixPalettes } from './moods';
import { dayPhase, nightness as nightnessOf, smoothstep } from './phase';
import type { Sky } from './sky';

export interface AtmosphereOptions {
  /** 0 = static theme, 1 = the full day. */
  intensity: number;
  /** Multiplier on ocean/sky chroma, 0..1.5. */
  oceanSaturation: number;
  /** 0 = lifted nights, 0.5 = as designed, 1 = near-black nights. */
  nightDarkness: number;
  seasonalTint: boolean;
  /** 0 = clear sky, 1 = overcast. Reserved for future weather input. */
  cloudCover: number;
}

export const DEFAULT_ATMOSPHERE: AtmosphereOptions = {
  intensity: 1,
  oceanSaturation: 1,
  nightDarkness: 0.5,
  seasonalTint: true,
  cloudCover: 0,
};

export type DerivedRole = 'property' | 'punct' | 'operator' | 'escape';
export type FinalRole = Role | DerivedRole;
export type FinalPalette = Record<FinalRole, Lab>;

export interface Atmosphere {
  /** Position on the day circle, 0..1 (0.5 = solar noon). */
  phase: number;
  phaseName: string;
  /** 0 in daylight, 1 in full night. */
  nightness: number;
  /** Null for the static theme. */
  sky: Sky | null;
  palette: FinalPalette;
}

/** What modifiers know about the moment. */
export interface Environment {
  phase: number;
  nightness: number;
  dayOfYear: number;
  cloudCover: number;
}

export type Modifier = (p: Palette, env: Environment) => Palette;

// ---------------------------------------------------------------------------

export function samplePalette(phase: number): { palette: Palette; name: string } {
  const p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const k0 = KEYFRAMES[i];
    const k1 = KEYFRAMES[i + 1];
    if (p >= k0.at && p <= k1.at) {
      const u = (p - k0.at) / (k1.at - k0.at);
      // Ease each segment so the light settles through every keyframe.
      const e = u * u * (3 - 2 * u);
      return { palette: mixPalettes(k0.palette, k1.palette, e), name: u < 0.5 ? k0.name : k1.name };
    }
  }
  return { palette: KEYFRAMES[0].palette, name: KEYFRAMES[0].name };
}

export function computeAtmosphere(sky: Sky, opts: AtmosphereOptions = DEFAULT_ATMOSPHERE): Atmosphere {
  const phase = dayPhase(sky.sun);
  const night = nightnessOf(sky.sun);
  const env: Environment = {
    phase,
    nightness: night,
    dayOfYear: sky.dayOfYear,
    cloudCover: clamp01(opts.cloudCover),
  };

  const sampled = samplePalette(phase);
  let dynamic = sampled.palette;
  if (opts.seasonalTint) dynamic = seasonModifier(dynamic, env);
  dynamic = weatherModifier(dynamic, env);

  const k = clamp01(opts.intensity);
  const blended = k >= 1 ? dynamic : mixPalettes(BASE, dynamic, k);
  // The static base is a night palette, so its "nightness" is 1.
  const shownNight = 1 + (night - 1) * k;

  return {
    phase,
    phaseName: k < 0.15 ? 'Moonlight' : sampled.name,
    nightness: shownNight,
    sky,
    palette: finalize(tasteModifier(blended, opts, shownNight)),
  };
}

/** The shipped static theme (also what intensity 0 converges to). */
export function staticAtmosphere(opts: AtmosphereOptions = DEFAULT_ATMOSPHERE): Atmosphere {
  return {
    phase: 0,
    phaseName: 'Moonlight',
    nightness: 1,
    sky: null,
    palette: finalize(tasteModifier(BASE, opts, 1)),
  };
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/**
 * Seasons, kept small on purpose. The astronomical model already brings
 * early winter sunsets and long summer evenings; this only tints them.
 *   summer: livelier ocean, warmer sunsets · winter: cooler, quieter blue
 *   spring: pastel dawns · autumn: warmer evenings
 */
export const seasonModifier: Modifier = (p, env) => {
  const angle = (2 * Math.PI * (env.dayOfYear - 172)) / 365.25;
  const summer = Math.cos(angle); // +1 late June, -1 late December
  const autumn = Math.sin(angle); // +1 late September, -1 late March
  const dawn = bump(env.phase, 0.235, 0.06);
  const evening = bump(env.phase, 0.755, 0.07);

  const out: Palette = { ...p };
  for (const r of ['sea', 'ocean', 'sky', 'zenith'] as const) {
    out[r] = scaleChroma(out[r], 1 + 0.08 * summer);
  }
  if (summer < 0) {
    for (const r of ['room', 'sea', 'ocean', 'zenith'] as const) {
      out[r] = nudgeHue(out[r], 255, 6 * -summer);
    }
  }
  const spring = Math.max(0, -autumn) * dawn;
  const fall = Math.max(0, autumn) * evening;
  const warmSummer = Math.max(0, summer) * evening;
  for (const r of ['glow', 'horizon', 'sky'] as const) {
    out[r] = scaleChroma(lighten(out[r], 0.025 * spring), 1 - 0.15 * spring + 0.08 * fall + 0.06 * warmSummer);
  }
  return out;
};

/** Clouds mute the light and flatten the sky. Syntax colors are untouched. */
export const weatherModifier: Modifier = (p, env) => {
  const c = env.cloudCover;
  if (c <= 0) return p;
  const out: Palette = { ...p };
  for (const r of ['sky', 'glow', 'sea', 'sand', 'zenith', 'horizon', 'ocean', 'beach'] as const) {
    out[r] = scaleChroma(out[r], 1 - 0.55 * c);
  }
  const middle = (out.zenith.L + out.horizon.L) / 2;
  out.zenith = mix(out.zenith, withLightness(out.zenith, middle), 0.6 * c);
  out.horizon = mix(out.horizon, withLightness(out.horizon, middle), 0.6 * c);
  out.room = scaleChroma(out.room, 1 - 0.3 * c);
  return out;
};

function tasteModifier(p: Palette, opts: AtmosphereOptions, night: number): Palette {
  const s = Math.max(0, Math.min(1.5, opts.oceanSaturation));
  const out: Palette = { ...p };
  out.sea = scaleChroma(out.sea, s);
  out.ocean = scaleChroma(out.ocean, s);
  out.sky = scaleChroma(out.sky, 0.5 + 0.5 * s);
  out.zenith = scaleChroma(out.zenith, 0.5 + 0.5 * s);
  out.room = scaleChroma(out.room, 0.6 + 0.4 * s);

  const dL = (0.5 - clamp01(opts.nightDarkness)) * 2 * 0.04 * night;
  for (const r of ['room', 'sea', 'zenith', 'ocean', 'horizon', 'beach'] as const) {
    out[r] = withLightness(out[r], Math.max(0.06, out[r].L + dL));
  }
  return out;
}

/**
 * Minimum WCAG contrast per role. In the dark hours the bar is high; under
 * the bright midday sky it eases toward AA-plus, because nothing can reach
 * 9:1 against a blue sky. Comments stay at AA (4.5:1) at every hour.
 */
const MIN_CONTRAST = {
  text: [9, 7],
  comment: [4.5, 4.5],
  keyword: [6, 5],
  func: [6, 5],
  string: [6, 5],
  number: [5.5, 4.8],
  type: [6.5, 5.5],
  param: [7, 5.5],
  property: [7, 5.5],
  punct: [5, 4.5],
  operator: [5, 4.5],
  escape: [6, 5],
} as const satisfies Record<string, readonly [dark: number, bright: number]>;

export type GuardedRole = keyof typeof MIN_CONTRAST;

/** 0 for a dark room, 1 for the full midday sky. */
function brightness(room: Lab): number {
  return smoothstep(0.27, 0.4, room.L);
}

export function minContrast(role: GuardedRole, room: Lab): number {
  const [dark, bright] = MIN_CONTRAST[role];
  return dark + (bright - dark) * brightness(room);
}

/** Derived roles, then the readability guard. */
function finalize(p: Palette): FinalPalette {
  // Measure against a background slightly lighter than the editor, which
  // covers hovers, the current-line highlight and widgets.
  const ref = lighten(p.room, 0.03 - 0.02 * brightness(p.room));
  const guard = (c: Lab, role: GuardedRole) => ensureContrast(c, ref, minContrast(role, p.room));

  const text = guard(p.text, 'text');
  const comment = guard(p.comment, 'comment');
  return {
    ...p,
    text,
    comment,
    keyword: guard(p.keyword, 'keyword'),
    func: guard(p.func, 'func'),
    string: guard(p.string, 'string'),
    number: guard(p.number, 'number'),
    type: guard(p.type, 'type'),
    param: guard(p.param, 'param'),
    property: guard(mix(text, p.func, 0.35), 'property'),
    punct: guard(mix(text, comment, 0.55), 'punct'),
    operator: guard(mix(mix(text, comment, 0.55), p.keyword, 0.35), 'operator'),
    escape: guard(lighten(rotateHue(p.string, 32), 0.02), 'escape'),
  };
}

// ---------------------------------------------------------------------------

/** Cosine bump on the day circle: 1 at `center`, 0 beyond `half`. */
function bump(phase: number, center: number, half: number): number {
  let d = Math.abs(phase - center);
  d = Math.min(d, 1 - d);
  return d >= half ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / half);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0;
}
