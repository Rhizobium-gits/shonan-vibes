/**
 * A moment of the day, packaged for the Shoreline view and the preview
 * renderer. Pure (no vscode import).
 */

import {
  Atmosphere,
  AtmosphereOptions,
  FinalPalette,
  Sky,
  SkyOptions,
  computeAtmosphere,
  skyAt,
  toHex,
} from './engine';

export interface SceneFrame {
  /** Minutes after midnight on the user's clock. */
  minutes: number;
  clock: string;
  phase: number;
  phaseName: string;
  nightness: number;
  cloudCover: number;
  sun: { altitude: number; azimuth: number; rising: boolean };
  moon: {
    altitude: number;
    azimuth: number;
    phase: number;
    illumination: number;
    elongation: number;
    /** Bright limb, degrees anticlockwise from straight up. */
    limb: number;
  };
  /** For turning the stars: local sidereal time (degrees) and latitude. */
  stars: { siderealTime: number; latitude: number };
  /** The editor palette, as the user sees it (intensity applied). */
  colors: Record<string, string>;
  /** The coast itself, always at full intensity. */
  scene: Record<string, string>;
}

export function hexPalette(p: FinalPalette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[k] = toHex(v);
  return out;
}

export function clockLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function sceneFrame(
  when: Date,
  sky: Sky,
  editor: Atmosphere,
  scene: Atmosphere,
  cloudCover: number,
): SceneFrame {
  const minutes = when.getHours() * 60 + when.getMinutes();
  return {
    minutes,
    clock: clockLabel(minutes),
    phase: scene.phase,
    phaseName: editor.phaseName,
    nightness: scene.nightness,
    cloudCover,
    sun: { altitude: sky.sun.altitude, azimuth: sky.sun.azimuth, rising: sky.sun.rising },
    moon: { ...sky.moon },
    stars: { siderealTime: sky.siderealTime, latitude: sky.latitude },
    colors: hexPalette(editor.palette),
    scene: hexPalette(scene.palette),
  };
}

/** Frame for a given moment with given options. */
export function frameAt(when: Date, sky: SkyOptions, atmosphere: AtmosphereOptions): SceneFrame {
  const s = skyAt(when, sky);
  const editor = computeAtmosphere(s, atmosphere);
  const scene = atmosphere.intensity >= 1 ? editor : computeAtmosphere(s, { ...atmosphere, intensity: 1 });
  return sceneFrame(when, s, editor, scene, atmosphere.cloudCover);
}

/** The whole of today, every `stepMinutes`, on the user's clock. */
export function dayFrames(
  day: Date,
  sky: SkyOptions,
  atmosphere: AtmosphereOptions,
  stepMinutes = 10,
): SceneFrame[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const frames: SceneFrame[] = [];
  for (let m = 0; m < 1440; m += stepMinutes) {
    const when = new Date(start);
    when.setMinutes(m);
    frames.push(frameAt(when, sky, atmosphere));
  }
  return frames;
}
