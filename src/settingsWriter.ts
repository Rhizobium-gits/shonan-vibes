import * as vscode from 'vscode';
import { ThemeOutput } from './theme/mapper';
import {
  CHANGE_THRESHOLD,
  SCOPE_KEY,
  colorsDelta,
  isObject,
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
} from './theme/overrides';

const COLORS = 'workbench.colorCustomizations';
const TOKENS = 'editor.tokenColorCustomizations';
const SEMANTIC = 'editor.semanticTokenColorCustomizations';

const MANAGED_COLORS = 'shonanVibes.managedColorKeys';
const MANAGED_SEMANTIC = 'shonanVibes.managedSemanticKeys';

/**
 * Writes the dynamic colors into user settings, but only when the change is
 * perceptible. The current settings are the source of truth, so several
 * VS Code windows (all running this extension) agree instead of racing:
 * whichever writes first, the others then see nothing left to change.
 */
export class SettingsWriter {
  constructor(private readonly state: vscode.Memento) {}

  /** Returns how many settings were written (0..3). */
  async apply(theme: ThemeOutput, force = false): Promise<number> {
    let writes = 0;
    const threshold = force ? -1 : CHANGE_THRESHOLD;

    const colors = this.userValue(COLORS);
    if (colorsDelta(colors?.[SCOPE_KEY], theme.colors) > threshold) {
      const before = this.state.get<string[]>(MANAGED_COLORS, []);
      await this.write(COLORS, withScope(colors, mergeColors(colors?.[SCOPE_KEY], theme.colors, before)));
      await this.state.update(MANAGED_COLORS, Object.keys(theme.colors));
      writes++;
    }

    const rules = tagRules(theme.tokenColors);
    const tokens = this.userValue(TOKENS);
    if (rulesDelta(tokens?.[SCOPE_KEY], rules) > threshold) {
      await this.write(TOKENS, withScope(tokens, mergeRules(tokens?.[SCOPE_KEY], rules)));
      writes++;
    }

    const semantic = this.userValue(SEMANTIC);
    if (semanticDelta(semantic?.[SCOPE_KEY], theme.semanticTokenColors) > threshold) {
      const before = this.state.get<string[]>(MANAGED_SEMANTIC, []);
      const block = mergeSemantic(semantic?.[SCOPE_KEY], theme.semanticTokenColors, before);
      await this.write(SEMANTIC, withScope(semantic, block));
      await this.state.update(MANAGED_SEMANTIC, Object.keys(theme.semanticTokenColors));
      writes++;
    }
    return writes;
  }

  /** Take every dynamic color back out of settings; the user's own entries stay. */
  async remove(): Promise<void> {
    const managedColors = this.state.get<string[]>(MANAGED_COLORS, []);
    const managedSemantic = this.state.get<string[]>(MANAGED_SEMANTIC, []);

    const colors = this.userValue(COLORS);
    if (colors && SCOPE_KEY in colors) {
      await this.write(COLORS, withScope(colors, stripColors(colors[SCOPE_KEY], managedColors)));
    }
    const tokens = this.userValue(TOKENS);
    if (tokens && SCOPE_KEY in tokens) {
      await this.write(TOKENS, withScope(tokens, stripRules(tokens[SCOPE_KEY])));
    }
    const semantic = this.userValue(SEMANTIC);
    if (semantic && SCOPE_KEY in semantic) {
      await this.write(SEMANTIC, withScope(semantic, stripSemantic(semantic[SCOPE_KEY], managedSemantic)));
    }
    await this.state.update(MANAGED_COLORS, undefined);
    await this.state.update(MANAGED_SEMANTIC, undefined);
  }

  private userValue(key: string): Record<string, unknown> | undefined {
    const v = vscode.workspace.getConfiguration().inspect(key)?.globalValue;
    return isObject(v) ? v : undefined;
  }

  private async write(key: string, value: unknown): Promise<void> {
    await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
  }
}
