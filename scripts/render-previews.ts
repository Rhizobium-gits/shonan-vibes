/**
 * README previews: a VS Code window painted with the real generated theme
 * (workbench colors, syntax colors, the shoreline status bar, and the actual
 * Shoreline scene in the panel), captured with headless Chrome.
 *
 *   npm run build && npm run previews
 *
 * Set CHROME=/path/to/chrome if Chrome is not in the default macOS location.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_ATMOSPHERE, DEFAULT_SKY, SkyOptions } from '../src/engine';
import { SceneFrame, dayFrames, frameAt } from '../src/frame';
import { buildTheme } from '../src/theme/mapper';
import { moonLine } from '../src/moonLine';
import { computeAtmosphere, skyAt } from '../src/engine';

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'media', 'screenshots');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shonan-previews-'));
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shorelineJs = fs.readFileSync(path.join(root, 'media', 'shoreline.js'), 'utf8');
const shorelineCss = fs.readFileSync(path.join(root, 'media', 'shoreline.css'), 'utf8');

// The real sky over Shonan, independent of the machine's time zone.
const SKY: SkyOptions = { ...DEFAULT_SKY, useLocalTime: false };
const JST = (iso: string) => new Date(`${iso}+09:00`);

const MOMENTS: { file: string; at: string }[] = [
  { file: 'night', at: '2026-10-15T01:40:00' },
  { file: 'sunrise', at: '2026-10-15T05:52:00' },
  { file: 'day', at: '2026-10-15T11:30:00' },
  { file: 'golden-hour', at: '2026-10-15T16:35:00' },
  { file: 'sunset', at: '2026-10-15T17:06:00' },
  { file: 'twilight', at: '2026-10-15T17:38:00' },
];

// ---------------------------------------------------------------------------
// A tiny TypeScript-ish highlighter, mapped onto the theme's syntax roles.
// ---------------------------------------------------------------------------

const CODE = `import { sunPosition, Sky } from './solar';

/** Light over the coast, from the sun's height. */
export interface Tide {
  readonly phase: 'rising' | 'ebbing';
  height: number;
}

export function lightAt(date: Date, latitude = 35.3): string {
  const sun = sunPosition(date.getTime(), latitude, 139.48);
  if (sun.altitude < -18) return \`night \${date.getHours()}h\`;
  const warm = Math.max(0, 1 - sun.altitude / 12);
  return warm > 0.5 ? 'golden' : 'clear';
}

// One theme. One coastline. One day.
export const coast = new Sky({ name: 'Shonan', tides: true });`;

const KEYWORDS = new Set([
  'import', 'from', 'export', 'interface', 'readonly', 'function', 'const', 'let', 'if', 'return', 'new',
]);
const PARAMS = new Set(['date', 'latitude']);

type Tok = { role: string; text: string };

function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re =
    /(\/\/.*$|\/\*\*.*\*\/)|('(?:[^'\\]|\\.)*')|(`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(=>|[<>]=?|[-+*/=|?:!]+)|([^\s])/g;
  let m: RegExpExecArray | null;
  let prevSignificant = '';
  while ((m = re.exec(line))) {
    const [text, comment, str, tmpl, num, ident, space, op] = m;
    let role = 'punct';
    if (comment) role = 'comment';
    else if (str) role = 'string';
    else if (tmpl) {
      // Split template literal into string and ${ expression } parts.
      for (const part of tmpl.split(/(\$\{[^}]*\})/)) {
        if (!part) continue;
        if (part.startsWith('${')) {
          out.push({ role: 'keyword', text: '${' });
          out.push(...tokenize(part.slice(2, -1)));
          out.push({ role: 'keyword', text: '}' });
        } else out.push({ role: 'string', text: part });
      }
      prevSignificant = '`';
      continue;
    } else if (num) role = 'number';
    else if (ident) {
      const next = line.slice(re.lastIndex).match(/^\s*(.)/)?.[1];
      if (KEYWORDS.has(ident)) role = 'keyword';
      else if (ident === 'true' || ident === 'false') role = 'number';
      else if (next === '(') role = 'func';
      else if (/^[A-Z]/.test(ident)) role = 'type';
      else if (prevSignificant === '.') role = 'property';
      else if (PARAMS.has(ident)) role = 'param';
      else if (next === ':' && prevSignificant !== '?') role = 'property';
      else if (ident === 'string' || ident === 'number') role = 'type';
      else role = 'text';
    } else if (space) role = 'space';
    else if (op) role = 'operator';
    out.push({ role, text });
    if (!space) prevSignificant = text;
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------

