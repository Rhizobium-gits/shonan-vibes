// Shoreline: a pixel-art Shonan coast that follows the editor's light.
// Seen from Koshigoe on the Kamakura side, after a photograph by the author:
// Enoshima and Fuji across the water, the Koshigoe shore on the right,
// concrete breakwaters in front.
// Plain script, no dependencies. Renders on demand; the optional shimmer is a
// one-frame-per-second redraw that stops whenever the view is hidden.
(function () {
  'use strict';

  const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const mode = document.body.dataset.mode || 'view';
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let frame = null; // what is drawn
  let live = null; // the latest frame from the extension
  let day = null; // today's frames (panel mode)
  let motion = true;
  let held = false;
  let previewing = false; // the user is scrubbing to another hour
  let tick = 0;
  let timer = null;

  // ------------------------------------------------------------------------
  // Color helpers
  // ------------------------------------------------------------------------

  function rgb(hex) {
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function lift(c, k) {
    return mix(c, [255, 255, 255], k);
  }
  function dim(c, k) {
    return mix(c, [0, 0, 0], k);
  }
  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  function lerpHex(a, b, t) {
    const c = mix(rgb(a), rgb(b), t);
    return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  function lerpFrame(a, b, t) {
    const out = JSON.parse(JSON.stringify(a));
    for (const group of ['colors', 'scene']) {
      for (const k of Object.keys(a[group])) out[group][k] = lerpHex(a[group][k], b[group][k], t);
    }
    const lerp = (x, y) => x + (y - x) * t;
    const turn = (x, y) => x + ((((y - x) % 360) + 540) % 360 - 180) * t; // the short way round
    out.nightness = lerp(a.nightness, b.nightness);
    out.sun.altitude = lerp(a.sun.altitude, b.sun.altitude);
    out.sun.azimuth = turn(a.sun.azimuth, b.sun.azimuth);
    out.moon.altitude = lerp(a.moon.altitude, b.moon.altitude);
    out.moon.azimuth = turn(a.moon.azimuth, b.moon.azimuth);
    out.moon.limb = turn(a.moon.limb, b.moon.limb);
    out.moon.elongation = lerp(a.moon.elongation, b.moon.elongation);
    out.moon.illumination = lerp(a.moon.illumination, b.moon.illumination);
    out.stars.siderealTime = turn(a.stars.siderealTime, b.stars.siderealTime);
    return out;
  }

  // Deterministic randomness so the coast is the same every time.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function hash(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // 4×4 ordered dither: gradients become soft pixel bands.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function dither(x, y) {
    return BAYER[(y & 3) * 4 + (x & 3)];
  }

  // ------------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------------

  // Square pixels, about 480 across, sized by the panel's width. A taller
  // panel never stretches the picture; the extra rows become sky (layout()).
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const across = mode === 'panel' ? 512 : 480;
    const px = Math.max(rect.width / across, rect.height / 900);
    const W = Math.max(1, Math.round(rect.width / px));
    const H = Math.max(12, Math.round(rect.height / px));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    return true;
  }

  // The ground keeps its height: open sea, the breaking wave, wet sand that
  // mirrors the sky, dry sand. The sky takes everything above. Measured in
  // units of a 240-wide scene; only very short panels shrink it all (fit < 1).
  const SEA = 13;
  const SURF = 9;
  const WET = 5;
  const DRY = 8;
  const MIN_SKY = 30;
  function layout(W, H) {
    const k = W / 240;
    const fit = Math.min(1, H / ((SEA + SURF + WET + DRY + MIN_SKY) * k));
    const u = k * fit;
    const dryY = H - Math.round(DRY * u);
    const wetY = dryY - Math.round(WET * u);
    const surfY = wetY - Math.round(SURF * u);
    const horizonY = surfY - Math.round(SEA * u);
    return { horizonY, surfY, wetY, dryY, k, u };
  }

  // A panorama from the beach at Koshigoe, east on the left to north-west on
  // the right (azimuth 55°–345°), so the whole day is in view: the sun and
  // moon rise over the Miura peninsula, cross the open sea to the south and
  // set by Enoshima, Fuji and Hakone, or over the Koshigoe hills in summer.
  // Landmarks sit at their true bearings from the beach.
  const VIEW_CENTER = 200;
  const VIEW_HALF = 145;
  function azimuthX(az, W) {
    const d = ((((az - VIEW_CENTER) % 360) + 540) % 360) - 180;
    return W / 2 + (d / VIEW_HALF) * (W / 2);
  }
  function altitudeY(alt, horizonY, u) {
    return horizonY - 1 - Math.pow(clamp01(alt / 70), 0.75) * (horizonY - 6 * u);
  }

  // ------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------

  const WARM_LIGHT = [255, 206, 140];
  const RAD = Math.PI / 180;
  const STAR_COUNT = 520;

  function draw() {
    if (!frame || !resize()) return;
    const W = canvas.width;
    const H = canvas.height;
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const set = (x, y, c) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    };
    const blend = (x, y, c, a) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
      const i = (y * W + x) * 4;
      const t = clamp01(a);
      data[i] += (c[0] - data[i]) * t;
      data[i + 1] += (c[1] - data[i + 1]) * t;
      data[i + 2] += (c[2] - data[i + 2]) * t;
    };

    const s = frame.scene;
    const zenith = rgb(s.zenith);
    const horizonSky = rgb(s.horizon);
    const ocean = rgb(s.ocean);
    const beach = rgb(s.beach);
    const glow = rgb(s.glow);
    const night = clamp01(frame.nightness);
    const alt = frame.sun.altitude;
    const daylight = clamp01((alt + 2) / 27);
    // Warm, low light around sunrise and sunset (also just after the sun is down).
    const lowWarm = clamp01(1 - Math.abs(alt - 1) / 11);
    const clouds = clamp01(frame.cloudCover || 0);
    const t = motion && !reduceMotion.matches ? tick : 0;
    const { horizonY, surfY, wetY, dryY, k, u } = layout(W, H);

    const sunUp = alt > -1.5;
    const sunX = azimuthX(frame.sun.azimuth, W);
    const sunY = altitudeY(alt, horizonY, u);
    const moonUp = frame.moon.altitude > -1 && frame.moon.illumination > 0.02;
    const moonX = azimuthX(frame.moon.azimuth, W);
    const moonY = altitudeY(frame.moon.altitude, horizonY, u);
    const lowSun = sunUp ? 1 - clamp01(alt / 35) : 0;

    // --- Sky: dithered bands from zenith to horizon, a halo around the sun
    const BANDS = Math.max(10, Math.round(horizonY / (3 * k)));
    const haloStrength = 0.55 * Math.max(lowSun, alt < 0 ? clamp01(1 + alt / 10) : 0);
    for (let y = 0; y < horizonY; y++) {
      const v = Math.pow(y / Math.max(1, horizonY - 1), 1.45) * BANDS;
      for (let x = 0; x < W; x++) {
        const lo = Math.floor(v);
        const band = v - lo > dither(x, y) ? lo + 1 : lo;
        let c = mix(zenith, horizonSky, Math.min(1, band / BANDS));
        if (haloStrength > 0) {
          const dx = (x - sunX) / (W * 0.32);
          const dy = (y - Math.max(sunY, horizonY - 2 * u)) / (W * 0.16);
          const w = Math.pow(clamp01(1 - Math.sqrt(dx * dx + dy * dy)), 2) * haloStrength;
          if (w > 0) c = mix(c, glow, Math.floor(w * 6 + dither(x, y)) / 6);
        }
        set(x, y, c);
      }
    }

    // --- Stars
    // A fixed starfield on the celestial sphere, turned by the sidereal time:
    // stars rise on the left, wheel across the south and set on the right.
    if (night > 0.05) {
      const r = rng(7);
      const star = [222, 230, 242];
      const lat = frame.stars.latitude * RAD;
      const lst = frame.stars.siderealTime;
      for (let i = 0; i < STAR_COUNT; i++) {
        const ra = r() * 360;
        const dec = Math.asin(r() * 1.8 - 0.8);
        const b = 0.15 + Math.pow(r(), 2.2) * 0.65;
        const H = (lst - ra) * RAD;
        const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
        const sAlt = Math.asin(sinAlt) / RAD;
        if (sAlt <= 0.5) continue;
        const sAz = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) / RAD + 180;
        const x = azimuthX(sAz, W);
        if (x < 0 || x >= W) continue;
        const y = altitudeY(sAlt, horizonY, u);
        const haze = clamp01(sAlt / 12);
        const twinkle = t && hash(i, 1, Math.floor(t / 3)) < 0.12 ? 0.45 : 1;
        blend(x, y, star, b * night * haze * (1 - clouds * 0.8) * twinkle);
      }
    }

    // --- Moon: real phase, its lit side turned toward the sun. By day it is a
    // faint ghost (as the real daytime moon is); near new moon, or close to
    // the sun, it cannot be seen at all.
    if (moonUp) {
      const rad = 4.2 * k;
      const m = frame.moon;
      const limb = m.limb * RAD;
      const bx = -Math.sin(limb); // bright-limb direction on screen (y down)
      const by = -Math.cos(limb);
      const threshold = 1 - 2 * m.illumination;
      const moonLight = [236, 240, 246];
      const skyBright = clamp01((alt + 6) / 14);
      const glare = clamp01((m.elongation - 10) / 12);
      const vis = glare * (0.12 + 0.88 * (1 - skyBright));
      const R = Math.ceil(rad) + 1;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const along = dx * bx + dy * by;
          const across = -dx * by + dy * bx;
          const half = Math.sqrt(Math.max(0.0001, rad * rad - across * across));
          const lit = along / half > threshold;
          // Earthshine: the dark part is only just there, and only at night.
          if (lit) blend(moonX + dx, moonY + dy, moonLight, vis);
          else blend(moonX + dx, moonY + dy, mix(zenith, moonLight, 0.1), vis * 0.35 * (1 - skyBright));
        }
      }
    }

    // --- Sun
    if (sunUp) {
      const rad = 3.6 * k;
      const core = lift(glow, 0.45);
      const R = Math.ceil(rad + 2 * k);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const rr = dx * dx + dy * dy;
          if (rr <= rad * rad) set(sunX + dx, sunY + dy, core);
          else if (rr <= (rad + 1.5 * k) * (rad + 1.5 * k)) blend(sunX + dx, sunY + dy, glow, 0.35);
        }
      }
    }

    // --- Clouds: long streaks, lit from below when the sun is low
    {
      const n = Math.round((3 + clouds * 6) * Math.max(1, horizonY / (40 * k)));
      const cr = rng(19);
      const lightSide = mix(lift(horizonSky, 0.4), [255, 255, 255], 0.25 * daylight);
      const darkSide = mix(zenith, horizonSky, 0.45);
      const body = mix(darkSide, lightSide, Math.max(daylight, 0.12));
      const rim = mix(body, lift(glow, 0.2), 0.8 * lowWarm);
      const alpha = (0.36 + 0.4 * clouds + 0.15 * lowWarm) * (0.45 + 0.55 * Math.max(daylight, 1 - night));
      for (let i = 0; i < n; i++) {
        const width = (16 + cr() * 34) * k;
        const rows = Math.max(2, Math.round((2 + cr() * 3) * k * 0.75));
        const drift = (frame.minutes || 0) * 0.04 * k + cr() * W;
        const cx = (drift % (W + width * 2)) - width;
        const cy = Math.round(3 * k + cr() * horizonY * 0.62);
        for (let r = 0; r < rows; r++) {
          const f = (r + 0.5) / rows;
          const rowW = width * (0.45 + 0.55 * Math.sin(Math.PI * f)) * (0.75 + 0.5 * hash(i, r, 41));
          const off = (hash(i, r, 43) - 0.5) * width * 0.45;
          const col = r >= rows - Math.max(1, Math.round(k * 0.6)) ? rim : mix(lift(body, 0.08 * daylight), body, f);
          const x0 = Math.round(cx + off - rowW / 2);
          const x1 = Math.round(cx + off + rowW / 2);
          for (let x = x0; x <= x1; x++) {
            const edge = Math.min(x - x0, x1 - x) / (2 * k);
            if (edge < 1 && hash(x, cy + r, 47) > edge) continue; // ragged ends
            blend(x, cy + r, col, alpha);
          }
        }
      }
    }

    // --- Distant land: Izu and Hakone behind Enoshima with Fuji just beyond
    // it (west), and the low Miura peninsula far to the east. Lost in haze by
    // day, a band at dusk.
    const farLand = mix(horizonSky, mix(zenith, ocean, 0.5), 0.3 + 0.45 * (1 - daylight));
    const farAlpha = 0.28 + 0.5 * (1 - daylight * 0.75);
    for (let x = 0; x < W; x++) {
      const v = x / W;
      let h = 0;
      if (v > 0.55 && v < 0.86) {
        h = (1.2 + 0.8 * Math.sin(v * 23 + 0.4) + 0.6 * Math.sin(v * 61)) * u;
        h *= clamp01((v - 0.55) / 0.04) * clamp01((0.86 - v) / 0.03);
        const fuji = Math.max(0, 1 - Math.abs(v - 0.776) / 0.055);
        if (fuji > 0) h = Math.max(h, (Math.pow(fuji, 1.25) * 8 + 1) * u);
      }
      if (v < 0.24) h = Math.max(h, (0.9 + 0.6 * Math.sin(v * 40) + 0.4 * Math.sin(v * 97)) * u * clamp01((0.24 - v) / 0.05));
      for (let y = 0; y < h; y++) blend(x, horizonY - 1 - y, farLand, farAlpha);
    }

    // --- Open sea: calm and silvery, mirroring the sky, with fine ripples
    const seaTop = mix(ocean, horizonSky, 0.5);
    const seaLow = mix(dim(ocean, 0.15), horizonSky, 0.16);
    for (let y = horizonY; y < surfY; y++) {
      const v = (y - horizonY) / Math.max(1, surfY - horizonY);
      const row = mix(seaTop, seaLow, Math.pow(v, 0.75));
      const period = Math.max(2, Math.round(2 + v * 3 * k));
      const banded = (y - horizonY) % period === period - 1 ? dim(row, 0.03) : row;
      for (let x = 0; x < W; x++) set(x, y, banded);
    }
    for (let x = 0; x < W; x++) blend(x, horizonY, lift(horizonSky, 0.12), 0.5);
    const fleck = mix(seaTop, lift(horizonSky, 0.2), 0.5);
    for (let y = horizonY + 1; y < surfY; y++) {
      const v = (y - horizonY) / Math.max(1, surfY - horizonY);
      const offset = Math.floor(t * (0.4 + v * 1.2) * k);
      const density = 0.015 + 0.05 * v;
      for (let x = 0; x < W; x++) {
        if (hash(x + offset, y, 3) < density) {
          const len = Math.round((2 + hash(x, y, 5) * (2 + v * 5)) * k);
          for (let j = 0; j < len; j++) blend(x + j, y, fleck, 0.22 + 0.22 * v);
        }
      }
    }

    // --- Enoshima as it is usually seen from the Kamakura side (traced from
    // several photographs): a sheer cliff on the left with a rounded shoulder,
    // a broad wooded crown, the Sea Candle about two thirds across, a long
    // slope to the right ending in a small wooded hump, and flat land at both
    // ends: the yacht harbor breakwater with its little white lighthouse on the
    // left, the bridge to the mainland on the right.
    // Lights come on as the sun goes down, fully by 6° below the horizon.
    const lights = clamp01(Math.max(night * 1.3, (4 - alt) / 10));
    const pulse = t ? (Math.floor(t / 2) % 3 === 0 ? 1 : 0.6) : 0.85;
    const silhouette = clamp01(1 - daylight * 1.2); // 0 by day, 1 from sunset on
    const duskIsle = mix(mix(lift(mix(ocean, zenith, 0.5), 0.05), [12, 14, 26], 0.45), [12, 14, 26], 0.4 * night);
    const byDay = (c, haze) => mix(mix(c, horizonSky, haze), duskIsle, silhouette);
    const isle = byDay([44, 76, 56], 0.3); // deep green woods, softened by distance
    const canopyLit = mix(byDay([82, 118, 80], 0.28), lift(glow, 0.1), 0.18 * lowWarm);
    const rock = byDay([124, 112, 98], 0.3);
    const whiteWall = byDay([216, 212, 200], 0.28);
    const ix0 = Math.round(W * 0.6);
    const ix1 = Math.round(W * 0.75);
    const coastX = Math.round(W * 0.835);
    const bw = ix1 - ix0;
    const harborX = ix0 - Math.round(bw * 0.32);
    const top = 6.6 * u;
    // A gently domed crown, highest left of center, easing down to the right.
    const PROFILE = [
      [0, 0.04], [0.012, 0.3], [0.022, 0.58], [0.035, 0.76], [0.055, 0.88], [0.08, 0.94], [0.13, 0.98],
      [0.22, 1], [0.33, 1], [0.44, 0.97], [0.54, 0.93], [0.63, 0.89], [0.7, 0.82], [0.76, 0.68],
      [0.81, 0.53], [0.845, 0.39], [0.865, 0.32], [0.89, 0.42], [0.915, 0.48], [0.94, 0.46], [0.965, 0.34],
      [0.985, 0.15], [1, 0.05],
    ];
    const profile = (v) => {
      for (let i = 0; i < PROFILE.length - 1; i++) {
        const [a, ha] = PROFILE[i];
        const [b, hb] = PROFILE[i + 1];
        if (v >= a && v <= b) return ha + ((hb - ha) * (v - a)) / (b - a);
      }
      return 0;
    };
    const heights = [];
    for (let x = ix0; x <= ix1; x++) {
      const v = (x - ix0) / bw;
      const clump = Math.floor(x / Math.max(2, Math.round(2 * k)));
      const bump = v > 0.06 && v < 0.97 ? (hash(clump, 5, 53) - 0.35) * 0.9 * u : 0;
      heights.push(Math.max(1, Math.round(profile(v) * top + bump)));
    }
    heights.forEach((h, i) => {
      const x = ix0 + i;
      const v = i / bw;
      const crown = Math.max(1, Math.round(u * 0.5));
      for (let y = 0; y < h; y++) {
        let c = y >= h - crown ? canopyLit : isle;
        // The bare rock of the cliff face, below its wooded shoulder.
        if (v < 0.06 && y < h * 0.8 && hash(x, y, 167) < 0.85) c = rock;
        set(x, horizonY - 1 - y, c);
      }
    });
    // Small white buildings scattered along the waterline at the island's foot.
    const townWall = mix(whiteWall, isle, 0.3);
    for (let x = ix0 + Math.round(bw * 0.14); x < ix1 - Math.round(bw * 0.03); x++) {
      const block = Math.floor(x / Math.max(2, Math.round(1.6 * k)));
      if (hash(block, 6, 59) > 0.38) continue;
      const bh = Math.max(1, Math.round((0.5 + hash(block, 7, 61) * 0.7) * u));
      for (let y = 0; y < bh; y++) set(x, horizonY - 1 - y, townWall);
    }
    // The yacht harbor on the left (masts, its breakwater and little white
    // lighthouse), and the low land toward the bridge on the right.
    for (let x = harborX; x < coastX; x++) {
      if (x >= ix0 && x <= ix1) continue;
      const h = x < ix0 ? Math.max(1, Math.round(0.45 * u)) : Math.max(1, Math.round(0.5 * u * (1 - (x - ix1) / (coastX - ix1))));
      for (let y = 0; y < h; y++) set(x, horizonY - 1 - y, x < ix0 ? townWall : isle);
      if (x < ix0 && x > harborX + 3 * k && hash(x, 17, 173) < 0.1) {
        for (let y = h; y < h + Math.round(1.4 * u); y++) blend(x, horizonY - 1 - y, whiteWall, 0.4); // masts
      }
    }
    const lhW = Math.max(1, Math.round(0.7 * k));
    const lhH = Math.round(2.4 * u);
    for (let y = 0; y < lhH; y++) for (let x = 0; x < lhW; x++) set(harborX + x, horizonY - 1 - y, lift(whiteWall, 0.08));
    if (lights > 0.05 && Math.floor(t / 3) % 2 === 0) blend(harborX, horizonY - 1 - lhH, [250, 236, 214], 0.8 * lights);

    // The Sea Candle: a slender lattice tower that widens at its observation
    // deck, with the glass lantern on top.
    const tx = Math.round(ix0 + bw * 0.63);
    const baseY = horizonY - 1 - (heights[tx - ix0] || 0);
    // About 60 m on a summit about 60 m high: the visible tower (deck and
    // lantern included) stands about 0.85 of the island's height.
    const towerH = Math.round(3.6 * u);
    const towerCol = byDay([168, 174, 176], 0.32); // an open lattice: grey in the haze, not white
    const bodyW = Math.max(1, Math.round(k));
    for (let y = 0; y < towerH; y++) for (let x = 0; x < bodyW; x++) set(tx - (bodyW >> 1) + x, baseY - y, towerCol);
    const deckW = bodyW + 2;
    for (let x = 0; x < deckW; x++) set(tx - (deckW >> 1) + x, baseY - towerH, towerCol);
    const deckY = baseY - towerH;
    const tw = bodyW;
    const lanternH = Math.max(1, Math.round(1 * k));
    for (let r = 1; r <= lanternH; r++) for (let x = 0; x < tw; x++) set(tx - (tw >> 1) + x, deckY - r, towerCol);
    set(tx, deckY - lanternH - 1, towerCol); // the cap
    if (lights > 0.05) {
      for (let r = 1; r <= lanternH; r++) {
        for (let x = 0; x < tw; x++) blend(tx - (tw >> 1) + x, deckY - r, WARM_LIGHT, lights * pulse);
      }
      const R = Math.ceil(3.2 * k);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy) / (3.2 * k);
          if (d < 1 && d > 0.25) blend(tx + dx, deckY - lanternH / 2 + dy, WARM_LIGHT, 0.2 * lights * pulse * (1 - d));
        }
      }
      // The lit band at the foot of the tower, a few lights on the hillside.
      for (let x = -1; x <= 1; x++) blend(tx + x, baseY - Math.round(0.4 * u), WARM_LIGHT, 0.8 * lights);
      for (let x = ix0 + Math.round(W * 0.02); x < ix1 - Math.round(W * 0.02); x++) {
        if (hash(x, 13, 131) < 0.035) {
          const h = heights[x - ix0];
          blend(x, horizonY - 1 - Math.round(h * (0.35 + 0.4 * hash(x, 14, 137))), [236, 236, 228], 0.7 * lights);
        }
      }
      // Lights along the foot of the island and the causeway, mirrored on the sea.
      for (let x = harborX; x < coastX; x++) {
        const onIsland = x >= ix0 && x <= ix1;
        if (hash(x, 3, 67) > (onIsland ? 0.3 : 0.12)) continue;
        const ly = horizonY - 1 - (onIsland ? Math.floor(hash(x, 4, 71) * 1.6 * u) : 0);
        const on = lights * (0.55 + 0.45 * hash(x, 8, 73));
        blend(x, ly, WARM_LIGHT, on);
        for (let y = horizonY; y < horizonY + 6 * u; y++) {
          if (hash(x, y, 79 + Math.floor(t / 2)) < 0.4) blend(x, y, WARM_LIGHT, on * 0.4 * (1 - (y - horizonY) / (6 * u)));
        }
      }
    }

    // --- Koshigoe on the right: the seawall, the green harbor light,
    // apartment blocks with lit windows, and the hill rising to Kamakura.
    {
      const x0 = coastX;
      // By day: wooded hill, white-beige blocks, grey seawall, a little haze.
      // From sunset on they become silhouettes.
      const f = clamp01(1 - daylight * 1.15);
      const dark = mix(zenith, [8, 10, 18], 0.55);
      const land = mix(mix([62, 86, 72], horizonSky, 0.25), dark, f);
      const block = mix(mix([206, 204, 196], horizonSky, 0.2), lift(dark, 0.08), f);
      const wall = mix(mix([150, 148, 140], horizonSky, 0.15), lift(dark, 0.05), f);
      const shore = (x) => horizonY + Math.round(((x - x0) / (W - x0)) * 4 * u);
      const tops = [];
      for (let x = x0; x < W; x++) {
        const v = (x - x0) / (W - x0);
        let h = (1.5 + 1.2 * Math.sin(v * 9)) * u; // trees behind the harbor
        if (v > 0.3 && v < 0.93) {
          const b = Math.floor(x / Math.max(3, Math.round(4 * k)));
          h = Math.max(h, (3.5 + hash(b, 15, 139) * 6) * u * (0.6 + 0.6 * v));
        }
        if (v > 0.72) h = Math.max(h, Math.pow((v - 0.72) / 0.28, 1.4) * 15 * u);
        tops.push(Math.round(h));
      }
      tops.forEach((h, i) => {
        const x = x0 + i;
        const v = i / (W - x0);
        const base = shore(x) - Math.round(1.5 * u);
        const isBlock = v > 0.3 && v < 0.93 && h > 3 * u;
        for (let y = 0; y < h; y++) {
          const window = isBlock && y % Math.max(2, Math.round(1.5 * k)) === 1 && hash(x, y, 163) < 0.3;
          set(x, base - y, isBlock && y < h - 1 ? (window ? dim(block, 0.22) : block) : land);
        }
        // Seawall at the water's edge.
        for (let y = base; y <= shore(x) + Math.round(0.8 * u); y++) set(x, y, y === base ? lift(wall, 0.15) : wall);
      });
      if (lights > 0.05) {
        // Windows and street lamps.
        tops.forEach((h, i) => {
          const x = x0 + i;
          const base = shore(x) - Math.round(1.5 * u);
          for (let y = Math.round(1.5 * u); y < h - 1; y += Math.max(2, Math.round(1.5 * k))) {
            if (hash(x, y, 149) < 0.09) blend(x, base - y, WARM_LIGHT, 0.75 * lights);
          }
          if (i % Math.round(7 * k) === 0) blend(x, base - 1, WARM_LIGHT, lights);
        });
        // The green harbor light, and its long reflection.
        const gx = Math.round(x0 + 0.27 * (W - x0));
        const gy = shore(gx) - Math.round(4.2 * u);
        const green = [70, 232, 150];
        const R = Math.ceil(2.6 * k);
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const d = Math.hypot(dx, dy) / (2.6 * k);
            if (d < 1) blend(gx + dx, gy + dy, green, (d < 0.3 ? 1 : 0.35 * (1 - d)) * lights);
          }
        }
        for (let y = shore(gx) + Math.round(u); y < surfY; y++) {
          const fade = 1 - (y - shore(gx)) / Math.max(1, surfY - shore(gx));
          if (hash(gx, y, 151 + Math.floor(t / 2)) < 0.35) {
            for (let dx = -Math.round(k / 2); dx <= Math.round(k / 2); dx++) blend(gx + dx, y, green, 0.28 * lights * fade);
          }
        }
      }
      // The light's post, visible by day too.
      const gx = Math.round(x0 + 0.27 * (W - x0));
      for (let y = 1; y < Math.round(4 * u); y++) set(gx, shore(gx) - Math.round(1.5 * u) - y, wall);
    }

    // Two surfers waiting for a wave, by day.
    if (night < 0.6) {
      const sa = 0.7 * (1 - night);
      const figure = mix(isle, [20, 24, 34], 0.4);
      for (const [fx, tall] of [[0.36, 2.4], [0.375, 2.1]]) {
        const x = Math.round(W * fx);
        const y = horizonY + Math.round(5 * u);
        for (let j = 0; j < Math.round(tall * u); j++) for (let w = 0; w < Math.max(1, Math.round(0.6 * k)); w++) blend(x + w, y - j, figure, sa);
        for (let j = -Math.round(1.2 * k); j <= Math.round(1.2 * k); j++) blend(x + j, y + 1, figure, sa * 0.8);
      }
    }

    // --- The breaking wave: an undulating crest, a darker face, foam that
    // clumps and spills where the wave breaks, then lacy whitewash.
    const phase = t * 0.3;
    const foamDay = lift(mix(horizonSky, beach, 0.3), 0.4);
    const foam = mix(foamDay, mix(horizonSky, zenith, 0.4), 0.75 * night);
    const faceTop = mix(seaTop, horizonSky, 0.18);
    const faceDeep = dim(mix(ocean, [28, 92, 96], 0.18), 0.4);
    const wash = mix(seaLow, foam, 0.12);
    const faceH = Math.max(2, Math.round(3.8 * u));
    const tick2 = Math.floor(t / 2);
    for (let x = 0; x < W; x++) {
      const wx = x / k;
      const crest = Math.round(
        surfY + u * (1.6 + 1.3 * Math.sin(wx * 0.026 + phase) + 0.8 * Math.sin(wx * 0.0093 - phase * 0.6)),
      );
      // Where the wave is breaking right now (slowly wandering along the beach).
      const breaking = Math.sin(wx * 0.017 - phase * 0.4) + 0.6 * Math.sin(wx * 0.041 + 1.3) > 0.35;
      for (let y = surfY; y < crest; y++) set(x, y, seaLow);
      for (let j = 0; j < faceH; j++) {
        let c = mix(faceTop, faceDeep, j / faceH);
        if (breaking && hash(Math.floor(wx / 1.5), crest + j, 103 + tick2) < 0.55 - j / faceH / 1.6) c = mix(c, foam, 0.75);
        set(x, crest + j, c);
      }
      for (let y = crest + faceH; y < wetY; y++) set(x, y, wash);
      // Foam cap in clumps a few pixels long.
      const clump = hash(Math.floor(wx / 2), 9, 89 + tick2);
      if (clump < (breaking ? 0.9 : 0.45)) blend(x, crest, foam, 0.6 + 0.3 * daylight);
      if (breaking && clump < 0.35) blend(x, crest - 1, foam, 0.45);
      if (breaking && hash(x, 12, 107 + tick2) > 0.96) blend(x, crest - Math.round(1 + k), foam, 0.3); // spray
    }
    // Whitewash: horizontal lace, thinning toward the sand.
    for (let y = surfY + faceH; y < wetY; y++) {
      const f = (y - surfY - faceH) / Math.max(1, wetY - surfY - faceH);
      const drift = Math.floor(t * 0.5 * k);
      for (let x = 0; x < W; x++) {
        if (hash(x + drift, y, 109) < 0.05 * (1 - f * 0.6)) {
          const len = Math.round((3 + hash(x, y, 113) * 8) * k);
          for (let j = 0; j < len; j++) blend(x + j, y, foam, (0.5 - 0.25 * f) * (1 - Math.abs(j / len - 0.5)));
        }
      }
    }

    // --- Wet sand mirrors the sky; dry sand above the tide line
    const wetBase = mix(dim(beach, 0.25), horizonSky, 0.45);
    for (let y = wetY; y < dryY; y++) {
      const f = (y - wetY) / Math.max(1, dryY - wetY);
      const row = mix(wetBase, dim(beach, 0.18), Math.pow(f, 0.8) * 0.75);
      for (let x = 0; x < W; x++) {
        const streak = hash(Math.floor(x / (3 * k)), y, 97) < 0.25 ? 0.25 : 0;
        set(x, y, streak ? mix(row, lift(horizonSky, 0.1), streak * (1 - f)) : row);
      }
    }
    for (let x = 0; x < W; x++) {
      const sy = wetY + Math.round(u * (0.5 + 0.8 * Math.sin(x * (0.05 / k) - phase * 0.5)));
      if (hash(Math.floor(x / (2 * k)), 10, 101 + Math.floor(t / 2)) < 0.75) blend(x, sy, foam, 0.45 + 0.2 * daylight);
    }
    for (let y = dryY; y < H; y++) {
      const f = (y - dryY) / Math.max(1, H - dryY);
      const row = mix(beach, dim(beach, 0.3), f * 0.55);
      for (let x = 0; x < W; x++) {
        const g = hash(x, y, 23);
        set(x, y, g < 0.07 ? lift(row, 0.05) : g > 0.94 ? dim(row, 0.08) : row);
      }
    }

    // --- The path of light on the water and the wet sand
    const lightSrc = sunUp
      ? { x: sunX, s: 0.25 + 0.65 * lowSun, c: lift(glow, 0.3) }
      : moonUp
        ? { x: moonX, s: 0.55 * frame.moon.illumination * Math.max(night, 0.3), c: [226, 232, 240] }
        : null;
    if (lightSrc) {
      for (let y = horizonY; y < dryY; y++) {
        const v = (y - horizonY) / Math.max(1, dryY - horizonY);
        const half = (1 + v * 11) * k;
        for (let x = Math.floor(lightSrc.x - half); x <= lightSrc.x + half; x++) {
          const fall = 1 - Math.abs(x - lightSrc.x) / (half + 1);
          blend(x, y, glow, 0.12 * fall * lightSrc.s);
          if (hash(x, y, 11 + Math.floor(t / 2)) < 0.4 * fall) blend(x, y, lightSrc.c, lightSrc.s * fall);
        }
      }
    }

    // --- Concrete breakwaters in the foreground, as on the beach at Koshigoe.
    {
      const concrete = mix(
        mix(dim(beach, 0.15), [150, 150, 146], 0.45),
        mix(zenith, [10, 12, 20], 0.5),
        Math.max(0.85 * night, 0.55 * (1 - daylight)),
      );
      const topLit = mix(concrete, lift(horizonSky, 0.15), 0.35);
      const face = dim(concrete, 0.32);
      const slab = (start, top0, rise, surface, depth) => {
        const xs = Math.round(W * start);
        for (let x = xs; x < W; x++) {
          const v = (x - xs) / Math.max(1, W - xs);
          const yTop = Math.round(top0 - rise * v);
          const tip = Math.min(1, (x - xs) / (4 * k));
          const faceH = Math.max(1, Math.round(depth * tip));
          for (let j = 0; j < surface; j++) set(x, yTop + j, mix(topLit, concrete, j / Math.max(1, surface)));
          for (let j = 0; j < faceH; j++) set(x, yTop + surface + j, mix(face, dim(face, 0.25), j / faceH));
          const h = hash(Math.floor(x / (2 * k)), 16, 157 + Math.floor(t / 2));
          if (h < 0.55) blend(x, yTop + surface + faceH, foam, 0.45 + 0.2 * daylight);
          if (x - xs < 3 * k && h < 0.8) blend(x - Math.round(k), yTop + surface + faceH - 1, foam, 0.4);
        }
      };
      slab(0.345, surfY - 0.3 * u, 0.6 * u, Math.max(1, Math.round(0.5 * u)), 1.4 * u);
      slab(0.27, surfY + 1.8 * u, 0.4 * u, Math.max(1, Math.round(0.8 * u)), 3.2 * u);
    }

    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------------
  // Panel mode: scrubber and editor preview
  // ------------------------------------------------------------------------

  const CODE = [
    [['c', '// The light follows the sun across the Shonan sky.']],
    [['k', 'import'], ['p', ' { '], ['v', 'sunPosition'], ['p', ' } '], ['k', 'from'], ['p', ' '], ['s', "'./solar'"], ['p', ';']],
    [],
    [['k', 'export'], ['p', ' '], ['k', 'interface'], ['p', ' '], ['t', 'Tide'], ['p', ' {']],
    [['p', '  '], ['r', 'height'], ['o', ':'], ['p', ' '], ['t', 'number'], ['p', ';']],
    [['p', '  '], ['r', 'phase'], ['o', ':'], ['p', ' '], ['s', "'rising'"], ['o', ' | '], ['s', "'ebbing'"], ['p', ';']],
    [['p', '}']],
    [],
    [['k', 'export'], ['p', ' '], ['k', 'function'], ['p', ' '], ['f', 'lightAt'], ['p', '('], ['a', 'date'], ['o', ':'], ['p', ' '], ['t', 'Date'], ['p', ', '], ['a', 'lat'], ['p', ' '], ['o', '='], ['p', ' '], ['n', '35.30'], ['p', ') {']],
    [['p', '  '], ['k', 'const'], ['p', ' '], ['v', 'sun'], ['p', ' '], ['o', '='], ['p', ' '], ['f', 'sunPosition'], ['p', '('], ['a', 'date'], ['p', ', '], ['a', 'lat'], ['p', ', '], ['n', '139.48'], ['p', ');']],
    [['p', '  '], ['k', 'if'], ['p', ' ('], ['v', 'sun'], ['p', '.'], ['r', 'altitude'], ['o', ' < '], ['o', '-'], ['n', '18'], ['p', ') '], ['k', 'return'], ['p', ' '], ['s', '`night ${'], ['v', 'date'], ['p', '.'], ['f', 'getHours'], ['p', '()'], ['s', '}h`'], ['p', ';']],
    [['p', '  '], ['k', 'return'], ['p', ' '], ['v', 'sun'], ['p', '.'], ['r', 'altitude'], ['o', ' > '], ['n', '0'], ['o', ' ? '], ['s', "'day'"], ['o', ' : '], ['s', "'twilight'"], ['p', ';']],
    [['p', '}']],
  ];
  const ROLE = { c: 'comment', k: 'keyword', f: 'func', s: 'string', n: 'number', t: 'type', a: 'param', v: 'text', r: 'property', o: 'operator', p: 'punct' };

  function buildCode() {
    const pre = document.getElementById('code');
    if (!pre || pre.childElementCount) return;
    CODE.forEach((line, i) => {
      const row = document.createElement('div');
      row.className = 'line';
      const num = document.createElement('span');
      num.className = 'ln';
      num.textContent = String(i + 1);
      row.appendChild(num);
      for (const [role, text] of line) {
        const span = document.createElement('span');
        span.className = 'tok ' + ROLE[role];
        span.textContent = text;
        row.appendChild(span);
      }
      if (!line.length) row.appendChild(document.createTextNode(' '));
      pre.appendChild(row);
    });
  }

  function applyPalette(f) {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(f.colors)) root.setProperty('--' + k, v);
    for (const [k, v] of Object.entries(f.scene)) root.setProperty('--scene-' + k, v);
  }

  function readout(f) {
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('clock', f.clock);
    set('phase', f.phaseName);
    const a = f.sun.altitude;
    set('sun', a > 0 ? `sun ${a.toFixed(0)}° above the sea` : `sun ${Math.abs(a).toFixed(0)}° below the horizon`);
  }

  function showFrame(f) {
    frame = f;
    if (mode === 'panel') {
      applyPalette(f);
      readout(f);
    }
    draw();
  }

  function scrubTo(minutes) {
    if (!day || !day.length) return;
    const step = 1440 / day.length;
    const i = Math.floor(minutes / step);
    const a = day[i % day.length];
    const b = day[(i + 1) % day.length];
    const f = lerpFrame(a, b, (minutes - i * step) / step);
    f.minutes = minutes;
    f.clock = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    previewing = true;
    showFrame(f);
    const note = document.getElementById('note');
    if (note) note.textContent = 'Preview only. Your editor is unchanged.';
  }

  function wirePanel() {
    buildCode();
    const scrub = document.getElementById('scrub');
    scrub.addEventListener('input', () => scrubTo(Number(scrub.value)));
    document.getElementById('now').addEventListener('click', () => {
      if (!live) return;
      previewing = false;
      scrub.value = String(live.minutes);
      showFrame(live);
      const note = document.getElementById('note');
      if (note) note.textContent = held ? 'The light is held. Use “Follow the sun” to let it move.' : '';
    });
    document.getElementById('hold').addEventListener('click', () => {
      previewing = false;
      if (vscode) vscode.postMessage({ type: 'hold', minutes: Number(scrub.value) });
    });
  }

  // ------------------------------------------------------------------------
  // Motion: one quiet redraw per second, only while visible
  // ------------------------------------------------------------------------

  function updateMotion() {
    const want = motion && !reduceMotion.matches && !document.hidden;
    if (want && !timer) {
      timer = setInterval(() => {
        tick++;
        draw();
      }, 1100);
    } else if (!want && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ------------------------------------------------------------------------

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.frame) return;
    live = msg.frame;
    if (typeof msg.motion === 'boolean') motion = msg.motion;
    if (typeof msg.held === 'boolean') held = msg.held;
    if (msg.type === 'day') {
      day = msg.frames;
      previewing = false;
      const moonEl = document.getElementById('moon');
      if (moonEl && msg.moon) moonEl.textContent = msg.moon;
    }
    // Don't yank the view away from an hour the user is previewing.
    if (!previewing) {
      const scrub = document.getElementById('scrub');
      if (scrub) scrub.value = String(live.minutes);
      showFrame(live);
    }
    updateMotion();
  });

  new ResizeObserver(() => draw()).observe(canvas);
  document.addEventListener('visibilitychange', updateMotion);
  reduceMotion.addEventListener('change', () => {
    updateMotion();
    draw();
  });
  if (mode === 'view') canvas.addEventListener('dblclick', () => vscode && vscode.postMessage({ type: 'open' }));
  if (mode === 'panel') wirePanel();

  // Static previews (README screenshots) inject a frame directly.
  if (window.__SHONAN_FRAME__) {
    live = window.__SHONAN_FRAME__;
    motion = false;
    showFrame(live);
  }
  if (vscode) vscode.postMessage({ type: 'ready' });
})();
