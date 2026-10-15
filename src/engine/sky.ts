/**
 * From a wall clock to a sky.
 *
 * Two models produce the same SunState, so everything downstream only ever
 * sees "how high is the sun, and is it climbing or sinking":
 *
 *  - astronomical (default): the real sun over a coastline (Shonan unless
 *    configured), computed for today's date.
 *  - manual: a smooth sun curve fitted to user-supplied sunrise/sunset times.
 *
 * A future weather or location provider only needs to feed this layer.
 */

import { clamp } from './color';
import {
  HORIZON,
  MoonPosition,
  dailyExtremes,
  horizontal,
  moonPosition,
  siderealTime,
  sunEvents,
  sunPosition,
  wrap180,
} from './solar';

/** Enoshima, on the Shonan coast. */
export const SHONAN = { latitude: 35.2995, longitude: 139.48 } as const;

export interface SkyOptions {
  latitude: number;
  longitude: number;
  /**
   * true: the coast is moved into your time zone, so its sunrise and sunset
   * happen at your local hours. false: the real-time sky over the coast.
   */
  useLocalTime: boolean;
  /** Manual sunrise, minutes after local midnight (null = astronomical). */
  sunrise?: number | null;
  /** Manual sunset, minutes after local midnight (null = astronomical). */
  sunset?: number | null;
}

export interface SunState {
  altitude: number;
  azimuth: number;
  hourAngle: number;
  /** Before solar noon. */
  rising: boolean;
  noonAltitude: number;
  midnightAltitude: number;
  declination: number;
  model: 'astronomical' | 'manual';
}

export interface Sky {
  sun: SunState;
  moon: MoonPosition;
  /** The instant actually evaluated, after the time-zone mapping. */
  sceneTime: number;
  /** 1..366, for seasonal tints. */
  dayOfYear: number;
  /** Local sidereal time in degrees, for turning the stars. */
  siderealTime: number;
  latitude: number;
}

export const DEFAULT_SKY: SkyOptions = { ...SHONAN, useLocalTime: true };

/** Standard (non-DST) UTC offset of this machine, in minutes east of UTC. */
export function standardOffsetMinutes(d: Date): number {
  const y = d.getFullYear();
  return -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
}

/** The nominal time zone of a longitude (Shonan: +9 h). */
export function nominalOffsetMinutes(longitude: number): number {
  return Math.round(longitude / 15) * 60;
}

/** Milliseconds added to "now" so the coast's clock matches yours. */
export function timeShift(now: Date, opts: SkyOptions): number {
  if (!opts.useLocalTime) return 0;
  return (standardOffsetMinutes(now) - nominalOffsetMinutes(opts.longitude)) * 60_000;
}

export function dayOfYear(ms: number): number {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((ms - start) / 86_400_000) + 1;
}

export function skyAt(now: Date, opts: SkyOptions = DEFAULT_SKY): Sky {
  const sceneTime = now.getTime() + timeShift(now, opts);
  const pos = sunPosition(sceneTime, opts.latitude, opts.longitude);
  const ext = dailyExtremes(pos.declination, opts.latitude);

  let sun: SunState;
  const manual = opts.sunrise != null || opts.sunset != null;
  if (manual) {
    sun = manualSun(now, opts, pos.declination, pos.equationOfTime, ext.noon);
  } else {
    sun = {
      altitude: pos.altitude,
      azimuth: pos.azimuth,
      hourAngle: pos.hourAngle,
      rising: pos.hourAngle < 0,
      noonAltitude: ext.noon,
      midnightAltitude: ext.midnight,
      declination: pos.declination,
      model: 'astronomical',
    };
  }
  // The moon and stars keep their real places relative to the sun: with a
  // manual sun curve they are shifted by the same amount the sun was.
  const skyTime = sceneTime + (wrap180(sun.hourAngle - pos.hourAngle) / 15) * 3_600_000;
  const moon = moonPosition(skyTime, opts.latitude, opts.longitude);
  return {
    sun,
    moon,
    sceneTime,
    dayOfYear: dayOfYear(sceneTime),
    siderealTime: siderealTime(skyTime, opts.longitude),
    latitude: opts.latitude,
  };
}

/**
 * A sun that rises and sets exactly at the configured wall-clock times:
 * altitude = B + A·cos(H), with A and B chosen so the curve crosses the
 * horizon at sunrise/sunset and peaks at the coast's real noon altitude
 * for today (so seasons still feel right).
 */
function manualSun(
  now: Date,
  opts: SkyOptions,
  declination: number,
  equationOfTime: number,
  realNoonAltitude: number,
): SunState {
  const minutes = wallMinutes(now, opts);

  // Solar noon on the same wall clock, used when only one time is given.
  const dst = opts.useLocalTime ? -now.getTimezoneOffset() - standardOffsetMinutes(now) : 0;
  const astroNoon = 720 - equationOfTime - 4 * opts.longitude + nominalOffsetMinutes(opts.longitude) + dst;

  const rise = opts.sunrise ?? 2 * astroNoon - (opts.sunset as number);
  let set = opts.sunset ?? 2 * astroNoon - (opts.sunrise as number);
  if (set <= rise) set += 1440;
  const noon = (rise + set) / 2;

  const halfDayDeg = clamp(((set - noon) / 4), 15, 165); // 1 minute = 0.25°
  const peak = Math.max(10, realNoonAltitude);
  const A = (peak - HORIZON) / (1 - Math.cos(halfDayDeg * (Math.PI / 180)));
  const B = peak - A;

  const hourAngle = wrap180((minutes - noon) * 0.25);
  const altitude = Math.max(-90, B + A * Math.cos(hourAngle * (Math.PI / 180)));
  const { azimuth } = horizontal(hourAngle, declination, opts.latitude);

  return {
    altitude,
    azimuth,
    hourAngle,
    rising: hourAngle < 0,
    noonAltitude: peak,
    midnightAltitude: Math.max(-90, B - A),
    declination,
    model: 'manual',
  };
}

/** Minutes after midnight on the clock that manual times are written in. */
function wallMinutes(now: Date, opts: SkyOptions): number {
  if (opts.useLocalTime) return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const t = now.getTime() + nominalOffsetMinutes(opts.longitude) * 60_000;
  return (((t / 60_000) % 1440) + 1440) % 1440;
}

/** Today's sunrise and sunset on the user's clock, for display. */
export function todaysSunTimes(
  now: Date,
  opts: SkyOptions,
): { sunrise: Date | null; sunset: Date | null } {
  if (opts.sunrise != null || opts.sunset != null) {
    const at = (m: number | null | undefined) => {
      if (m == null) return null;
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return new Date(d.getTime() + m * 60_000);
    };
    return { sunrise: at(opts.sunrise), sunset: at(opts.sunset) };
  }
  const shift = timeShift(now, opts);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const ev = sunEvents(midnight.getTime() + shift, opts.latitude, opts.longitude);
  const back = (t: number | null) => (t === null ? null : new Date(t - shift));
  return { sunrise: back(ev.sunrise), sunset: back(ev.sunset) };
}

/** "05:47" → 347. Empty or invalid → null. */
export function parseClock(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
