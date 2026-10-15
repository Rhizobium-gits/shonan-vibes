/**
 * Runs inside a real VS Code (Extension Development Host) with a throwaway
 * profile. Checks the parts unit tests cannot: activation, theme-scoped
 * settings writes, user entries being preserved, clean removal, commands.
 *
 *   npm run test:integration
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

const SCOPE = '[Shonan Vibes]';
const G = vscode.ConfigurationTarget.Global;

function block(key: string): Record<string, unknown> | undefined {
  const outer = vscode.workspace.getConfiguration().inspect<Record<string, unknown>>(key)?.globalValue;
  const b = outer?.[SCOPE];
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : undefined;
}

async function until(what: string, ok: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722;
}

export async function run(): Promise<void> {
  const log: string[] = [];
  const step = (s: string) => log.push(`✔ ${s}`);
  try {
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'shonan-vibes');
    assert.ok(ext, 'extension present');
    await ext.activate();
    step('activates');

    const commands = await vscode.commands.getCommands(true);
    for (const c of ['openShoreline', 'previewTime', 'followSun', 'toggleDynamicColors', 'refresh', 'removeOverrides']) {
      assert.ok(commands.includes(`shonanVibes.${c}`), c);
    }
    step('registers 6 commands');

    const config = () => vscode.workspace.getConfiguration();
    await config().update('shonanVibes.fixedTime', '02:00', G);
    await config().update('workbench.colorTheme', 'Shonan Vibes', G);
    await until('colors written', () => typeof block('workbench.colorCustomizations')?.['editor.background'] === 'string');
    await until('token rules written', () => Array.isArray(block('editor.tokenColorCustomizations')?.textMateRules));
    await until('semantic rules written', () => block('editor.semanticTokenColorCustomizations')?.enabled === true);
    const night = block('workbench.colorCustomizations')!['editor.background'] as string;
    const count = Object.keys(block('workbench.colorCustomizations')!).length;
    const rules = block('editor.tokenColorCustomizations')!.textMateRules as { name: string }[];
    assert.ok(count > 400, `${count} colors`);
    assert.ok(rules.every((r) => r.name.startsWith('Shonan Vibes · ')));
    step(`writes ${count} workbench colors + ${rules.length} TextMate rules, scoped to "${SCOPE}" (02:00 → ${night})`);

    // A user's own entry inside the block must survive updates and removal.
    const withMine = { ...(config().inspect<Record<string, unknown>>('workbench.colorCustomizations')!.globalValue ?? {}) };
    withMine[SCOPE] = { ...(withMine[SCOPE] as object), 'myExtension.color': '#ff00ff' };
    await config().update('workbench.colorCustomizations', withMine, G);

    await config().update('shonanVibes.fixedTime', '12:00', G);
    await until('noon colors', () => block('workbench.colorCustomizations')?.['editor.background'] !== night);
    const noon = block('workbench.colorCustomizations')!['editor.background'] as string;
    assert.ok(luminance(noon) > luminance(night), `noon ${noon} lighter than night ${night}`);
    assert.ok(luminance(noon) < 60, `noon ${noon} is still a dark room`);
    assert.equal(block('workbench.colorCustomizations')!['myExtension.color'], '#ff00ff');
    step(`follows the held time (12:00 → ${noon}) and keeps the user's own entries`);

    await vscode.commands.executeCommand('shonanVibes.openShoreline');
    await until('shoreline tab', () =>
      vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === 'Shoreline')),
    );
    step('opens the Shoreline editor tab');

    await config().update('shonanVibes.dynamicColors', false, G);
    await until('overrides removed', () => block('workbench.colorCustomizations')?.['editor.background'] === undefined);
    assert.deepEqual(block('workbench.colorCustomizations'), { 'myExtension.color': '#ff00ff' });
    assert.equal(block('editor.tokenColorCustomizations'), undefined);
    assert.equal(block('editor.semanticTokenColorCustomizations'), undefined);
    step('turning dynamic colors off removes everything it wrote, and only that');

    await config().update('workbench.colorTheme', 'Default Dark Modern', G);
    await config().update('shonanVibes.dynamicColors', true, G);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(block('workbench.colorCustomizations')?.['editor.background'], undefined);
    step('writes nothing while another theme is active');
  } catch (err) {
    log.push(`✘ ${(err as Error).stack ?? err}`);
    throw err;
  } finally {
    const out = process.env.SHONAN_INTEGRATION_LOG;
    if (out) fs.writeFileSync(out, log.join('\n') + '\n');
  }
}
