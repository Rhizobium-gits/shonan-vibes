import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import {
  BASE,
  DEFAULT_ATMOSPHERE,
  DEFAULT_SKY,
  computeAtmosphere,
  contrast,
  dayPhase,
  deltaE,
  fromHex,
  lch,
  skyAt,
  staticAtmosphere,
  sunPosition,
  toHex,
  todaysSunTimes,
} from '../src/engine';

const JST = (iso: string) => new Date(`${iso}+09:00`);
const SHONAN_REAL = { ...DEFAULT_SKY, useLocalTime: false };
const DAYS = ['2026-03-20', '2026-06-21', '2026-10-15', '2026-12-21'];

function minutesOf(day: string, step: number): Date[] {
  const out: Date[] = [];
  const start = JST(`${day}T00:00:00`).getTime();
  for (let m = 0; m < 1440; m += step) out.push(new Date(start + m * 60_000));
  return out;
}

describe('color', () => {
  it('round-trips hex through OKLab', () => {
    for (const hex of ['#000000', '#ffffff', '#0d121b', '#c7dbea', '#f8c9a3', '#123456']) {
      assert.equal(toHex(fromHex(hex)!.color), hex);
    }
  });

  it('measures WCAG contrast', () => {
    assert.ok(Math.abs(contrast(fromHex('#000')!.color, fromHex('#fff')!.color) - 21) < 0.01);
  });

  it('keeps authored colors inside sRGB', () => {
    assert.match(toHex(lch(0.7, 0.4, 30)), /^#[0-9a-f]{6}$/);
  });
});

describe('sun', () => {
  it('rises and sets over Shonan at the right minutes', () => {
    // 2026-10-15, Enoshima: hand-computed 05:48 / 17:07 JST (NOAA method).
    const t = todaysSunTimes(JST('2026-10-15T12:00:00'), SHONAN_REAL);
    const minute = (d: Date | null) => (d ? (d.getTime() - JST('2026-10-15T00:00:00').getTime()) / 60_000 : NaN);
    assert.ok(Math.abs(minute(t.sunrise) - (5 * 60 + 48)) <= 2, `sunrise ${t.sunrise?.toISOString()}`);
    assert.ok(Math.abs(minute(t.sunset) - (17 * 60 + 7)) <= 2, `sunset ${t.sunset?.toISOString()}`);
  });

  it('stands high at the summer solstice noon', () => {
    const noon = sunPosition(JST('2026-06-21T11:40:00').getTime(), 35.2995, 139.48);
    assert.ok(Math.abs(noon.altitude - 78.1) < 0.5, `${noon.altitude}`);
    assert.ok(Math.abs(noon.azimuth - 180) < 15);
  });

  it('honors manual sunrise and sunset', () => {
    const opts = { ...DEFAULT_SKY, sunrise: 6 * 60, sunset: 18 * 60 + 30 };
    const at = (h: number, m: number) => {
      const d = new Date(2026, 9, 15, h, m);
      return skyAt(d, opts).sun.altitude;
    };
    assert.ok(Math.abs(at(6, 0) - -0.833) < 0.05);
    assert.ok(Math.abs(at(18, 30) - -0.833) < 0.05);
    assert.ok(at(12, 15) > 40);
  });

  it('maps altitude to a continuous day circle', () => {
    for (const day of DAYS) {
      let prev: number | null = null;
      for (const d of minutesOf(day, 1)) {
        const p = dayPhase(skyAt(d, SHONAN_REAL).sun);
        assert.ok(p >= 0 && p <= 1);
        if (prev !== null) {
          let step = Math.abs(p - prev);
          step = Math.min(step, 1 - step); // midnight wraps 1 → 0
          assert.ok(step < 0.01, `phase jump ${step} at ${d.toISOString()}`);
        }
        prev = p;
      }
    }
  });
});

describe('atmosphere', () => {
  it('never jumps: each minute changes every color by less than half a JND', () => {
    for (const intensity of [1, 0.5]) {
      for (const day of DAYS) {
        let prev: ReturnType<typeof computeAtmosphere> | null = null;
        for (const d of minutesOf(day, 1)) {
          const a = computeAtmosphere(skyAt(d, SHONAN_REAL), { ...DEFAULT_ATMOSPHERE, intensity });
          if (prev) {
            for (const k of Object.keys(a.palette) as (keyof typeof a.palette)[]) {
              const step = deltaE(a.palette[k], prev.palette[k]);
              // Scene colors (Shoreline only) move faster at sunset; editor colors stay calm.
              const limit = ['zenith', 'horizon', 'ocean', 'beach'].includes(k) ? 0.02 : 0.01;
              assert.ok(step < limit, `${k} jumped ${step.toFixed(4)} at ${d.toISOString()}`);
            }
          }
          prev = a;
        }
      }
    }
  });

  it('keeps code readable at every hour, for any settings', () => {
    const variants = [
      DEFAULT_ATMOSPHERE,
      { ...DEFAULT_ATMOSPHERE, nightDarkness: 0, oceanSaturation: 1.5 },
      { ...DEFAULT_ATMOSPHERE, nightDarkness: 1, oceanSaturation: 0, cloudCover: 1 },
      { ...DEFAULT_ATMOSPHERE, intensity: 0.5 },
    ];
    const minimum: Record<string, number> = {
      text: 9,
      comment: 4.5,
      keyword: 6,
      func: 6,
      string: 6,
      number: 5.5,
      type: 6.5,
      param: 7,
      property: 7,
      punct: 5,
      operator: 5,
      escape: 6,
    };
    for (const opts of variants) {
      for (const day of DAYS) {
        for (const d of minutesOf(day, 10)) {
          const p = computeAtmosphere(skyAt(d, SHONAN_REAL), opts).palette;
          for (const [role, min] of Object.entries(minimum)) {
            const c = contrast(p[role as keyof typeof p], p.room);
            assert.ok(c >= min - 0.05, `${role} ${c.toFixed(2)} < ${min} at ${d.toISOString()}`);
          }
        }
      }
    }
  });

  it('keeps the main syntax roles apart all day', () => {
    const roles = ['keyword', 'func', 'string', 'number', 'type'] as const;
    for (const day of DAYS) {
      for (const d of minutesOf(day, 5)) {
        const p = computeAtmosphere(skyAt(d, SHONAN_REAL)).palette;
        for (let i = 0; i < roles.length; i++) {
          for (let j = i + 1; j < roles.length; j++) {
            const sep = deltaE(p[roles[i]], p[roles[j]]);
            assert.ok(sep >= 0.05, `${roles[i]}/${roles[j]} only ${sep.toFixed(3)} apart at ${d.toISOString()}`);
          }
        }
      }
    }
  });

  it('stays dark: the editor background is never a light theme', () => {
    for (const day of DAYS) {
      for (const d of minutesOf(day, 15)) {
        const room = computeAtmosphere(skyAt(d, SHONAN_REAL), { ...DEFAULT_ATMOSPHERE, nightDarkness: 0 }).palette.room;
        assert.ok(room.L < 0.32, `room L ${room.L} at ${d.toISOString()}`);
      }
    }
  });

  it('intensity 0 is the static theme at any hour', () => {
    const still = staticAtmosphere().palette;
    for (const d of minutesOf('2026-10-15', 120)) {
      const p = computeAtmosphere(skyAt(d, SHONAN_REAL), { ...DEFAULT_ATMOSPHERE, intensity: 0 }).palette;
      for (const k of Object.keys(still) as (keyof typeof still)[]) assert.equal(toHex(p[k]), toHex(still[k]));
    }
    assert.equal(toHex(staticAtmosphere().palette.room), toHex(BASE.room));
  });

  it('follows the day: night, sunrise, noon and sunset look different', () => {
    const at = (iso: string) => computeAtmosphere(skyAt(JST(iso), SHONAN_REAL));
    assert.equal(at('2026-10-15T02:00:00').phaseName.includes('night'), true);
    assert.equal(at('2026-10-15T05:50:00').phaseName, 'Sunrise');
    assert.equal(at('2026-10-15T11:30:00').phaseName, 'Day');
    assert.equal(at('2026-10-15T17:05:00').phaseName, 'Sunset');
    const noon = at('2026-10-15T11:30:00').palette.room;
    const night = at('2026-10-15T02:00:00').palette.room;
    assert.ok(noon.L > night.L + 0.05);
  });

  it('survives polar skies without NaN', () => {
    for (const latitude of [69.6, -77.8, 89.9]) {
      for (const day of ['2026-06-21', '2026-12-21']) {
        for (const d of minutesOf(day, 30)) {
          const a = computeAtmosphere(skyAt(d, { ...SHONAN_REAL, latitude, longitude: 18.9 }));
          assert.ok(Number.isFinite(a.phase));
          assert.match(toHex(a.palette.room), /^#[0-9a-f]{6}$/);
        }
      }
    }
  });
});
