/**
 * Where the sun (and, roughly, the moon) is.
 *
 * The sun follows the NOAA Solar Calculator algorithm (Meeus, "Astronomical
 * Algorithms"), accurate to well under a minute of sunrise/sunset time for
 * the years anyone will be coding in. No network, no tables.
 *
 * The moon is a deliberately light approximation (phase from the synodic
 * month, position from the phase angle). It only decorates the Shoreline
 * view; colors never depend on it.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

/** Altitude of the sun's center at sunrise/sunset (refraction + radius). */
export const HORIZON = -0.833;

export interface SunPosition {
  /** Degrees above the horizon (negative below). */
  altitude: number;
  /** Degrees clockwise from north (90 = east, 180 = south, 270 = west). */
  azimuth: number;
  /** Degrees, -180..180. Negative before solar noon, positive after. */
  hourAngle: number;
  /** Solar declination in degrees. */
  declination: number;
  /** Equation of time in minutes (apparent minus mean solar time). */
  equationOfTime: number;
}

export interface MoonPosition {
  altitude: number;
  azimuth: number;
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number;
  /** Illuminated fraction of the disc, 0..1. */
  illumination: number;
}

export function julianDay(ms: number): number {
  return ms / DAY_MS + 2440587.5;
}

export function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export function sunPosition(ms: number, latitude: number, longitude: number): SunPosition {
  const T = (julianDay(ms) - 2451545) / 36525;

  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);

  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;

  const y = Math.tan((eps / 2) * RAD) ** 2;
  const equationOfTime =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));

  const utcMinutes = ((ms % DAY_MS) + DAY_MS) % DAY_MS / 60_000;
  const trueSolarMinutes = utcMinutes + equationOfTime + 4 * longitude;
  const hourAngle = wrap180(trueSolarMinutes / 4 - 180);

  const { altitude, azimuth } = horizontal(hourAngle, declination, latitude);
  return { altitude, azimuth, hourAngle, declination, equationOfTime };
}

/** Altitude/azimuth of a body from its hour angle and declination. */
export function horizontal(
  hourAngle: number,
  declination: number,
  latitude: number,
): { altitude: number; azimuth: number } {
  const H = hourAngle * RAD;
  const d = declination * RAD;
  const p = latitude * RAD;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(d) * Math.cos(p)) / RAD + 180;
  return { altitude, azimuth: ((az % 360) + 360) % 360 };
}

/** Highest (solar noon) and lowest (solar midnight) altitude for a declination. */
export function dailyExtremes(declination: number, latitude: number): { noon: number; midnight: number } {
  return {
    noon: 90 - Math.abs(latitude - declination),
    midnight: Math.abs(latitude + declination) - 90,
  };
}

export function moonPhase(ms: number): number {
  const p = (julianDay(ms) - 2451550.1) / 29.530588853;
  return p - Math.floor(p);
}

/**
 * Approximate moon: it trails the sun by `phase` of a day and sits roughly
 * opposite the sun's declination when full. Good to a few degrees, which is
 * all a sixteen-pixel moon needs.
 */
export function moonPosition(ms: number, latitude: number, sun: SunPosition): MoonPosition {
  const phase = moonPhase(ms);
  const hourAngle = wrap180(sun.hourAngle - 360 * phase);
  const declination = sun.declination * Math.cos(2 * Math.PI * phase);
  const { altitude, azimuth } = horizontal(hourAngle, declination, latitude);
  return { altitude, azimuth, phase, illumination: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
}

/**
 * Sunrise, solar noon and sunset within [startMs, startMs + 24h), found by
 * scanning and bisection. Either event can be null (polar day or night).
 */
export function sunEvents(
  startMs: number,
  latitude: number,
  longitude: number,
): { sunrise: number | null; sunset: number | null; noon: number } {
  const step = 10 * 60_000;
  const f = (t: number) => sunPosition(t, latitude, longitude).altitude - HORIZON;
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let noon = startMs;
  let best = -Infinity;
  let prevT = startMs;
  let prev = f(prevT);
  for (let t = startMs + step; t <= startMs + DAY_MS; t += step) {
    const cur = f(t);
    if (cur > best) {
      best = cur;
      noon = t;
    }
    if (prev < 0 && cur >= 0 && sunrise === null) sunrise = bisect(f, prevT, t);
    if (prev >= 0 && cur < 0 && sunset === null) sunset = bisect(f, prevT, t);
    prevT = t;
    prev = cur;
  }
  return { sunrise, sunset, noon };
}

function bisect(f: (t: number) => number, a: number, b: number): number {
  const rising = f(a) < f(b);
  for (let i = 0; i < 20; i++) {
    const m = (a + b) / 2;
    if (f(m) < 0 === rising) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
