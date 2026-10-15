import * as vscode from 'vscode';
import { SECTION, skyOptions } from './config';
import { Controller } from './controller';
import { KEYFRAMES, dayPhase, skyAt } from './engine';
import { clockLabel } from './frame';
import { ShorelinePanel, ShorelineViewProvider } from './shoreline';
import { StatusIndicator } from './statusIndicator';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Shonan Vibes', { log: true });
  const controller = new Controller(context, log);
  const indicator = new StatusIndicator();
  const view = new ShorelineViewProvider(context.extensionUri, controller);

  context.subscriptions.push(
    log,
    controller,
    indicator,
    view,
    controller.onDidChangeMoment((m) => indicator.update(m)),
    vscode.window.registerWebviewViewProvider(ShorelineViewProvider.viewType, view),

    vscode.commands.registerCommand('shonanVibes.openShoreline', () =>
      ShorelinePanel.show(context.extensionUri, controller),
    ),
    vscode.commands.registerCommand('shonanVibes.previewTime', () => pickTime(controller)),
    vscode.commands.registerCommand('shonanVibes.followSun', () => setGlobal('fixedTime', '')),
    vscode.commands.registerCommand('shonanVibes.toggleDynamicColors', () => {
      const on = vscode.workspace.getConfiguration(SECTION).get<boolean>('dynamicColors', true);
      return setGlobal('dynamicColors', !on);
    }),
    vscode.commands.registerCommand('shonanVibes.refresh', () => controller.refresh(true)),
    vscode.commands.registerCommand('shonanVibes.removeOverrides', async () => {
      await setGlobal('dynamicColors', false);
      await controller.removeOverrides();
      void vscode.window.showInformationMessage(
        'Shonan Vibes: dynamic colors removed from your settings. The theme is now static; turn "Dynamic Colors" back on any time.',
      );
    }),
  );

  controller.start();
}

export function deactivate(): void {
  // Overrides stay in settings on purpose: the next window opens in the
  // last light instead of flashing the static theme first.
}

function setGlobal(key: string, value: unknown): Thenable<void> {
  return vscode.workspace.getConfiguration(SECTION).update(key, value, vscode.ConfigurationTarget.Global);
}

interface TimeItem extends vscode.QuickPickItem {
  minutes?: number | null;
  custom?: boolean;
}

/** Offer today's real time for each moment of light, plus a custom time. */
async function pickTime(controller: Controller): Promise<void> {
  const settings = controller.currentSettings;
  const opts = skyOptions(settings);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const phases: number[] = [];
  for (let m = 0; m < 1440; m++) {
    phases.push(dayPhase(skyAt(new Date(start.getTime() + m * 60_000), opts).sun));
  }
  const seen = new Set<string>();
  const items: TimeItem[] = [
    {
      label: '$(sync) Follow the sun',
      description: settings.fixedTime === null ? 'current' : 'live',
      minutes: null,
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
  ];
  for (const k of KEYFRAMES) {
    if (seen.has(k.name)) continue;
    seen.add(k.name);
    let best = 0;
    let bestD = Infinity;
    phases.forEach((p, m) => {
      const d = Math.min(Math.abs(p - k.at), 1 - Math.abs(p - k.at));
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    });
    items.push({ label: k.name, description: clockLabel(best), minutes: best });
  }
  items.sort((a, b) => (a.minutes ?? -1) - (b.minutes ?? -1));
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator }, { label: '$(clock) Another time…', custom: true });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Shonan Vibes: hold the light at a time of day',
    placeHolder: 'Times are today’s, on your clock',
  });
  if (!picked) return;
  if (picked.custom) {
    const value = await vscode.window.showInputBox({
      title: 'Hold the light at…',
      prompt: 'Time of day, HH:MM (24-hour)',
      value: settings.fixedTime === null ? clockLabel(new Date().getHours() * 60) : clockLabel(settings.fixedTime),
      validateInput: (v) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? undefined : 'Use HH:MM, e.g. 17:30'),
    });
    if (value) await setGlobal('fixedTime', value.trim());
    return;
  }
  await setGlobal('fixedTime', picked.minutes == null ? '' : clockLabel(picked.minutes));
}