function windowHtml(frame: SceneFrame, colors: Record<string, string>): string {
  const c = (k: string) => colors[k];
  const p = frame.colors;
  const code = CODE.split('\n')
    .map((line, i) => {
      const cur = i === 10;
      const html = tokenize(line)
        .map((t) => {
          if (t.role === 'space') return esc(t.text);
          const italic = t.role === 'comment' ? 'font-style:italic;' : '';
          return `<span style="color:${p[t.role] ?? p.text};${italic}">${esc(t.text)}</span>`;
        })
        .join('');
      return `<div class="row${cur ? ' cur' : ''}"><span class="ln" style="color:${cur ? c('editorLineNumber.activeForeground') : c('editorLineNumber.foreground')}">${i + 1}</span><span class="src">${html || ' '}${cur ? '<span class="cursor"></span>' : ''}</span></div>`;
    })
    .join('');

  const tree = [
    { d: 0, label: 'SHONAN-VIBES', head: true },
    { d: 0, label: 'media', folder: true },
    { d: 0, label: 'src', folder: true, open: true },
    { d: 1, label: 'engine', folder: true, open: true },
    { d: 2, label: 'atmosphere.ts', git: 'gitDecoration.modifiedResourceForeground', mark: 'M' },
    { d: 2, label: 'moods.ts' },
    { d: 2, label: 'sky.ts', selected: true },
    { d: 2, label: 'solar.ts', git: 'gitDecoration.untrackedResourceForeground', mark: 'U' },
    { d: 1, label: 'theme', folder: true },
    { d: 1, label: 'extension.ts' },
    { d: 0, label: 'themes', folder: true },
    { d: 0, label: 'package.json' },
    { d: 0, label: 'README.md', git: 'gitDecoration.modifiedResourceForeground', mark: 'M' },
  ]
    .map((r) => {
      if (r.head) return `<div class="section">⌄ ${r.label}</div>`;
      const fg = r.git ? c(r.git) : c('sideBar.foreground');
      const bg = r.selected ? `background:${c('list.activeSelectionBackground')};outline:1px solid ${c('list.focusOutline')};outline-offset:-1px;` : '';
      const chevron = r.folder ? (r.open ? '⌄' : '›') : '';
      return `<div class="item" style="padding-left:${12 + r.d * 14}px;color:${fg};${bg}"><span class="chev">${chevron}</span>${r.label}${r.mark ? `<span class="mark">${r.mark}</span>` : ''}</div>`;
    })
    .join('');

  const icon = (d: string, active = false) =>
    `<div class="act${active ? ' on' : ''}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${active ? c('activityBar.foreground') : c('activityBar.inactiveForeground')}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${shorelineCss}
* { box-sizing: border-box; }
html, body { margin:0; height:100%; background:${c('editor.background')}; overflow:hidden; }
body { font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:${c('foreground')}; }
.win { position:absolute; inset:0; display:grid; grid-template-rows: 35px 1fr 22px; }
.title { background:${c('titleBar.activeBackground')}; display:flex; align-items:center; justify-content:center; position:relative; }
.lights { position:absolute; left:14px; display:flex; gap:8px; }
.lights i { width:12px; height:12px; border-radius:50%; display:block; opacity:.85 }
.cc { width:440px; height:24px; border-radius:6px; background:${c('commandCenter.background')}; border:1px solid ${c('commandCenter.border')}; color:${c('commandCenter.foreground')}; display:flex; align-items:center; justify-content:center; font-size:12px; }
.body { display:grid; grid-template-columns: 48px 250px 1fr; min-height:0; }
.activity { background:${c('activityBar.background')}; padding-top:4px; }
.act { height:48px; display:flex; align-items:center; justify-content:center; border-left:2px solid transparent; }
.act.on { border-left-color:${c('activityBar.activeBorder')}; }
.side { background:${c('sideBar.background')}; border-right:1px solid ${c('sideBar.border')}; font-size:13px; }
.side .title2 { height:35px; display:flex; align-items:center; padding-left:20px; font-size:11px; letter-spacing:.04em; color:${c('sideBarTitle.foreground')}; }
.section { height:22px; display:flex; align-items:center; padding-left:6px; font-size:11px; font-weight:700; color:${c('sideBarSectionHeader.foreground')}; }
.item { height:22px; display:flex; align-items:center; gap:4px; position:relative; }
.chev { width:14px; display:inline-block; color:${c('icon.foreground')}; }
.mark { position:absolute; right:12px; font-size:12px; }
.main { display:grid; grid-template-rows: 35px 22px 1fr 236px; min-width:0; min-height:0; }
.tabs { background:${c('editorGroupHeader.tabsBackground')}; display:flex; }
.tab { padding:0 16px; display:flex; align-items:center; color:${c('tab.inactiveForeground')}; background:${c('tab.inactiveBackground')}; border-right:1px solid ${c('tab.border')}; font-size:13px; }
.tab.on { background:${c('tab.activeBackground')}; color:${c('tab.activeForeground')}; box-shadow: inset 0 1px 0 ${c('tab.activeBorderTop')}; }
.crumbs { background:${c('breadcrumb.background')}; color:${c('breadcrumb.foreground')}; font-size:12px; display:flex; align-items:center; padding-left:18px; }
.editor { background:${c('editor.background')}; font: 13px/20px "SF Mono", Menlo, monospace; padding-top:6px; overflow:hidden; }
.row { display:flex; white-space:pre; }
.row.cur { background:${c('editor.lineHighlightBackground')}; }
.ln { width:56px; text-align:right; padding-right:24px; flex:none; }
.cursor { display:inline-block; width:2px; height:17px; vertical-align:-3px; background:${c('editorCursor.foreground')}; }
.bottom { background:${c('panel.background')}; border-top:1px solid ${c('panel.border')}; display:grid; grid-template-rows: 35px 1fr; min-height:0; }
.ptabs { display:flex; gap:22px; align-items:center; padding-left:20px; font-size:11px; letter-spacing:.03em; color:${c('panelTitle.inactiveForeground')}; }
.ptabs .on { color:${c('panelTitle.activeForeground')}; border-bottom:1px solid ${c('panelTitle.activeBorder')}; padding:9px 0 8px; }
.pbody { position:relative; margin:0 10px 10px; border-radius:3px; overflow:hidden; }
.pbody .scene-wrap.view { position:absolute; inset:0; }
.status { background:${c('statusBar.background')}; color:${c('statusBar.foreground')}; border-top:1px solid ${c('statusBar.border')}; display:flex; align-items:stretch; font-size:12px; }
.status span { display:flex; align-items:center; padding:0 8px; gap:5px; }
.status .remote { background:${c('statusBarItem.remoteBackground')}; color:${c('statusBarItem.remoteForeground')}; padding:0 10px; }
.status .grow { flex:1; }
.status .light { color:${frame.colors.glow}; font-size:10px; padding-right:12px; }
</style></head><body data-mode="view">
<div class="win">
  <div class="title"><div class="lights"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div class="cc">⌕ shonan-vibes</div></div>
  <div class="body">
    <div class="activity">
      ${icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', true)}
      ${icon('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>')}
      ${icon('<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-11 6"/>')}
      ${icon('<path d="M7 4l12 8-12 8z"/>')}
      ${icon('<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>')}
    </div>
    <div class="side"><div class="title2">EXPLORER</div>${tree}</div>
    <div class="main">
      <div class="tabs"><div class="tab on">sky.ts</div><div class="tab">moods.ts</div><div class="tab">README.md</div></div>
      <div class="crumbs">src › engine › sky.ts › <span style="margin-left:4px;color:${c('breadcrumb.focusForeground')}">lightAt</span></div>
      <div class="editor">${code}</div>
      <div class="bottom">
        <div class="ptabs"><span>PROBLEMS</span><span>OUTPUT</span><span>TERMINAL</span><span class="on">SHORELINE</span></div>
        <div class="pbody"><div class="scene-wrap view"><canvas id="scene"></canvas></div></div>
      </div>
    </div>
  </div>
  <div class="status">
    <span class="remote">⌁ shonan</span><span>⑂ main</span><span>⊘ 0  ⚠ 0</span><span class="grow"></span>
    <span>Ln 11, Col 64</span><span>Spaces: 2</span><span>UTF-8</span><span>TypeScript</span>
    <span class="light">●</span>
  </div>
</div>
<script>window.__SHONAN_FRAME__ = ${JSON.stringify(frame)};</script>
<script>${shorelineJs}</script>
</body></html>`;
}

