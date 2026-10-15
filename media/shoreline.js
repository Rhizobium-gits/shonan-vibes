// Shoreline: a small pixel-art Shonan coast that follows the editor's light.
// Facing the sea (south): the sun and moon rise on the left over the Miura
// peninsula and set on the right, behind Enoshima and the far ridge.
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

  // Square pixels, sized by the panel's width. A taller panel never stretches
  // the picture; the extra rows become more sky (see layout()).
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const across = mode === 'panel' ? 256 : 240;
    const px = Math.max(rect.width / across, rect.height / 600);
    const W = Math.max(1, Math.round(rect.width / px));
    const H = Math.max(12, Math.round(rect.height / px));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    return true;
  }

  // The ground (sea and beach) keeps its height; the sky takes the rest.
  // Only very short panels shrink everything together (fit < 1).
  const SEA = 18;
  const BEACH = 14;
  const MIN_SKY = 30;
  function layout(W, H) {
    const k = W / 240;
    const fit = Math.min(1, H / ((SEA + BEACH + MIN_SKY) * k));
    const horizonY = H - Math.round((SEA + BEACH) * k * fit);
    const shoreY = horizonY + Math.round(SEA * k * fit);
    return { horizonY, shoreY, fit };
  }

  // Azimuth (90 east … 270 west) to x, facing south.
  function azimuthX(az, W) {
    return W / 2 + ((az - 180) / 105) * (W / 2);
  }
  function altitudeY(alt, horizonY) {
    return horizonY - 1 - Math.pow(clamp01(alt / 70), 0.75) * (horizonY - 6);
  }

  // ------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------

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
    const daylight = clamp01((frame.sun.altitude + 2) / 27);
    const clouds = clamp01(frame.cloudCover || 0);
    const t = motion && !reduceMotion.matches ? tick : 0;

    const { horizonY, shoreY, fit } = layout(W, H);

    // Light source on screen
    const sunUp = frame.sun.altitude > -1.5;
    const sunX = azimuthX(frame.sun.azimuth, W);
    const sunY = altitudeY(frame.sun.altitude, horizonY);
    const moonUp = frame.moon.altitude > 0 && frame.moon.illumination > 0.04;
    const moonX = azimuthX(frame.moon.azimuth, W);
    const moonY = altitudeY(frame.moon.altitude, horizonY);
    const lowSun = sunUp ? 1 - clamp01(frame.sun.altitude / 35) : 0;

    // --- Sky: banded gradient, then a dithered halo around the sun
    const BANDS = Math.max(8, Math.round(horizonY / 5));
    for (let y = 0; y < horizonY; y++) {
      const v = Math.pow(y / Math.max(1, horizonY - 1), 1.45) * BANDS;
      for (let x = 0; x < W; x++) {
        const lo = Math.floor(v);
        const band = v - lo > dither(x, y) ? lo + 1 : lo;
        let c = mix(zenith, horizonSky, Math.min(1, band / BANDS));
        if (sunUp || frame.sun.altitude > -10) {
          const dx = (x - sunX) / (W * 0.32);
          const dy = (y - Math.max(sunY, horizonY - 2)) / (W * 0.16);
          const d = Math.sqrt(dx * dx + dy * dy);
          const strength = 0.55 * Math.max(lowSun, frame.sun.altitude < 0 ? clamp01(1 + frame.sun.altitude / 10) : 0);
          const w = Math.pow(clamp01(1 - d), 2) * strength;
          if (w > 0) c = mix(c, glow, Math.floor(w * 5 + dither(x, y)) / 5);
        }
        set(x, y, c);
      }
    }

    // --- Stars
    if (night > 0.05) {
      const r = rng(7);
      const count = Math.round((W * horizonY) / 85);
      const star = [222, 230, 242];
      for (let i = 0; i < count; i++) {
        const x = Math.floor(r() * W);
        const y = Math.floor(Math.pow(r(), 1.3) * (horizonY - 8));
        const b = 0.2 + r() * 0.5;
        const twinkle = t && hash(i, 1, Math.floor(t / 3)) < 0.12 ? 0.45 : 1;
        blend(x, y, star, b * night * (1 - clouds * 0.8) * twinkle);
      }
    }

    // --- Moon, with its real phase
    if (moonUp) {
      const rad = 4.2;
      const k = Math.cos(2 * Math.PI * frame.moon.phase);
      const waxing = frame.moon.phase < 0.5;
      const moonLight = [236, 240, 246];
      const vis = 0.35 + 0.65 * Math.max(night, 1 - daylight);
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const rr = dx * dx + dy * dy;
          if (rr > rad * rad) continue;
          const half = Math.sqrt(Math.max(0.0001, rad * rad - dy * dy));
          const xn = dx / half;
          const lit = waxing ? xn > k : xn < -k;
          blend(moonX + dx, moonY + dy, lit ? moonLight : mix(zenith, moonLight, 0.08), lit ? vis : vis * 0.5);
        }
      }
    }

    // --- Sun
    if (sunUp) {
      const rad = 3.6;
      const core = lift(glow, 0.45);
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const rr = dx * dx + dy * dy;
          if (rr <= rad * rad) set(Math.round(sunX + dx), Math.round(sunY + dy), core);
          else if (rr <= (rad + 1.5) * (rad + 1.5)) blend(sunX + dx, sunY + dy, glow, 0.35);
        }
      }
    }

    // --- Clouds: a few soft pixel shapes, drifting with the hours
    const cloudShapes = [
      [3, 7, 11, 13, 9],
      [4, 9, 14, 8],
      [2, 6, 9, 7],
      [5, 10, 16, 12, 6],
    ];
    const nClouds = Math.round((2 + clouds * 5) * Math.max(1, horizonY / 42));
    const cr = rng(19);
    const lightSide = mix(lift(horizonSky, 0.35), glow, 0.35 * lowSun);
    const darkSide = mix(zenith, horizonSky, 0.45);
    const cloudCol = mix(darkSide, lightSide, Math.max(daylight, 0.15));
    for (let i = 0; i < nClouds; i++) {
      const shape = cloudShapes[i % cloudShapes.length];
      const drift = (frame.minutes || 0) * 0.04 + cr() * W;
      const cx = Math.round(drift % (W + 30)) - 15;
      const cy = Math.round(4 + cr() * (horizonY * 0.6));
      const alpha = (0.28 + 0.4 * clouds) * (0.5 + 0.5 * Math.max(daylight, 1 - night));
      shape.forEach((w, row) => {
        for (let x = -Math.floor(w / 2); x < Math.ceil(w / 2); x++) {
          const under = row >= shape.length - 2 ? mix(cloudCol, glow, 0.25 * lowSun) : cloudCol;
          blend(cx + x, cy + row, under, alpha);
        }
      });
    }

    // --- Far ridge to the west, with one tall peak, mostly lost in haze
    const ridgeBase = mix(horizonSky, mix(zenith, ocean, 0.5), 0.3 + 0.4 * (1 - daylight));
    const ridgeAlpha = 0.35 + 0.45 * (1 - daylight * 0.7);
    for (let x = Math.floor(W * 0.56); x < W; x++) {
      const u = x / W;
      let h = 1.5 + Math.sin(u * 40) * 0.6 + Math.sin(u * 17 + 1) * 0.9;
      const peak = Math.max(0, 1 - Math.abs(u - 0.82) / 0.085);
      h += Math.pow(peak, 1.35) * W * 0.04 * fit;
      h *= clamp01((u - 0.56) / 0.06);
      for (let y = 0; y < h; y++) blend(x, horizonY - 1 - y, ridgeBase, ridgeAlpha);
    }

    // --- Enoshima, with its lighthouse
    const isle = dim(mix(ocean, zenith, 0.5), 0.25);
    const ix0 = Math.round(W * 0.655);
    const ix1 = Math.round(W * 0.745);
    for (let x = ix0; x <= ix1; x++) {
      const u = (x - ix0) / (ix1 - ix0);
      const h = Math.round(Math.sin(Math.PI * Math.pow(u, 0.8)) * W * 0.02 * fit) + 1;
      for (let y = 0; y < h; y++) set(x, horizonY - 1 - y, isle);
    }
    const lx = Math.round(W * 0.7);
    const lTop = horizonY - 1 - Math.round(W * 0.02 * fit) - Math.max(2, Math.round(4 * fit));
    for (let y = lTop + 1; y < horizonY - 1; y++) set(lx, y, isle);
    if (night > 0.2) {
      const pulse = t ? (Math.floor(t / 2) % 3 === 0 ? 1 : 0.55) : 0.85;
      blend(lx, lTop, [255, 214, 160], night * pulse);
    }

    // --- Low coast to the east, and its distant lights at night
    const coast = dim(mix(ocean, zenith, 0.4), 0.15);
    for (let x = 0; x < Math.round(W * 0.2); x++) {
      const h = Math.round(1 + 1.5 * (1 - x / (W * 0.2)) + Math.sin(x * 0.7) * 0.5);
      for (let y = 0; y < h; y++) set(x, horizonY - 1 - y, coast);
    }
    if (night > 0.15) {
      const lr = rng(31);
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(lr() * W * 0.19);
        blend(x, horizonY - 1 - Math.floor(lr() * 2), [242, 196, 138], night * (0.45 + lr() * 0.5));
      }
    }

    // --- Sea: rows darkening toward the shore, light wave dashes
    const seaTop = mix(ocean, horizonSky, 0.35);
    const seaLow = dim(ocean, 0.18);
    for (let y = horizonY; y < shoreY; y++) {
      const u = (y - horizonY) / Math.max(1, shoreY - horizonY);
      const row = mix(seaTop, seaLow, Math.pow(u, 0.8));
      const banded = (y - horizonY) % 3 === 2 ? dim(row, 0.06) : row;
      for (let x = 0; x < W; x++) set(x, y, banded);
    }
    const waveCol = mix(seaTop, lift(horizonSky, 0.1), 0.35);
    for (let y = horizonY + 1; y < shoreY; y++) {
      const u = (y - horizonY) / Math.max(1, shoreY - horizonY);
      const speed = 0.4 + u * 1.2;
      const offset = Math.floor(t * speed);
      const density = 0.018 + 0.04 * u;
      for (let x = 0; x < W; x++) {
        if (hash(x + offset, y, 3) < density) {
          const len = 2 + Math.floor(hash(x, y, 5) * (2 + u * 3));
          for (let k = 0; k < len; k++) blend(x + k, y, waveCol, 0.22 + 0.2 * u);
        }
      }
    }
    if (sunUp) {
      const sunRow = mix(seaTop, glow, 0.35 * lowSun);
      for (let x = 0; x < W; x++) blend(x, horizonY, sunRow, 0.6);
    }

    // --- Reflection column under the sun (or moon)
    const lights = [];
    if (sunUp) lights.push({ x: sunX, s: 0.25 + 0.65 * lowSun, c: lift(glow, 0.3) });
    else if (moonUp) lights.push({ x: moonX, s: 0.55 * frame.moon.illumination * Math.max(night, 0.3), c: [226, 232, 240] });
    for (const L of lights) {
      for (let y = horizonY; y < shoreY; y++) {
        const u = (y - horizonY) / Math.max(1, shoreY - horizonY);
        const half = 1 + u * 9;
        for (let x = Math.floor(L.x - half); x <= L.x + half; x++) {
          const fall = 1 - Math.abs(x - L.x) / (half + 1);
          if (hash(x, y, 11 + Math.floor(t / 2)) < 0.45 * fall) blend(x, y, L.c, L.s * fall);
        }
      }
    }

    // --- Shore: foam line, wet sand, dry sand
    // Foam is broken and soft: a hint of surf, not a stripe.
    const foam = lift(mix(beach, horizonSky, 0.4), 0.18 + 0.12 * daylight);
    const wet = mix(beach, ocean, 0.45);
    const phase = t * 0.35;
    for (let x = 0; x < W; x++) {
      const wave = Math.round(Math.sin(x * 0.09 + phase) * 0.8 + Math.sin(x * 0.031 - phase * 0.6) * 0.7);
      const fy = shoreY + wave;
      for (let y = shoreY; y < fy; y++) set(x, y, seaLow); // water reaching up the beach
      for (let y = fy; y < H; y++) {
        if (y <= fy + 2) set(x, y, mix(wet, beach, (y - fy) / 3));
        else {
          const grain = hash(x, y, 23);
          set(x, y, grain < 0.08 ? lift(beach, 0.05) : grain > 0.94 ? dim(beach, 0.07) : beach);
        }
      }
      const f = hash(x, 2, 29 + Math.floor(t / 2));
      if (f < 0.72) blend(x, fy, foam, (0.3 + 0.2 * daylight) * (0.6 + 0.4 * f));
      if (f < 0.18) blend(x, fy - 1, foam, 0.18);
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
