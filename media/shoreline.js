// Shoreline: a pixel-art Shonan coast that follows the editor's light.
// Seen from the beach at Tsujido, facing the sea: Enoshima close on the left,
// the sun and moon rising on the left and setting on the right over Izu,
// Hakone and Fuji.
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
    out.nightness = a.nightness + (b.nightness - a.nightness) * t;
    out.sun.altitude = a.sun.altitude + (b.sun.altitude - a.sun.altitude) * t;
    out.sun.azimuth = a.sun.azimuth + (b.sun.azimuth - a.sun.azimuth) * t;
    out.moon.altitude = a.moon.altitude + (b.moon.altitude - a.moon.altitude) * t;
    out.moon.azimuth = a.moon.azimuth + (b.moon.azimuth - a.moon.azimuth) * t;
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

  // Facing the sea from Tsujido: east (sunrise) left, west (sunset, Izu,
  // Hakone, Fuji) right, Enoshima close on the left.
  function azimuthX(az, W) {
    return W / 2 + ((az - 180) / 105) * (W / 2);
  }
  function altitudeY(alt, horizonY, u) {
    return horizonY - 1 - Math.pow(clamp01(alt / 70), 0.75) * (horizonY - 6 * u);
  }

  // ------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------

  const WARM_LIGHT = [255, 206, 140];

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
    const moonUp = frame.moon.altitude > 0 && frame.moon.illumination > 0.04;
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
    if (night > 0.05) {
      const r = rng(7);
      const count = Math.round((W * horizonY) / (55 * k * k));
      const star = [222, 230, 242];
      for (let i = 0; i < count; i++) {
        const x = Math.floor(r() * W);
        const y = Math.floor(Math.pow(r(), 1.3) * (horizonY - 10 * u));
        const b = 0.2 + r() * 0.5;
        const twinkle = t && hash(i, 1, Math.floor(t / 3)) < 0.12 ? 0.45 : 1;
        blend(x, y, star, b * night * (1 - clouds * 0.8) * twinkle);
      }
    }

    // --- Moon, in its real phase
    if (moonUp) {
      const rad = 4.2 * k;
      const kk = Math.cos(2 * Math.PI * frame.moon.phase);
      const waxing = frame.moon.phase < 0.5;
      const moonLight = [236, 240, 246];
      const vis = 0.35 + 0.65 * Math.max(night, 1 - daylight);
      const R = Math.ceil(rad) + 1;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const half = Math.sqrt(Math.max(0.0001, rad * rad - dy * dy));
          const xn = dx / half;
          const lit = waxing ? xn > kk : xn < -kk;
          blend(moonX + dx, moonY + dy, lit ? moonLight : mix(zenith, moonLight, 0.08), lit ? vis : vis * 0.5);
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

    // --- Far coast to the west: Izu and Hakone, with Fuji, lost in haze by day
    const ridgeBase = mix(horizonSky, mix(zenith, ocean, 0.5), 0.3 + 0.4 * (1 - daylight));
    const ridgeAlpha = 0.3 + 0.45 * (1 - daylight * 0.7);
    for (let x = Math.floor(W * 0.55); x < W; x++) {
      const v = x / W;
      let h = (1.5 + Math.sin(v * 40) * 0.6 + Math.sin(v * 17 + 1) * 0.9) * u;
      const peak = Math.max(0, 1 - Math.abs(v - 0.82) / 0.085);
      h += Math.pow(peak, 1.35) * 9.6 * u;
      h *= clamp01((v - 0.55) / 0.06);
      for (let y = 0; y < h; y++) blend(x, horizonY - 1 - y, ridgeBase, ridgeAlpha);
    }

    // A distant sail on the horizon.
    if (daylight > 0.05 || lowWarm > 0.2) {
      const bx = Math.round(W * 0.47);
      const sail = mix(ocean, zenith, 0.5);
      const sa = 0.55 * Math.max(daylight, lowWarm);
      const sh = Math.max(2, Math.round(3.2 * u));
      for (let y = 0; y < sh; y++) {
        const w = Math.max(1, Math.round(((y + 1) / sh) * 1.6 * k));
        for (let x = 0; x < w; x++) blend(bx + x, horizonY - 2 - (sh - 1 - y), sail, sa);
      }
      for (let x = -1; x <= Math.round(2 * k); x++) blend(bx + x, horizonY - 1, sail, sa);
    }

    // --- Open sea: rows darkening toward the shore, flecks of reflected sky
    const seaTop = mix(ocean, horizonSky, 0.35);
    const seaLow = dim(ocean, 0.2);
    for (let y = horizonY; y < surfY; y++) {
      const v = (y - horizonY) / Math.max(1, surfY - horizonY);
      const row = mix(seaTop, seaLow, Math.pow(v, 0.8));
      const period = Math.max(2, Math.round(2 + v * 3 * k));
      const banded = (y - horizonY) % period === period - 1 ? dim(row, 0.035) : row;
      for (let x = 0; x < W; x++) set(x, y, banded);
    }
    for (let x = 0; x < W; x++) blend(x, horizonY, lift(horizonSky, 0.1), 0.45);
    const fleck = mix(seaTop, lift(horizonSky, 0.12), 0.4);
    for (let y = horizonY + 1; y < surfY; y++) {
      const v = (y - horizonY) / Math.max(1, surfY - horizonY);
      const offset = Math.floor(t * (0.4 + v * 1.2) * k);
      const density = 0.012 + 0.04 * v;
      for (let x = 0; x < W; x++) {
        if (hash(x + offset, y, 3) < density) {
          const len = Math.round((2 + hash(x, y, 5) * (2 + v * 4)) * k);
          for (let j = 0; j < len; j++) blend(x + j, y, fleck, 0.2 + 0.2 * v);
        }
      }
    }

    // --- Enoshima: wooded hill, the Sea Candle lighthouse, a town at its foot
    const ix0 = Math.round(W * 0.025);
    const ix1 = Math.round(W * 0.4);
    const isle = mix(
      mix(lift(mix(ocean, zenith, 0.5), 0.05), horizonSky, 0.32 * daylight),
      [12, 14, 26],
      Math.max(0.35 * night, 0.4 * lowWarm * (1 - daylight * 0.5)),
    );
    const canopyLit = mix(isle, lift(horizonSky, 0.1), 0.18 * daylight + 0.12 * lowWarm);
    const heights = [];
    for (let x = ix0; x <= ix1; x++) {
      const v = (x - ix0) / (ix1 - ix0);
      const hill = Math.max(Math.exp(-Math.pow((v - 0.42) / 0.2, 2)), 0.62 * Math.exp(-Math.pow((v - 0.78) / 0.15, 2)), 0.35);
      const taper = clamp01(v / 0.05) * clamp01((1 - v) / 0.05);
      // Tree clumps: blocky bumps, a few pixels wide.
      const clump = Math.floor(x / Math.max(2, Math.round(2.5 * k)));
      const bump = hash(clump, 5, 53) * 1.6 * u;
      heights.push(Math.round((2.2 * u + hill * 10.5 * u + bump) * taper));
    }
    heights.forEach((h, i) => {
      const x = ix0 + i;
      for (let y = 0; y < h; y++) set(x, horizonY - 1 - y, y >= h - Math.max(1, Math.round(u * 0.6)) ? canopyLit : isle);
    });
    // Buildings along the waterline.
    for (let x = ix0 + Math.round(4 * k); x < ix1 - Math.round(4 * k); x++) {
      const block = Math.floor(x / Math.max(2, Math.round(2 * k)));
      if (hash(block, 6, 59) < 0.55) {
        const bh = Math.round((1 + hash(block, 7, 61) * 2.5) * u) + Math.round(2.2 * u);
        for (let y = 0; y < bh; y++) set(x, horizonY - 1 - y, isle);
      }
    }
    // The Sea Candle: tapered tower, observation deck, lantern.
    const tx = Math.round(ix0 + (ix1 - ix0) * 0.4);
    const hillTop = heights[tx - ix0] || 0;
    const towerH = Math.round(9 * u);
    const towerCol = mix(isle, lift(horizonSky, 0.25), 0.25 + 0.3 * daylight);
    const baseY = horizonY - 1 - hillTop;
    for (let y = 0; y < towerH; y++) {
      const w = Math.max(1, Math.round((2 - 0.9 * (y / towerH)) * k));
      for (let x = 0; x < w; x++) set(tx - (w >> 1) + x, baseY - y, towerCol);
    }
    // Observation deck, then a lantern room with a small dome: a candle, not a cross.
    const deckY = baseY - towerH;
    const deckW = Math.max(3, Math.round(2.6 * k));
    for (let x = 0; x < deckW; x++) set(tx - (deckW >> 1) + x, deckY, towerCol);
    const tw = Math.max(1, Math.round(1.6 * k));
    const lanternH = Math.max(1, Math.round(1.4 * k));
    for (let r = 1; r <= lanternH; r++) {
      for (let x = 0; x < tw; x++) set(tx - (tw >> 1) + x, deckY - r, towerCol);
    }
    const lampY = deckY - Math.ceil(lanternH / 2);
    const domeW = Math.max(1, tw - 2);
    for (let x = 0; x < domeW; x++) set(tx - (domeW >> 1) + x, deckY - lanternH - 1, towerCol);
    const lights = clamp01(night * 1.3 + (alt < 4 ? 0.35 * lowWarm : 0));
    if (lights > 0.05) {
      const pulse = t ? (Math.floor(t / 2) % 3 === 0 ? 1 : 0.6) : 0.85;
      for (let r = 0; r < Math.max(1, lanternH - 1); r++) {
        for (let x = 0; x < tw; x++) blend(tx - (tw >> 1) + x, lampY - r + (lanternH > 2 ? 1 : 0), WARM_LIGHT, lights * pulse);
      }
      const R = Math.ceil(3 * k);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy) / (3 * k);
          if (d < 1 && d > 0.25) blend(tx + dx, lampY + dy, WARM_LIGHT, 0.22 * lights * pulse * (1 - d));
        }
      }
      // Town lights, and their reflections on the water.
      for (let x = ix0 + Math.round(5 * k); x < ix1 - Math.round(5 * k); x++) {
        if (hash(x, 3, 67) > 0.22) continue;
        const ly = horizonY - 1 - Math.floor(hash(x, 4, 71) * 3.2 * u);
        const on = lights * (0.55 + 0.45 * hash(x, 8, 73));
        blend(x, ly, WARM_LIGHT, on);
        for (let y = horizonY; y < horizonY + 7 * u; y++) {
          if (hash(x, y, 79 + Math.floor(t / 2)) < 0.45) {
            blend(x, y, WARM_LIGHT, on * 0.45 * (1 - (y - horizonY) / (7 * u)));
          }
        }
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
