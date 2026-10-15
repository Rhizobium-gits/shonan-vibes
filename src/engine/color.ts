/**
 * Color math for Shonan Vibes.
 *
 * Every palette operation happens in OKLab (Björn Ottosson, 2020). It is
 * perceptually even enough that a straight line between two colors never
 * passes through a neon or muddy midpoint, and a change of hue always moves
 * gently through the less saturated center instead of around the color wheel.
 * OKLCH (lightness, chroma, hue) is used only for authoring.
 */

export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface Lch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const DEG = Math.PI / 180;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Author a color in OKLCH (l: 0..1, c: ~0..0.37, h: degrees). */
export function lch(l: number, c: number, h: number): Lab {
  return { L: l, a: c * Math.cos(h * DEG), b: c * Math.sin(h * DEG) };
}

export function toLch(c: Lab): Lch {
  let h = Math.atan2(c.b, c.a) / DEG;
  if (h < 0) h += 360;
  return { l: c.L, c: Math.hypot(c.a, c.b), h };
}

export function mix(x: Lab, y: Lab, t: number): Lab {
  return { L: x.L + (y.L - x.L) * t, a: x.a + (y.a - x.a) * t, b: x.b + (y.b - x.b) * t };
}

/** Euclidean distance in OKLab. ~0.02 is a just-noticeable difference. */
export function deltaE(x: Lab, y: Lab): number {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

export function withLightness(c: Lab, L: number): Lab {
  return { L, a: c.a, b: c.b };
}

export function lighten(c: Lab, dL: number): Lab {
  return { L: c.L + dL, a: c.a, b: c.b };
}

export function scaleChroma(c: Lab, k: number): Lab {
  return { L: c.L, a: c.a * k, b: c.b * k };
}

export function rotateHue(c: Lab, deg: number): Lab {
  const cos = Math.cos(deg * DEG);
  const sin = Math.sin(deg * DEG);
  return { L: c.L, a: c.a * cos - c.b * sin, b: c.a * sin + c.b * cos };
}

/** Move the hue toward `targetHue` by at most `deg` degrees, keeping L and C. */
export function nudgeHue(c: Lab, targetHue: number, deg: number): Lab {
  const { h } = toLch(c);
  const diff = ((targetHue - h + 540) % 360) - 180;
  return rotateHue(c, clamp(diff, -Math.abs(deg), Math.abs(deg)));
}

// ---------------------------------------------------------------------------
// sRGB conversion
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function labToLinearRgb(c: Lab): Rgb {
  const l_ = c.L + 0.3963377774 * c.a + 0.2158037573 * c.b;
  const m_ = c.L - 0.1055613458 * c.a - 0.0638541728 * c.b;
  const s_ = c.L - 0.0894841775 * c.a - 1.291485548 * c.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function linearRgbToLab([r, g, b]: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function inGamut([r, g, b]: Rgb): boolean {
  const e = 1e-4;
  return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
}

/** Bring a color into sRGB by reducing chroma only (lightness and hue stay). */
export function toGamut(c: Lab): Lab {
  const base = { L: clamp(c.L, 0, 1), a: c.a, b: c.b };
  if (inGamut(labToLinearRgb(base))) return base;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const k = (lo + hi) / 2;
    if (inGamut(labToLinearRgb(scaleChroma(base, k)))) lo = k;
    else hi = k;
  }
  return scaleChroma(base, lo);
}

function byte(v: number): string {
  return Math.round(clamp(v, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** `#rrggbb`, or `#rrggbbaa` when alpha < 1. */
export function toHex(c: Lab, alpha = 1): string {
  const rgb = labToLinearRgb(toGamut(c)).map((v) => linearToSrgb(clamp(v, 0, 1)));
  const hex = '#' + rgb.map(byte).join('');
  return alpha < 1 ? hex + byte(alpha) : hex;
}

export function fromHex(hex: string): { color: Lab; alpha: number } | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let s = m[1];
  if (s.length === 3 || s.length === 4) s = [...s].map((ch) => ch + ch).join('');
  if (s.length !== 6 && s.length !== 8) return undefined;
  const v = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255;
  const color = linearRgbToLab([srgbToLinear(v(0)), srgbToLinear(v(2)), srgbToLinear(v(4))]);
  return { color, alpha: s.length === 8 ? v(6) : 1 };
}

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

/** WCAG 2 relative luminance. */
export function luminance(c: Lab): number {
  const [r, g, b] = labToLinearRgb(toGamut(c)).map((v) => clamp(v, 0, 1));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio (1..21). */
export function contrast(x: Lab, y: Lab): number {
  const a = luminance(x);
  const b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Return `fg` with its lightness moved away from `bg` just far enough to reach
 * `min` contrast. Hue and chroma are kept (chroma only shrinks if the lighter
 * color would leave sRGB). Readability always wins over atmosphere.
 */
export function ensureContrast(fg: Lab, bg: Lab, min: number): Lab {
  const start = toGamut(fg);
  if (contrast(start, bg) >= min) return start;
  const upward = luminance(bg) < 0.2;
  let lo = start.L;
  let hi = upward ? 1 : 0;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(toGamut(withLightness(fg, mid)), bg) >= min) hi = mid;
    else lo = mid;
  }
  return toGamut(withLightness(fg, hi));
}

/** Whichever of the candidates reads best on `bg`. */
export function bestOn(bg: Lab, ...candidates: Lab[]): Lab {
  return candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best));
}