function shorelinePanelHtml(frame: SceneFrame): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${shorelineCss}
body { font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
</style></head><body data-mode="panel">
<main class="panel">
  <div class="scene-wrap"><canvas id="scene"></canvas></div>
  <section class="timeline">
    <div class="readout"><span id="clock" class="clock"></span><span id="phase" class="phase"></span><span id="sun" class="sun"></span></div>
    <div id="moon" class="moonline">${moonLine(new Date('2026-10-15T16:35:00+09:00'), SKY)}</div>
    <input id="scrub" type="range" min="0" max="1430" step="10" value="${frame.minutes}">
    <div class="hours"><span>0</span><span>3</span><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
    <div class="actions"><button id="now" type="button">Now</button><button id="hold" type="button">Hold the light here</button></div>
  </section>
  <section class="preview"><pre id="code"></pre>
    <div class="statusbar"><span class="remote">shonan</span><span class="item">main</span><span class="item grow"></span><span class="item">Ln 12, Col 8</span><span class="item dot">●</span></div>
  </section>
</main>
<script>window.__SHONAN_FRAME__ = ${JSON.stringify(frame)};</script>
<script>${shorelineJs}</script>
</body></html>`;
}

/** 24 hours as one strip: the coast above, the editor's colors below. */
function ribbonHtml(frames: SceneFrame[]): string {
  const cols = frames
    .map((f) => {
      const s = f.scene;
      const e = f.colors;
      return `<div class="col">
        <div class="sky" style="background:linear-gradient(${s.zenith}, ${s.horizon})"></div>
        <div class="sea" style="background:linear-gradient(${s.ocean}, ${e.sea})"></div>
        <div class="room" style="background:${e.room}">
          <i style="background:${e.keyword}"></i><i style="background:${e.func}"></i><i style="background:${e.string}"></i><i style="background:${e.number}"></i><i style="background:${e.type}"></i><i style="background:${e.comment}"></i>
        </div>
      </div>`;
    })
    .join('');
  const labels = Array.from({ length: 9 }, (_, i) => `<span>${String(i * 3).padStart(2, '0')}:00</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0b1018;}
