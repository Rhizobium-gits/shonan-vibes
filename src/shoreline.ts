import * as vscode from 'vscode';
import { Controller, Moment } from './controller';
import { SECTION, skyOptions } from './config';
import { moonLine } from './moonLine';
import { clockLabel } from './frame';

type Mode = 'view' | 'panel';

interface FromWebview {
  type: 'ready' | 'hold' | 'open';
  minutes?: number;
}

/**
 * The Shoreline: a small pixel-art coast that follows the same light as the
 * editor. VS Code themes cannot draw pictures, so this is where the beach,
 * the moon and the distant lights live.
 *
 *  - a view in the bottom panel ("the beach continues below the editor")
 *  - an editor tab with a scrubber to preview any hour without touching
 *    settings
 *
 * Both render a static frame per update; the optional shimmer is a few
 * pixels changing about once a second, only while visible.
 */
export class ShorelineViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'shonanVibes.shoreline';
  private view: vscode.WebviewView | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: Controller,
  ) {
    this.subscription = controller.onDidChangeMoment((m) => this.post(m));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot(this.extensionUri)] };
    view.webview.html = html(view.webview, this.extensionUri, 'view');
    view.webview.onDidReceiveMessage((msg: FromWebview) => {
      if (msg.type === 'ready') this.post(this.controller.moment);
      if (msg.type === 'open') void vscode.commands.executeCommand('shonanVibes.openShoreline');
    });
    view.onDidChangeVisibility(() => view.visible && this.post(this.controller.moment));
    view.onDidDispose(() => (this.view = undefined));
  }

  private post(m: Moment | undefined): void {
    if (!m || !this.view?.visible) return;
    void this.view.webview.postMessage({ type: 'frame', frame: m.frame, motion: m.settings.shorelineMotion });
  }

  dispose(): void {
    this.subscription.dispose();
  }
}

export class ShorelinePanel {
  private static current: ShorelinePanel | undefined;

  static show(extensionUri: vscode.Uri, controller: Controller): void {
    if (ShorelinePanel.current) {
      ShorelinePanel.current.panel.reveal();
      return;
    }
    ShorelinePanel.current = new ShorelinePanel(extensionUri, controller);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    extensionUri: vscode.Uri,
    private readonly controller: Controller,
  ) {
    this.panel = vscode.window.createWebviewPanel('shonanVibes.shorelinePanel', 'Shoreline', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [mediaRoot(extensionUri)],
    });
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
    this.panel.webview.html = html(this.panel.webview, extensionUri, 'panel');

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg)),
      controller.onDidChangeMoment((m) => this.postFrame(m)),
      this.panel.onDidChangeViewState(() => this.panel.visible && this.postDay()),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  private onMessage(msg: FromWebview): void {
    if (msg.type === 'ready') this.postDay();
    if (msg.type === 'hold' && typeof msg.minutes === 'number') {
      void vscode.workspace
        .getConfiguration(SECTION)
        .update('fixedTime', clockLabel(msg.minutes), vscode.ConfigurationTarget.Global);
    }
  }

  private postDay(): void {
    const m = this.controller.moment;
    if (!m) return;
    void this.panel.webview.postMessage({
      type: 'day',
      frames: this.controller.today(),
      moon: moonLine(new Date(), skyOptions(m.settings)),
      frame: m.frame,
      held: m.settings.fixedTime !== null,
      motion: m.settings.shorelineMotion,
    });
  }

  private postFrame(m: Moment): void {
    if (!this.panel.visible) return;
    void this.panel.webview.postMessage({
      type: 'frame',
      frame: m.frame,
      held: m.settings.fixedTime !== null,
      motion: m.settings.shorelineMotion,
    });
  }

  private dispose(): void {
    ShorelinePanel.current = undefined;
    for (const d of this.disposables) d.dispose();
  }
}

// ---------------------------------------------------------------------------

function mediaRoot(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'media');
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri, mode: Mode): string {
  const n = nonce();
  const uri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot(extensionUri), file));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${n}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('shoreline.css')}">
<title>Shoreline</title>
</head>
<body data-mode="${mode}">
${mode === 'panel' ? PANEL_BODY : VIEW_BODY}
<script nonce="${n}" src="${uri('shoreline.js')}"></script>
</body>
</html>`;
}

const VIEW_BODY = `<div class="scene-wrap view"><canvas id="scene" aria-label="The Shonan coast at the current time of day"></canvas></div>`;

const PANEL_BODY = `
<main class="panel">
  <div class="scene-wrap"><canvas id="scene" aria-label="The Shonan coast at the selected time of day"></canvas></div>
  <section class="timeline" aria-label="Time of day">
    <div class="readout">
      <span id="clock" class="clock">--:--</span>
      <span id="phase" class="phase"></span>
      <span id="sun" class="sun"></span>
    </div>
    <div id="moon" class="moonline"></div>
    <input id="scrub" type="range" min="0" max="1430" step="10" aria-label="Preview a time of day">
    <div class="hours" aria-hidden="true"><span>0</span><span>3</span><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
    <div class="actions">
      <button id="now" type="button">Now</button>
      <button id="hold" type="button">Hold the light here</button>
      <span id="note" class="note"></span>
    </div>
  </section>
  <section class="preview" aria-label="Editor preview">
    <pre id="code"></pre>
    <div class="statusbar"><span class="remote">shonan</span><span class="item">main</span><span class="item grow"></span><span class="item">Ln 12, Col 8</span><span class="item dot">●</span></div>
  </section>
</main>`;
