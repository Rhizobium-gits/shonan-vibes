import * as vscode from 'vscode';
import {
  Settings,
  SECTION,
  atmosphereOptions,
  clockFor,
  isThemeActive,
  readSettings,
  skyOptions,
} from './config';
import { computeAtmosphere, skyAt, staticAtmosphere } from './engine';
import { SceneFrame, dayFrames, sceneFrame } from './frame';
import { SettingsWriter } from './settingsWriter';
import { buildTheme } from './theme/mapper';

export interface Moment {
  frame: SceneFrame;
  settings: Settings;
}

/**
 * The slow heartbeat. Every few minutes: where is the sun, what does the
 * coast look like, and has it changed enough to be worth telling VS Code?
 * Nothing animates; colors are rewritten only when the difference would be
 * perceptible, which during deep night or high noon means almost never.
 */
export class Controller implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Moment>();
  readonly onDidChangeMoment = this.emitter.event;

  private readonly writer: SettingsWriter;
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();
  private settings = readSettings();
  private latest: Moment | undefined;

  constructor(
    context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.writer = new SettingsWriter(context.globalState);

    this.disposables.push(
      this.emitter,
      vscode.workspace.onDidChangeConfiguration((e) => this.onConfiguration(e)),
      // Laptops sleep; catch up as soon as the window is used again.
      vscode.window.onDidChangeWindowState((s) => s.focused && this.refresh()),
    );
  }

  get moment(): Moment | undefined {
    return this.latest;
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  start(): void {
    this.schedule();
    void this.refresh();
  }

  /** Re-evaluate the light now. `force` writes even if nothing changed. */
  refresh(force = false): Promise<void> {
    this.queue = this.queue.then(() => this.tick(force)).catch((err) => this.log.error(err));
    return this.queue;
  }

  /** Today's light, every 10 minutes, for the Shoreline scrubber. */
  today(): SceneFrame[] {
    return dayFrames(new Date(), skyOptions(this.settings), atmosphereOptions(this.settings));
  }

  async removeOverrides(): Promise<void> {
    this.queue = this.queue.then(() => this.writer.remove());
    await this.queue;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    for (const d of this.disposables) d.dispose();
  }

  // -------------------------------------------------------------------------

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), this.settings.updateIntervalMinutes * 60_000);
  }

  private onConfiguration(e: vscode.ConfigurationChangeEvent): void {
    const ours = e.affectsConfiguration(SECTION);
    const theme =
      e.affectsConfiguration('workbench.colorTheme') ||
      e.affectsConfiguration('workbench.preferredDarkColorTheme') ||
      e.affectsConfiguration('workbench.preferredLightColorTheme') ||
      e.affectsConfiguration('window.autoDetectColorScheme');
    if (!ours && !theme) return;

    const before = this.settings;
    this.settings = readSettings();
    if (before.updateIntervalMinutes !== this.settings.updateIntervalMinutes) this.schedule();

    if (before.dynamicColors && !this.settings.dynamicColors) {
      this.log.info('Dynamic colors turned off; restoring the static theme.');
      this.queue = this.queue.then(() => this.writer.remove()).catch((err) => this.log.error(err));
    }
    // Show the change at once (the perceptual threshold still applies).
    void this.refresh();
  }

  private async tick(force: boolean): Promise<void> {
    const s = this.settings;
    const when = clockFor(s);
    const sky = skyAt(when, skyOptions(s));
    const options = atmosphereOptions(s);
    const scene = computeAtmosphere(sky, { ...options, intensity: 1 });
    const editor = s.dynamicColors ? computeAtmosphere(sky, options) : staticAtmosphere(options);

    this.latest = { frame: sceneFrame(when, sky, editor, scene, s.cloudCover), settings: s };
    this.emitter.fire(this.latest);

    if (!s.dynamicColors || !isThemeActive()) return;

    const theme = buildTheme(editor.palette, { atmosphericStatusBar: s.atmosphericStatusBar });
    const writes = await this.writer.apply(theme, force);
    if (writes > 0) {
      this.log.info(
        `${this.latest.frame.clock} ${editor.phaseName} (sun ${sky.sun.altitude.toFixed(1)}°): updated ${writes} setting(s).`,
      );
    }
  }
}