body{padding:28px 32px 20px;font:12px -apple-system,BlinkMacSystemFont,sans-serif;color:#8a94a6;}
.strip{display:flex;height:300px;border-radius:8px;overflow:hidden;}
.col{flex:1;display:grid;grid-template-rows:120px 40px 1fr;}
.room{display:flex;flex-direction:column;justify-content:center;gap:9px;padding:0 1px;}
.room i{display:block;height:6px;border-radius:1px;}
.labels{display:flex;justify-content:space-between;margin-top:10px;font-variant-numeric:tabular-nums;}
</style></head><body><div class="strip">${cols}</div><div class="labels">${labels}</div></body></html>`;
}

function shoot(name: string, html: string, width: number, height: number): void {
  const file = path.join(work, `${name}.html`);
  fs.writeFileSync(file, html);
  const out = path.join(outDir, `${name}.png`);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--virtual-time-budget=1500',
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      `file://${file}`,
    ],
    { stdio: 'ignore' },
  );
  console.log(`wrote ${path.relative(root, out)}`);
}

fs.mkdirSync(outDir, { recursive: true });
for (const m of MOMENTS) {
  const when = JST(m.at);
  const frame = frameAt(when, SKY, DEFAULT_ATMOSPHERE);
  // Label with Shonan's clock, not the machine's.
  const minutes = Number(m.at.slice(11, 13)) * 60 + Number(m.at.slice(14, 16));
  frame.minutes = minutes;
  frame.clock = m.at.slice(11, 16);
  const colors = buildTheme(computeAtmosphere(skyAt(when, SKY), DEFAULT_ATMOSPHERE).palette).colors;
  shoot(m.file, windowHtml(frame, colors), 1280, 800);
}

const golden = frameAt(JST('2026-10-15T16:35:00'), SKY, DEFAULT_ATMOSPHERE);
golden.minutes = 16 * 60 + 35;
golden.clock = '16:35';
shoot('shoreline', shorelinePanelHtml(golden), 1100, 900);

const ribbon = dayFrames(JST('2026-10-15T00:00:00'), SKY, DEFAULT_ATMOSPHERE, 10);
shoot('day-ribbon', ribbonHtml(ribbon), 1280, 380);

fs.rmSync(work, { recursive: true, force: true });
