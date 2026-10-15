/**
 * How dynamic colors live in user settings, without vscode imports.
 *
 * Everything goes under the theme-scoped key "[Shonan Vibes]" of
 *   workbench.colorCustomizations
 *   editor.tokenColorCustomizations          (textMateRules)
 *   editor.semanticTokenColorCustomizations  (rules)
 * so nothing leaks into other themes. Entries the user added themselves
 * inside that block are kept; TextMate rules are told apart by name prefix.
 */

import { deltaE, fromHex } from '../engine/color';
import { SemanticStyle, THEME_NAME, TextMateRule } from './mapper';

export const SCOPE_KEY = `[${THEME_NAME}]`;
export const RULE_PREFIX = 'Shonan Vibes · ';

/** Below this (OKLab ΔE, ~half a just-noticeable difference) nothing is written. */
export const CHANGE_THRESHOLD = 0.01;

type Json = Record<string, unknown>;

export function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Largest perceptual change between two color strings (alpha counted gently). */
export function hexDelta(a: unknown, b: unknown): number {
  if (typeof a !== 'string' || typeof b !== 'string') return Infinity;
  if (a.toLowerCase() === b.toLowerCase()) return 0;
  const x = fromHex(a);
  const y = fromHex(b);
  if (!x || !y) return Infinity;
  return deltaE(x.color, y.color) + Math.abs(x.alpha - y.alpha) * 0.25;
}

// ---------------------------------------------------------------------------
// workbench.colorCustomizations
// ---------------------------------------------------------------------------

export function colorsDelta(block: unknown, next: Record<string, string>): number {
  if (!isObject(block)) return Infinity;
  let max = 0;
  for (const [k, v] of Object.entries(next)) {
    const d = hexDelta(block[k], v);
    if (d === Infinity) return d;
    if (d > max) max = d;
  }
  return max;
}

/** Our colors, plus whatever the user put in the block that we never managed. */
export function mergeColors(block: unknown, next: Record<string, string>, managedBefore: readonly string[]): Json {
  const kept: Json = {};
  if (isObject(block)) {
    const ours = new Set([...managedBefore, ...Object.keys(next)]);
    for (const [k, v] of Object.entries(block)) if (!ours.has(k)) kept[k] = v;
  }
  return { ...kept, ...next };
}

// ---------------------------------------------------------------------------
// editor.tokenColorCustomizations
// ---------------------------------------------------------------------------

export function tagRules(rules: TextMateRule[]): TextMateRule[] {
  return rules.map((r) => ({ ...r, name: RULE_PREFIX + r.name }));
}

function isOurRule(r: unknown): boolean {
  return isObject(r) && typeof r.name === 'string' && r.name.startsWith(RULE_PREFIX);
}

export function rulesDelta(block: unknown, ours: TextMateRule[]): number {
  if (!isObject(block) || !Array.isArray(block.textMateRules)) return Infinity;
  const existing = block.textMateRules.filter(isOurRule) as TextMateRule[];
  if (existing.length !== ours.length) return Infinity;
  let max = 0;
  for (let i = 0; i < ours.length; i++) {
    const a = existing[i];
    const b = ours[i];
    if (a.name !== b.name || JSON.stringify(a.scope) !== JSON.stringify(b.scope)) return Infinity;
    if ((a.settings?.fontStyle ?? '') !== (b.settings.fontStyle ?? '')) return Infinity;
    if (a.settings?.foreground !== undefined || b.settings.foreground !== undefined) {
      const d = hexDelta(a.settings?.foreground, b.settings.foreground);
      if (d === Infinity) return d;
      if (d > max) max = d;
    }
  }
  return max;
}

/** Ours first, the user's own rules after, so theirs win on equal selectors. */
export function mergeRules(block: unknown, ours: TextMateRule[]): Json {
  const base: Json = isObject(block) ? { ...block } : {};
  const theirs = Array.isArray(base.textMateRules) ? base.textMateRules.filter((r) => !isOurRule(r)) : [];
  base.textMateRules = [...ours, ...theirs];
  return base;
}

// ---------------------------------------------------------------------------
// editor.semanticTokenColorCustomizations
// ---------------------------------------------------------------------------

function styleColor(s: unknown): unknown {
  return isObject(s) ? s.foreground : s;
}

export function semanticDelta(block: unknown, ours: Record<string, SemanticStyle>): number {
  if (!isObject(block) || !isObject(block.rules) || block.enabled !== true) return Infinity;
  const rules = block.rules;
  let max = 0;
  for (const [k, v] of Object.entries(ours)) {
    const have = rules[k];
    if (have === undefined) return Infinity;
    const a = styleColor(have);
    const b = styleColor(v);
    if (a === undefined && b === undefined) {
      if (JSON.stringify(have) !== JSON.stringify(v)) return Infinity;
      continue;
    }
    const d = hexDelta(a, b);
    if (d === Infinity) return d;
    if (d > max) max = d;
  }
  return max;
}

export function mergeSemantic(
  block: unknown,
  ours: Record<string, SemanticStyle>,
  managedBefore: readonly string[],
): Json {
  const base: Json = isObject(block) ? { ...block } : {};
  const kept: Json = {};
  if (isObject(base.rules)) {
    const managed = new Set([...managedBefore, ...Object.keys(ours)]);
    for (const [k, v] of Object.entries(base.rules)) if (!managed.has(k)) kept[k] = v;
  }
  return { ...base, enabled: true, rules: { ...kept, ...ours } };
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

/** The block without our entries, or undefined if nothing of the user's remains. */
export function stripColors(block: unknown, managed: readonly string[]): Json | undefined {
  if (!isObject(block)) return undefined;
  const ours = new Set(managed);
  const kept = Object.fromEntries(Object.entries(block).filter(([k]) => !ours.has(k)));
  return Object.keys(kept).length ? kept : undefined;
}

export function stripRules(block: unknown): Json | undefined {
  if (!isObject(block)) return undefined;
  const rest: Json = { ...block };
  const theirs = Array.isArray(rest.textMateRules) ? rest.textMateRules.filter((r) => !isOurRule(r)) : [];
  if (theirs.length) rest.textMateRules = theirs;
  else delete rest.textMateRules;
  return Object.keys(rest).length ? rest : undefined;
}

export function stripSemantic(block: unknown, managed: readonly string[]): Json | undefined {
  if (!isObject(block)) return undefined;
  const ours = new Set(managed);
  const rules = isObject(block.rules)
    ? Object.fromEntries(Object.entries(block.rules).filter(([k]) => !ours.has(k)))
    : {};
  if (!Object.keys(rules).length) return undefined;
  return { ...block, rules };
}

/** Replace (or delete) the theme-scoped entry of a settings object. */
export function withScope(outer: unknown, block: Json | undefined): Json | undefined {
  const next: Json = isObject(outer) ? { ...outer } : {};
  if (block === undefined) delete next[SCOPE_KEY];
  else next[SCOPE_KEY] = block;
  return Object.keys(next).length ? next : undefined;
}
