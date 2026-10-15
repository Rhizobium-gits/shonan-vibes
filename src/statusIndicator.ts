import * as vscode from 'vscode';
import { Moment } from './controller';
import { skyOptions } from './config';
import { clockLabel } from './frame';
import { todaysMoon, todaysSunTimes } from './engine';

/**
 * One small dot at the far right of the status bar, in the color of the
 * light: moon silver, dawn pink, sunlight, sunset coral. Updating it costs
 * nothing (no settings are written), so it simply follows every tick.
 */
export class StatusIndicator implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem('shonanVibes.light', vscode.StatusBarAlignment.Right, -1000);
    this.item.name = 'Shonan Vibes';
    this.item.text = '$(circle-small-filled)';
    this.item.command = 'shonanVibes.openShoreline';
  }

  update({ frame, settings }: Moment): void {
    if (!settings.statusBarIndicator) {
      this.item.hide();
      return;
    }
    this.item.color = frame.colors.glow;

    const sun = frame.sun.altitude;
    const where =
      sun > 0
        ? `Sun ${sun.toFixed(0)}° above the horizon, ${frame.sun.rising ? 'rising' : 'sinking'}`
        : `Sun ${Math.abs(sun).toFixed(0)}° below the horizon`;
    const times = todaysSunTimes(new Date(), skyOptions(settings));
    const fmt = (d: Date | null) => (d ? clockLabel(d.getHours() * 60 + d.getMinutes()) : '—');

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ['shonanVibes.openShoreline', 'shonanVibes.previewTime', 'shonanVibes.followSun'] };
    md.appendMarkdown(`**Shonan Vibes** · ${frame.phaseName}\n\n`);
    md.appendMarkdown(`${where}  \nSunrise ${fmt(times.sunrise)} · Sunset ${fmt(times.sunset)}\n\n`);
    const moon = todaysMoon(new Date(), skyOptions(settings));
    md.appendMarkdown(
      `${moon.name}, ${Math.round(moon.illumination * 100)}% lit  \n` +
        `Moonrise ${fmt(moon.rise)} · Highest ${fmt(moon.transit)} · Moonset ${fmt(moon.set)}\n\n`,
    );
    if (settings.fixedTime !== null) {
      md.appendMarkdown(`Light held at **${frame.clock}** · [Follow the sun](command:shonanVibes.followSun)\n\n`);
    } else if (!settings.dynamicColors) {
      md.appendMarkdown(`Dynamic colors are off.\n\n`);
    }
    md.appendMarkdown(
      `[Open Shoreline](command:shonanVibes.openShoreline) · [Hold the light…](command:shonanVibes.previewTime)`,
    );
    this.item.tooltip = md;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
