/**
 * Where the sun (and, roughly, the moon) is.
 *
 * The sun follows the NOAA Solar Calculator algorithm (Meeus, "Astronomical
 * Algorithms"), accurate to well under a minute of sunrise/sunset time for
 * the years anyone will be coding in. No network, no tables.
 *
 * The moon follows a low-precision lunar theory (the main terms of the
 * moon's longitude, latitude and distance, as in Meeus and suncalc), good to
 * well under a degree: it rises, crosses the sky and sets on the right day
 * and hour, with its real phase and the real tilt of its lit side. It only
 * decorates the Shoreline view; colors never depend on it.
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
  /** Degrees above the horizon, as seen from the surface (parallax, refraction). */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number;
  /** Illuminated fraction of the disc, 0..1. */
  illumination: number;
  /** Angular distance from the sun, degrees. */
  elongation: number;
  /**
   * Direction of the bright limb as the observer sees it: degrees
   * anticlockwise from straight up (the lit side always faces the sun).
   */
  limb: number;
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

const OBLIQUITY = 23.4397 * RAD;

function toEquatorial(l: number, b: number): { ra: number; dec: number } {
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l)),
    dec: Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l)),
  };
}

/** Local sidereal time in degrees: how far the sky has turned. */
export function siderealTime(ms: number, longitude: number): number {
  const d = julianDay(ms) - 2451545;
  return (((280.16 + 360.9856235 * d + longitude) % 360) + 360) % 360;
}

function sunEquatorial(d: number): { ra: number; dec: number } {
  const M = (357.5291 + 0.98560028 * d) * RAD;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  return toEquatorial(M + C + 102.9372 * RAD + Math.PI, 0);
}

function moonEquatorial(d: number): { ra: number; dec: number; dist: number } {
  const L = (218.316 + 13.176396 * d) * RAD; // mean longitude
  const M = (134.963 + 13.064993 * d) * RAD; // mean anomaly
  const F = (93.272 + 13.22935 * d) * RAD; // mean distance from the node
  const lon = L + 6.289 * RAD * Math.sin(M);
  const lat = 5.128 * RAD * Math.sin(F);
  return { ...toEquatorial(lon, lat), dist: 385001 - 20905 * Math.cos(M) };
}

function refraction(h: number): number {
  const a = Math.max(h, 0);
  return 0.0002967 / Math.tan(a + 0.00312536 / (a + 0.08901179));
}

export function moonPosition(ms: number, latitude: number, longitude: number): MoonPosition {
  const d = julianDay(ms) - 2451545;
  const m = moonEquatorial(d);
  const s = sunEquatorial(d);
  const phi = latitude * RAD;
  const H = siderealTime(ms, longitude) * RAD - m.ra;

  let alt = Math.asin(Math.sin(phi) * Math.sin(m.dec) + Math.cos(phi) * Math.cos(m.dec) * Math.cos(H));
  alt -= Math.asin(6378.14 / m.dist) * Math.cos(alt); // seen from the surface, not the earth's center
  alt += refraction(alt);
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(m.dec) * Math.cos(phi)) / RAD + 180;
  const parallactic = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(m.dec) - Math.sin(m.dec) * Math.cos(H));

  const cosEl =
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra);
  const el = Math.acos(Math.max(-1, Math.min(1, cosEl)));
  const SUN_DIST = 149598000;
  const inc = Math.atan2(SUN_DIST * Math.sin(el), m.dist - SUN_DIST * Math.cos(el));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return {
    altitude: alt / RAD,
    azimuth: ((az % 360) + 360) % 360,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    illumination: (1 + Math.cos(inc)) / 2,
    elongation: el / RAD,
    limb: (angle - parallactic) / RAD,
  };
}

/** Apparent altitude of the moon's center when its upper limb touches the horizon. */
const MOON_HORIZON = -0.26;

/**
 * Moonrise, the moon's highest point (meridian transit) and moonset within
 * [startMs, startMs + 24h). They come about 50 minutes later each day, so on
 * some days one of them falls outside the window and is null.
 */
export function moonEvents(
  startMs: number,
  latitude: number,
  longitude: number,
): { rise: number | null; transit: number | null; set: number | null } {
  const step = 10 * 60_000;
  const alt = (t: number) => moonPosition(t, latitude, longitude).altitude;
  const f = (t: number) => alt(t) - MOON_HORIZON;
  let rise: number | null = null;
  let set: number | null = null;
  let best = -Infinity;
  let bestT = startMs;
  let prevT = startMs;
  let prev = f(prevT);
  for (let t = startMs; t <= startMs + DAY_MS; t += step) {
    const cur = f(t);
    if (cur > best) {
      best = cur;
      bestT = t;
    }
    if (t > startMs) {
      if (prev < 0 && cur >= 0 && rise === null) rise = bisect(f, prevT, t);
      if (prev >= 0 && cur < 0 && set === null) set = bisect(f, prevT, t);
    }
    prevT = t;
    prev = cur;
  }
  // The highest point is a transit only if the moon was still climbing before
  // it and sinking after it inside the window; refine it to the minute.
  let transit: number | null = null;
  if (bestT > startMs && bestT < startMs + DAY_MS) {
    let a = bestT - step;
    let b = bestT + step;
    for (let i = 0; i < 30; i++) {
      const m1 = a + (b - a) / 3;
      const m2 = b - (b - a) / 3;
      if (alt(m1) < alt(m2)) a = m1;
      else b = m2;
    }
    transit = (a + b) / 2;
  }
  return { rise, transit, set };
}

export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
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
