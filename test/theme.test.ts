import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { describe, it } from 'node:test';
import { DEFAULT_ATMOSPHERE, DEFAULT_SKY, computeAtmosphere, skyAt, staticAtmosphere } from '../src/engine';
import { buildTheme, themeDocument } from '../src/theme/mapper';
import {
  CHANGE_THRESHOLD,
  RULE_PREFIX,
  SCOPE_KEY,
  colorsDelta,
  hexDelta,
  mergeColors,
  mergeRules,
  mergeSemantic,
  rulesDelta,
  semanticDelta,
  stripColors,
  stripRules,
  stripSemantic,
  tagRules,
  withScope,
} from '../src/theme/overrides';

const root = path.resolve(__dirname, '..', '..');
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

describe('theme', () => {
  it('ships a theme file identical to what the engine generates', () => {
    const file = JSON.parse(fs.readFileSync(path.join(root, 'themes', 'shonan-vibes-color-theme.json'), 'utf8'));
    const generated = JSON.parse(JSON.stringify(themeDocument(buildTheme(staticAtmosphere().palette))));
    assert.deepEqual(file, generated, 'run `npm run build` to regenerate the theme');
  });

  it('emits only valid colors', () => {
    for (const hour of [0, 5, 6, 12, 17, 18, 21]) {
      const d = new Date(Date.UTC(2026, 9, 15, hour - 9, 10));
      const t = buildTheme(computeAtmosphere(skyAt(d, DEFAULT_SKY)).palette);
      for (const [k, v] of Object.entries(t.colors)) assert.match(v, HEX, k);
      for (const r of t.tokenColors) if (r.settings.foreground) assert.match(r.settings.foreground, HEX, r.name);
    }
  });

  it('moves every workbench color gently, minute to minute', () => {
    const start = Date.UTC(2026, 9, 14, 15); // 00:00 JST
    let prev: Record<string, string> | null = null;
    for (let m = 0; m < 1440; m++) {
      const sky = skyAt(new Date(start + m * 60_000), { ...DEFAULT_SKY, useLocalTime: false });
      const colors = buildTheme(computeAtmosphere(sky).palette).colors;
      if (prev) {
        for (const [k, v] of Object.entries(colors)) {
          const d = hexDelta(prev[k], v);
          assert.ok(d < 0.015, `${k} jumped ${d.toFixed(4)} at minute ${m}`);
        }
      }
      prev = colors;
    }
  });

  it('can turn the shoreline status bar off', () => {
    const p = staticAtmosphere().palette;
    const on = buildTheme(p, { atmosphericStatusBar: true }).colors;
    const off = buildTheme(p, { atmosphericStatusBar: false }).colors;
    assert.notEqual(on['statusBar.background'], off['statusBar.background']);
    assert.equal(off['statusBar.background'], on['titleBar.activeBackground']);
  });
});

describe('settings overrides', () => {
  const p = computeAtmosphere(skyAt(new Date(Date.UTC(2026, 9, 15, 3)), DEFAULT_SKY), DEFAULT_ATMOSPHERE).palette;
  const theme = buildTheme(p);
  const rules = tagRules(theme.tokenColors);

  it('keeps the user’s own entries in the scoped block', () => {
    const block = { 'editor.background': '#000000', 'myExtension.color': '#ff0000' };
    const merged = mergeColors(block, theme.colors, []);
    assert.equal(merged['myExtension.color'], '#ff0000');
    assert.equal(merged['editor.background'], theme.colors['editor.background']);
    // ...and removal gives them back untouched.
    assert.deepEqual(stripColors(merged, Object.keys(theme.colors)), { 'myExtension.color': '#ff0000' });
  });

  it('skips writes that would not be visible', () => {
    const block = mergeColors(undefined, theme.colors, []);
    assert.equal(colorsDelta(block, theme.colors), 0);
    assert.equal(colorsDelta(undefined, theme.colors), Infinity);
    const later = buildTheme(computeAtmosphere(skyAt(new Date(Date.UTC(2026, 9, 15, 3, 1)), DEFAULT_SKY)).palette);
    assert.ok(colorsDelta(block, later.colors) < CHANGE_THRESHOLD, 'one minute at noon is not worth a write');
  });

  it('puts the user’s TextMate rules after ours so they win', () => {
    const mine = { name: 'my comments', scope: ['comment'], settings: { foreground: '#ff00ff' } };
    const merged = mergeRules({ textMateRules: [mine] }, rules);
    const list = merged.textMateRules as unknown[];
    assert.deepEqual(list[list.length - 1], mine);
    assert.equal(rulesDelta(merged, rules), 0);
    assert.ok(rules.every((r) => r.name.startsWith(RULE_PREFIX)));
    assert.deepEqual(stripRules(merged), { textMateRules: [mine] });
  });

  it('round-trips semantic rules', () => {
    const merged = mergeSemantic({ rules: { 'myToken': '#123456' } }, theme.semanticTokenColors, []);
    assert.equal(semanticDelta(merged, theme.semanticTokenColors), 0);
    assert.deepEqual(stripSemantic(merged, Object.keys(theme.semanticTokenColors)), {
      enabled: true,
      rules: { myToken: '#123456' },
    });
  });

  it('removes the scoped key cleanly', () => {
    const outer = { [SCOPE_KEY]: { a: 1 }, '[Other Theme]': { b: 2 } };
    assert.deepEqual(withScope(outer, undefined), { '[Other Theme]': { b: 2 } });
    assert.equal(withScope({ [SCOPE_KEY]: {} }, undefined), undefined);
  });
});
