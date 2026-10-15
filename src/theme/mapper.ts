/**
 * Final palette → VS Code colors, TextMate rules, semantic token rules.
 *
 * Pure and dependency-free: the build script uses it to write the static
 * theme JSON, and the extension uses it at runtime for the dynamic overrides,
 * so both are always the same theme.
 *
 * Visual language
 *   abyss < shade < room < raised < mist   (surfaces, darkest to lightest)
 *   title & activity bar = abyss · side bar, tabs, panel = shade
 *   editor = room · widgets & menus = mist
 *   glow  = light itself: cursor, active tab sliver, horizon line, find
 *   sky   = interaction: focus, selection, buttons
 *   sea   = the status bar, with the horizon as its top border and sand
 *           at the remote indicator, where the beach would be
 */

import {
  Lab,
  bestOn,
  ensureContrast,
  lch,
  lighten,
  mix,
  scaleChroma,
  toHex,
  withLightness,
} from '../engine/color';
import type { FinalPalette } from '../engine/atmosphere';

export const THEME_NAME = 'Shonan Vibes';

export interface ThemeOptions {
  /** Sea-colored status bar with a horizon line; off = a plain dark bar. */
  atmosphericStatusBar: boolean;
}

export interface TextMateRule {
  name: string;
  scope: string[];
  settings: { foreground?: string; fontStyle?: string };
}

export type SemanticStyle =
  | string
  | { foreground?: string; italic?: boolean; bold?: boolean; underline?: boolean; strikethrough?: boolean };

export interface ThemeOutput {
  colors: Record<string, string>;
  tokenColors: TextMateRule[];
  semanticTokenColors: Record<string, SemanticStyle>;
}

export function buildTheme(p: FinalPalette, opts: ThemeOptions = { atmosphericStatusBar: true }): ThemeOutput {
  return {
    colors: workbenchColors(p, opts),
    tokenColors: tokenColors(p),
    semanticTokenColors: semanticTokenColors(p),
  };
}

/** A complete color theme file. */
export function themeDocument(out: ThemeOutput): Record<string, unknown> {
  return {
    $schema: 'vscode://schemas/color-theme',
    name: THEME_NAME,
    type: 'dark',
    semanticHighlighting: true,
    colors: out.colors,
    tokenColors: [
      {
        settings: {
          foreground: out.colors['editor.foreground'],
          background: out.colors['editor.background'],
        },
      },
      ...out.tokenColors,
    ],
    semanticTokenColors: out.semanticTokenColors,
  };
}

// ---------------------------------------------------------------------------

/** Status hues keep a fixed meaning; the hour only tints them. */
function statusColors(p: FinalPalette) {
  return {
    danger: mix(lch(0.7, 0.115, 24), p.glow, 0.08),
    warn: mix(lch(0.8, 0.095, 80), p.type, 0.3),
    info: mix(lch(0.75, 0.08, 240), p.func, 0.3),
    success: mix(lch(0.76, 0.085, 158), p.string, 0.3),
    modified: mix(lch(0.74, 0.07, 235), p.func, 0.2),
  };
}

function workbenchColors(p: FinalPalette, opts: ThemeOptions): Record<string, string> {
  const hex = (c: Lab, alpha = 1) => toHex(c, alpha);

  const room = p.room;
  const abyss = lighten(room, -0.032);
  const shade = lighten(room, -0.016);
  const raised = lighten(room, 0.022);
  const mist = lighten(room, 0.042);
  const hairSoft = mix(room, p.text, 0.05);
  const hair = mix(room, p.text, 0.08);
  const edge = mix(room, p.text, 0.13);
  const widgetEdge = mix(mist, p.text, 0.1);
  const shadow = '#0000008c';

  const text = p.text;
  const ink = ensureContrast(withLightness(text, 0.8), shade, 7);
  const quiet = ensureContrast(mix(text, shade, 0.4), shade, 4.6);
  const faint = ensureContrast(mix(p.comment, room, 0.3), room, 2.4);
  const faintOnAbyss = ensureContrast(faint, abyss, 3);

  const accent = p.sky;
  const accentInk = ensureContrast(accent, shade, 4.8);
  const button = scaleChroma(withLightness(accent, 0.44), 0.85);
  const buttonFg = ensureContrast(text, button, 4.5);
  const glow = p.glow;
  const cursor = ensureContrast(glow, room, 4.5);
  const highlight = ensureContrast(mix(glow, accent, 0.35), mist, 4.5);
  const inlay = ensureContrast(mix(p.comment, room, 0.12), raised, 3.2);

  const s = statusColors(p);
  const ink4 = (c: Lab) => ensureContrast(c, shade, 4.5);
  const dangerInk = ink4(s.danger);
  const warnInk = ink4(s.warn);
  const infoInk = ink4(s.info);
  const successInk = ink4(s.success);
  const modifiedInk = ink4(s.modified);

  const brackets = [p.func, p.keyword, p.string, p.type, p.number, p.param].map((c) =>
    ensureContrast(scaleChroma(lighten(c, -0.03), 0.8), room, 4),
  );

  const colors: Record<string, string> = {
    // Base
    focusBorder: hex(accent, 0.55),
    foreground: hex(ink),
    disabledForeground: hex(faint),
    descriptionForeground: hex(quiet),
    errorForeground: hex(dangerInk),
    'icon.foreground': hex(quiet),
    'widget.shadow': shadow,
    'widget.border': hex(widgetEdge),
    'selection.background': hex(accent, 0.35),
    'sash.hoverBorder': hex(accent, 0.5),
    'window.activeBorder': hex(hair),
    'window.inactiveBorder': hex(hairSoft),

    // Text
    'textLink.foreground': hex(accentInk),
    'textLink.activeForeground': hex(lighten(accentInk, 0.05)),
    'textBlockQuote.background': hex(shade),
    'textBlockQuote.border': hex(accent, 0.5),
    'textCodeBlock.background': hex(abyss),
    'textPreformat.foreground': hex(p.type),
    'textPreformat.background': hex(text, 0.06),
    'textSeparator.foreground': hex(hair),
    'toolbar.hoverBackground': hex(text, 0.08),
    'toolbar.activeBackground': hex(text, 0.12),

    // Buttons & controls
    'button.background': hex(button),
    'button.foreground': hex(buttonFg),
    'button.hoverBackground': hex(lighten(button, 0.04)),
    'button.separator': hex(buttonFg, 0.3),
    'button.secondaryBackground': hex(raised),
    'button.secondaryForeground': hex(ink),
    'button.secondaryHoverBackground': hex(mist),
    'checkbox.background': hex(raised),
    'checkbox.border': hex(edge),
    'checkbox.foreground': hex(text),
    'checkbox.selectBackground': hex(mist),
    'checkbox.selectBorder': hex(accent, 0.6),
    'dropdown.background': hex(raised),
    'dropdown.listBackground': hex(mist),
    'dropdown.border': hex(edge),
    'dropdown.foreground': hex(ink),
    'input.background': hex(abyss),
    'input.border': hex(hair),
    'input.foreground': hex(text),
    'input.placeholderForeground': hex(ensureContrast(faint, abyss, 3.2)),
    'inputOption.activeBackground': hex(accent, 0.25),
    'inputOption.activeBorder': hex(accent, 0.6),
    'inputOption.activeForeground': hex(text),
    'inputOption.hoverBackground': hex(text, 0.08),
    'inputValidation.errorBackground': hex(mix(abyss, s.danger, 0.18)),
    'inputValidation.errorBorder': hex(s.danger, 0.7),
    'inputValidation.errorForeground': hex(text),
    'inputValidation.infoBackground': hex(mix(abyss, s.info, 0.18)),
    'inputValidation.infoBorder': hex(s.info, 0.7),
    'inputValidation.infoForeground': hex(text),
    'inputValidation.warningBackground': hex(mix(abyss, s.warn, 0.15)),
    'inputValidation.warningBorder': hex(s.warn, 0.7),
    'inputValidation.warningForeground': hex(text),
    'keybindingLabel.background': hex(text, 0.06),
    'keybindingLabel.foreground': hex(ink),
    'keybindingLabel.border': hex(text, 0.12),
    'keybindingLabel.bottomBorder': hex(text, 0.18),

    // Scrollbars, badges, progress
    'scrollbar.shadow': shadow,
    'scrollbarSlider.background': hex(text, 0.09),
    'scrollbarSlider.hoverBackground': hex(text, 0.15),
    'scrollbarSlider.activeBackground': hex(text, 0.22),
    'badge.background': hex(button),
    'badge.foreground': hex(buttonFg),
    'progressBar.background': hex(glow),

    // Lists & trees
    'list.activeSelectionBackground': hex(accent, 0.2),
    'list.activeSelectionForeground': hex(text),
    'list.activeSelectionIconForeground': hex(text),
    'list.inactiveSelectionBackground': hex(text, 0.07),
    'list.inactiveSelectionForeground': hex(text),
    'list.hoverBackground': hex(text, 0.045),
    'list.hoverForeground': hex(text),
    'list.focusBackground': hex(accent, 0.14),
    'list.focusForeground': hex(text),
    'list.focusOutline': hex(accent, 0.45),
    'list.focusAndSelectionOutline': hex(accent, 0.55),
    'list.inactiveFocusOutline': hex(hair),
    'list.highlightForeground': hex(highlight),
    'list.focusHighlightForeground': hex(highlight),
    'list.dropBackground': hex(accent, 0.15),
    'list.errorForeground': hex(dangerInk),
    'list.warningForeground': hex(warnInk),
    'list.invalidItemForeground': hex(dangerInk),
    'list.deemphasizedForeground': hex(faint),
    'list.filterMatchBackground': hex(glow, 0.15),
    'listFilterWidget.background': hex(mist),
    'listFilterWidget.outline': hex(accent, 0.5),
    'listFilterWidget.noMatchesOutline': hex(s.danger, 0.6),
    'tree.indentGuidesStroke': hex(text, 0.12),
    'tree.inactiveIndentGuidesStroke': hex(text, 0.06),

    // Activity bar
    'activityBar.background': hex(abyss),
    'activityBar.foreground': hex(text),
    'activityBar.inactiveForeground': hex(ensureContrast(quiet, abyss, 4)),
    'activityBar.border': hex(abyss),
    'activityBar.activeBorder': hex(glow, 0.8),
    'activityBar.activeBackground': hex(text, 0.04),
    'activityBar.dropBorder': hex(accent),
    'activityBarBadge.background': hex(button),
    'activityBarBadge.foreground': hex(buttonFg),
    'activityBarTop.foreground': hex(text),
    'activityBarTop.inactiveForeground': hex(quiet),
    'activityBarTop.activeBorder': hex(glow, 0.8),

    // Side bar
    'sideBar.background': hex(shade),
    'sideBar.foreground': hex(ink),
    'sideBar.border': hex(hairSoft),
    'sideBar.dropBackground': hex(accent, 0.12),
    'sideBarTitle.foreground': hex(quiet),
    'sideBarSectionHeader.background': hex(shade),
    'sideBarSectionHeader.foreground': hex(ink),
    'sideBarSectionHeader.border': hex(hairSoft),
    'sideBarStickyScroll.background': hex(shade),

    // Minimap
    'minimap.background': hex(room),
    'minimap.findMatchHighlight': hex(glow, 0.5),
    'minimap.selectionHighlight': hex(accent, 0.45),
    'minimap.selectionOccurrenceHighlight': hex(accent, 0.25),
    'minimap.errorHighlight': hex(s.danger, 0.7),
    'minimap.warningHighlight': hex(s.warn, 0.6),
    'minimapSlider.background': hex(text, 0.06),
    'minimapSlider.hoverBackground': hex(text, 0.1),
    'minimapSlider.activeBackground': hex(text, 0.14),
    'minimapGutter.addedBackground': hex(s.success, 0.7),
    'minimapGutter.modifiedBackground': hex(s.modified, 0.7),
    'minimapGutter.deletedBackground': hex(s.danger, 0.7),

    // Editor groups & tabs
    'editorGroup.border': hex(hairSoft),
    'editorGroup.dropBackground': hex(accent, 0.1),
    'editorGroup.emptyBackground': hex(room),
    'editorGroupHeader.tabsBackground': hex(shade),
    'editorGroupHeader.tabsBorder': hex(shade),
    'editorGroupHeader.noTabsBackground': hex(room),
    'editorGroupHeader.border': hex(hairSoft),
    'tab.activeBackground': hex(room),
    'tab.activeForeground': hex(text),
    'tab.activeBorder': hex(room),
    'tab.activeBorderTop': hex(glow, 0.65),
    'tab.unfocusedActiveBackground': hex(room),
    'tab.unfocusedActiveForeground': hex(ink),
    'tab.unfocusedActiveBorderTop': hex(glow, 0.25),
    'tab.inactiveBackground': hex(shade),
    'tab.inactiveForeground': hex(quiet),
    'tab.unfocusedInactiveBackground': hex(shade),
    'tab.unfocusedInactiveForeground': hex(ensureContrast(faint, shade, 3)),
    'tab.border': hex(shade),
    'tab.hoverBackground': hex(mix(shade, room, 0.6)),
    'tab.hoverForeground': hex(ink),
    'tab.activeModifiedBorder': hex(glow, 0.7),
    'tab.inactiveModifiedBorder': hex(glow, 0.35),
    'tab.lastPinnedBorder': hex(hair),
    'tab.dragAndDropBorder': hex(accent),
    'breadcrumb.foreground': hex(quiet),
    'breadcrumb.background': hex(room),
    'breadcrumb.focusForeground': hex(text),
    'breadcrumb.activeSelectionForeground': hex(text),
    'breadcrumbPicker.background': hex(mist),

    // Editor
    'editor.background': hex(room),
    'editor.foreground': hex(text),
    'editorLineNumber.foreground': hex(faint),
    'editorLineNumber.activeForeground': hex(ink),
    'editorCursor.foreground': hex(cursor),
    'editorCursor.background': hex(room),
    'editor.lineHighlightBackground': hex(text, 0.04),
    'editor.lineHighlightBorder': hex(room, 0),
    'editor.selectionBackground': hex(accent, 0.3),
    'editor.inactiveSelectionBackground': hex(accent, 0.15),
    'editor.selectionHighlightBackground': hex(accent, 0.14),
    'editor.wordHighlightBackground': hex(text, 0.08),
    'editor.wordHighlightStrongBackground': hex(accent, 0.18),
    'editor.wordHighlightTextBackground': hex(text, 0.08),
    'editor.findMatchBackground': hex(glow, 0.3),
    'editor.findMatchBorder': hex(glow, 0.8),
    'editor.findMatchHighlightBackground': hex(glow, 0.14),
    'editor.findRangeHighlightBackground': hex(text, 0.04),
    'editor.hoverHighlightBackground': hex(accent, 0.12),
    'editor.rangeHighlightBackground': hex(accent, 0.08),
    'editor.symbolHighlightBackground': hex(glow, 0.14),
    'editor.linkedEditingBackground': hex(accent, 0.12),
    'editor.foldBackground': hex(accent, 0.07),
    'editor.snippetTabstopHighlightBackground': hex(accent, 0.15),
    'editor.snippetFinalTabstopHighlightBorder': hex(accent, 0.5),
    'editor.stackFrameHighlightBackground': hex(s.warn, 0.12),
    'editor.focusedStackFrameHighlightBackground': hex(s.success, 0.12),
    'editor.placeholder.foreground': hex(faint),
    'editorLink.activeForeground': hex(accentInk),
    'editorWhitespace.foreground': hex(text, 0.12),
    'editorIndentGuide.background1': hex(text, 0.07),
    'editorIndentGuide.activeBackground1': hex(text, 0.18),
    'editorRuler.foreground': hex(text, 0.07),
    'editorCodeLens.foreground': hex(faint),
    'editorInlayHint.foreground': hex(inlay),
    'editorInlayHint.background': hex(text, 0.05),
    'editorGhostText.foreground': hex(p.comment, 0.75),
    'editorBracketMatch.background': hex(accent, 0.12),
    'editorBracketMatch.border': hex(accent, 0.45),
    'editorBracketHighlight.foreground1': hex(brackets[0]),
    'editorBracketHighlight.foreground2': hex(brackets[1]),
    'editorBracketHighlight.foreground3': hex(brackets[2]),
    'editorBracketHighlight.foreground4': hex(brackets[3]),
    'editorBracketHighlight.foreground5': hex(brackets[4]),
    'editorBracketHighlight.foreground6': hex(brackets[5]),
    'editorBracketHighlight.unexpectedBracket.foreground': hex(dangerInk),
    'editorError.foreground': hex(dangerInk),
    'editorWarning.foreground': hex(warnInk),
    'editorInfo.foreground': hex(infoInk),
    'editorHint.foreground': hex(p.comment),
    'editorUnicodeHighlight.border': hex(s.warn, 0.6),
    'editorGutter.background': hex(room),
    'editorGutter.addedBackground': hex(s.success, 0.75),
    'editorGutter.modifiedBackground': hex(s.modified, 0.75),
    'editorGutter.deletedBackground': hex(s.danger, 0.75),
    'editorGutter.foldingControlForeground': hex(quiet),
    'editorGutter.commentRangeForeground': hex(faint),
    'editorOverviewRuler.border': hex(room, 0),
    'editorOverviewRuler.findMatchForeground': hex(glow, 0.6),
    'editorOverviewRuler.selectionHighlightForeground': hex(accent, 0.5),
    'editorOverviewRuler.wordHighlightForeground': hex(text, 0.3),
    'editorOverviewRuler.errorForeground': hex(s.danger, 0.8),
    'editorOverviewRuler.warningForeground': hex(s.warn, 0.7),
    'editorOverviewRuler.infoForeground': hex(s.info, 0.6),
    'editorOverviewRuler.addedForeground': hex(s.success, 0.6),
    'editorOverviewRuler.modifiedForeground': hex(s.modified, 0.6),
    'editorOverviewRuler.deletedForeground': hex(s.danger, 0.6),
    'editorOverviewRuler.bracketMatchForeground': hex(accent, 0.5),
    'editorOverviewRuler.currentContentForeground': hex(s.success, 0.6),
    'editorOverviewRuler.incomingContentForeground': hex(s.info, 0.6),
    'editorOverviewRuler.commonContentForeground': hex(text, 0.3),
    'editorStickyScroll.background': hex(room),
    'editorStickyScroll.shadow': shadow,
    'editorStickyScrollHover.background': hex(raised),

    // Editor widgets
    'editorWidget.background': hex(mist),
    'editorWidget.foreground': hex(text),
    'editorWidget.border': hex(widgetEdge),
    'editorWidget.resizeBorder': hex(accent, 0.5),
    'editorSuggestWidget.background': hex(mist),
    'editorSuggestWidget.border': hex(widgetEdge),
    'editorSuggestWidget.foreground': hex(ink),
    'editorSuggestWidget.highlightForeground': hex(highlight),
    'editorSuggestWidget.focusHighlightForeground': hex(highlight),
    'editorSuggestWidget.selectedBackground': hex(accent, 0.2),
    'editorSuggestWidget.selectedForeground': hex(text),
    'editorSuggestWidget.selectedIconForeground': hex(text),
    'editorHoverWidget.background': hex(mist),
    'editorHoverWidget.foreground': hex(text),
    'editorHoverWidget.border': hex(widgetEdge),
    'editorHoverWidget.highlightForeground': hex(highlight),
    'editorHoverWidget.statusBarBackground': hex(lighten(mist, 0.02)),
    'editorMarkerNavigation.background': hex(mist),
    'editorMarkerNavigationError.background': hex(s.danger, 0.8),
    'editorMarkerNavigationWarning.background': hex(s.warn, 0.8),
    'editorMarkerNavigationInfo.background': hex(s.info, 0.8),
    'debugExceptionWidget.background': hex(mix(mist, s.danger, 0.12)),
    'debugExceptionWidget.border': hex(s.danger, 0.5),

    // Peek view
    'peekView.border': hex(accent, 0.5),
    'peekViewEditor.background': hex(mix(room, abyss, 0.5)),
    'peekViewEditorGutter.background': hex(mix(room, abyss, 0.5)),
    'peekViewEditor.matchHighlightBackground': hex(glow, 0.2),
    'peekViewResult.background': hex(shade),
    'peekViewResult.fileForeground': hex(text),
    'peekViewResult.lineForeground': hex(quiet),
    'peekViewResult.matchHighlightBackground': hex(glow, 0.2),
    'peekViewResult.selectionBackground': hex(accent, 0.2),
    'peekViewResult.selectionForeground': hex(text),
    'peekViewTitle.background': hex(mist),
    'peekViewTitleLabel.foreground': hex(text),
    'peekViewTitleDescription.foreground': hex(quiet),

    // Diff & merge
    'diffEditor.insertedTextBackground': hex(s.success, 0.14),
    'diffEditor.removedTextBackground': hex(s.danger, 0.14),
    'diffEditor.insertedLineBackground': hex(s.success, 0.07),
    'diffEditor.removedLineBackground': hex(s.danger, 0.07),
    'diffEditorGutter.insertedLineBackground': hex(s.success, 0.12),
    'diffEditorGutter.removedLineBackground': hex(s.danger, 0.12),
    'diffEditorOverview.insertedForeground': hex(s.success, 0.5),
    'diffEditorOverview.removedForeground': hex(s.danger, 0.5),
    'diffEditor.diagonalFill': hex(text, 0.08),
    'diffEditor.border': hex(hair),
    'merge.currentHeaderBackground': hex(s.success, 0.3),
    'merge.currentContentBackground': hex(s.success, 0.1),
    'merge.incomingHeaderBackground': hex(s.info, 0.3),
    'merge.incomingContentBackground': hex(s.info, 0.1),
    'merge.commonHeaderBackground': hex(text, 0.18),
    'merge.commonContentBackground': hex(text, 0.07),
    'merge.border': hex(hair),

    // Panel & terminal
    'panel.background': hex(shade),
    'panel.border': hex(hair),
    'panel.dropBorder': hex(accent),
    'panelTitle.activeBorder': hex(glow, 0.7),
    'panelTitle.activeForeground': hex(text),
    'panelTitle.inactiveForeground': hex(quiet),
    'panelInput.border': hex(hair),
    'panelSection.border': hex(hair),
    'panelSectionHeader.background': hex(shade),
    'panelSectionHeader.foreground': hex(ink),
    'panelStickyScroll.background': hex(shade),
    'terminal.background': hex(shade),
    'terminal.foreground': hex(text),
    'terminal.border': hex(hair),
    'terminal.selectionBackground': hex(accent, 0.3),
    'terminal.inactiveSelectionBackground': hex(accent, 0.15),
    'terminal.findMatchBackground': hex(glow, 0.3),
    'terminal.findMatchHighlightBackground': hex(glow, 0.14),
    'terminal.dropBackground': hex(accent, 0.12),
    'terminalCursor.foreground': hex(cursor),
    'terminalCursor.background': hex(shade),
    'terminalCommandDecoration.defaultBackground': hex(faint),
    'terminalCommandDecoration.successBackground': hex(s.success),
    'terminalCommandDecoration.errorBackground': hex(s.danger),
    'terminalOverviewRuler.cursorForeground': hex(glow, 0.6),
    'terminalStickyScroll.background': hex(shade),
    ...ansiColors(p, shade),

    // Title bar, command center, menus
    'titleBar.activeBackground': hex(abyss),
    'titleBar.activeForeground': hex(ink),
    'titleBar.inactiveBackground': hex(abyss),
    'titleBar.inactiveForeground': hex(faintOnAbyss),
    'titleBar.border': hex(abyss),
    'commandCenter.background': hex(mix(abyss, room, 0.6)),
    'commandCenter.foreground': hex(quiet),
    'commandCenter.border': hex(hair),
    'commandCenter.activeBackground': hex(raised),
    'commandCenter.activeForeground': hex(text),
    'commandCenter.activeBorder': hex(edge),
    'commandCenter.inactiveForeground': hex(faintOnAbyss),
    'commandCenter.inactiveBorder': hex(hairSoft),
    'commandCenter.debuggingBackground': hex(s.warn, 0.2),
    'menubar.selectionBackground': hex(text, 0.08),
    'menubar.selectionForeground': hex(text),
    'menu.background': hex(mist),
    'menu.foreground': hex(ink),
    'menu.selectionBackground': hex(accent, 0.22),
    'menu.selectionForeground': hex(text),
    'menu.separatorBackground': hex(widgetEdge),
    'menu.border': hex(widgetEdge),

    // Quick input
    'quickInput.background': hex(mist),
    'quickInput.foreground': hex(ink),
    'quickInputTitle.background': hex(lighten(mist, 0.02)),
    'quickInputList.focusBackground': hex(accent, 0.2),
    'quickInputList.focusForeground': hex(text),
    'quickInputList.focusIconForeground': hex(text),
    'pickerGroup.border': hex(widgetEdge),
    'pickerGroup.foreground': hex(accentInk),

    // Notifications & banner
    'notificationCenter.border': hex(widgetEdge),
    'notificationCenterHeader.background': hex(lighten(mist, 0.015)),
    'notificationCenterHeader.foreground': hex(ink),
    'notifications.background': hex(mist),
    'notifications.foreground': hex(text),
    'notifications.border': hex(widgetEdge),
    'notificationToast.border': hex(widgetEdge),
    'notificationLink.foreground': hex(accentInk),
    'notificationsErrorIcon.foreground': hex(dangerInk),
    'notificationsWarningIcon.foreground': hex(warnInk),
    'notificationsInfoIcon.foreground': hex(infoInk),
    'banner.background': hex(raised),
    'banner.foreground': hex(text),
    'banner.iconForeground': hex(accentInk),

    // Extensions, settings, welcome
    'extensionButton.prominentBackground': hex(button),
    'extensionButton.prominentForeground': hex(buttonFg),
    'extensionButton.prominentHoverBackground': hex(lighten(button, 0.04)),
    'extensionButton.background': hex(button),
    'extensionButton.foreground': hex(buttonFg),
    'extensionButton.hoverBackground': hex(lighten(button, 0.04)),
    'extensionButton.separator': hex(buttonFg, 0.3),
    'extensionBadge.remoteBackground': hex(button),
    'extensionBadge.remoteForeground': hex(buttonFg),
    'extensionIcon.starForeground': hex(warnInk),
    'extensionIcon.verifiedForeground': hex(accentInk),
    'extensionIcon.preReleaseForeground': hex(glow),
    'settings.headerForeground': hex(text),
    'settings.modifiedItemIndicator': hex(glow, 0.7),
    'settings.focusedRowBackground': hex(text, 0.04),
    'settings.rowHoverBackground': hex(text, 0.03),
    'settings.focusedRowBorder': hex(accent, 0.4),
    'settings.headerBorder': hex(hair),
    'settings.sashBorder': hex(hair),
    'settings.dropdownBackground': hex(raised),
    'settings.dropdownForeground': hex(ink),
    'settings.dropdownBorder': hex(edge),
    'settings.dropdownListBorder': hex(widgetEdge),
    'settings.checkboxBackground': hex(raised),
    'settings.checkboxForeground': hex(text),
    'settings.checkboxBorder': hex(edge),
    'settings.textInputBackground': hex(abyss),
    'settings.textInputForeground': hex(text),
    'settings.textInputBorder': hex(hair),
    'settings.numberInputBackground': hex(abyss),
    'settings.numberInputForeground': hex(text),
    'settings.numberInputBorder': hex(hair),
    'welcomePage.background': hex(room),
    'welcomePage.tileBackground': hex(shade),
    'welcomePage.tileHoverBackground': hex(raised),
    'welcomePage.tileBorder': hex(hair),
    'welcomePage.progress.background': hex(abyss),
    'welcomePage.progress.foreground': hex(glow),
    'walkThrough.embeddedEditorBackground': hex(abyss),
    'walkthrough.stepTitle.foreground': hex(text),

    // Debugging
    'debugToolBar.background': hex(mist),
    'debugToolBar.border': hex(widgetEdge),
    'debugIcon.breakpointForeground': hex(dangerInk),
    'debugIcon.breakpointDisabledForeground': hex(faint),
    'debugIcon.breakpointUnverifiedForeground': hex(quiet),
    'debugIcon.breakpointCurrentStackframeForeground': hex(warnInk),
    'debugIcon.breakpointStackframeForeground': hex(successInk),
    'debugIcon.startForeground': hex(successInk),
    'debugIcon.pauseForeground': hex(infoInk),
    'debugIcon.stopForeground': hex(dangerInk),
    'debugIcon.disconnectForeground': hex(dangerInk),
    'debugIcon.restartForeground': hex(successInk),
    'debugIcon.stepOverForeground': hex(infoInk),
    'debugIcon.stepIntoForeground': hex(infoInk),
    'debugIcon.stepOutForeground': hex(infoInk),
    'debugIcon.stepBackForeground': hex(infoInk),
    'debugIcon.continueForeground': hex(infoInk),
    'debugTokenExpression.name': hex(p.keyword),
    'debugTokenExpression.value': hex(ink),
    'debugTokenExpression.string': hex(p.string),
    'debugTokenExpression.number': hex(p.number),
    'debugTokenExpression.boolean': hex(p.number),
    'debugTokenExpression.error': hex(dangerInk),
    'debugConsole.infoForeground': hex(infoInk),
    'debugConsole.warningForeground': hex(warnInk),
    'debugConsole.errorForeground': hex(dangerInk),
    'debugConsole.sourceForeground': hex(quiet),
    'debugConsoleInputIcon.foreground': hex(accentInk),

    // Testing
    'testing.iconPassed': hex(successInk),
    'testing.iconFailed': hex(dangerInk),
    'testing.iconErrored': hex(dangerInk),
    'testing.iconQueued': hex(warnInk),
    'testing.iconUnset': hex(faint),
    'testing.iconSkipped': hex(faint),
    'testing.runAction': hex(successInk),
    'testing.peekBorder': hex(s.danger, 0.6),
    'testing.peekHeaderBackground': hex(s.danger, 0.1),
    'testing.message.error.decorationForeground': hex(dangerInk),
    'testing.message.info.decorationForeground': hex(quiet),

    // Source control
    'gitDecoration.addedResourceForeground': hex(successInk),
    'gitDecoration.untrackedResourceForeground': hex(successInk),
    'gitDecoration.modifiedResourceForeground': hex(modifiedInk),
    'gitDecoration.renamedResourceForeground': hex(modifiedInk),
    'gitDecoration.stageModifiedResourceForeground': hex(modifiedInk),
    'gitDecoration.deletedResourceForeground': hex(dangerInk),
    'gitDecoration.stageDeletedResourceForeground': hex(dangerInk),
    'gitDecoration.conflictingResourceForeground': hex(warnInk),
    'gitDecoration.ignoredResourceForeground': hex(faint),
    'gitDecoration.submoduleResourceForeground': hex(p.keyword),

    // Notebooks
    'notebook.editorBackground': hex(room),
    'notebook.cellEditorBackground': hex(shade),
    'notebook.cellBorderColor': hex(hair),
    'notebook.focusedCellBorder': hex(accent, 0.5),
    'notebook.focusedEditorBorder': hex(accent, 0.5),
    'notebook.selectedCellBackground': hex(text, 0.04),
    'notebook.cellHoverBackground': hex(text, 0.025),
    'notebook.outputContainerBackgroundColor': hex(shade),
    'notebook.cellStatusBarItemHoverBackground': hex(text, 0.08),
    'notebookStatusSuccessIcon.foreground': hex(successInk),
    'notebookStatusErrorIcon.foreground': hex(dangerInk),
    'notebookStatusRunningIcon.foreground': hex(infoInk),

    // Charts & misc
    'charts.foreground': hex(ink),
    'charts.lines': hex(text, 0.3),
    'charts.red': hex(dangerInk),
    'charts.blue': hex(infoInk),
    'charts.yellow': hex(warnInk),
    'charts.orange': hex(ink4(lch(0.76, 0.1, 55))),
    'charts.green': hex(successInk),
    'charts.purple': hex(p.keyword),
    'ports.iconRunningProcessForeground': hex(successInk),

    ...statusBarColors(p, opts, { abyss, shade, raised, hairSoft, quiet, ink, danger: s.danger, warn: s.warn }),
    ...symbolIconColors(p, quiet, ink),
  };
  return colors;
}

function statusBarColors(
  p: FinalPalette,
  opts: ThemeOptions,
  ui: { abyss: Lab; shade: Lab; raised: Lab; hairSoft: Lab; quiet: Lab; ink: Lab; danger: Lab; warn: Lab },
): Record<string, string> {
  const hex = (c: Lab, alpha = 1) => toHex(c, alpha);
  const text = p.text;

  const errorBg = withLightness(scaleChroma(ui.danger, 0.85), 0.48);
  const warnBg = withLightness(scaleChroma(ui.warn, 0.8), 0.5);
  const common = {
    'statusBarItem.hoverForeground': hex(text),
    'statusBarItem.prominentForeground': hex(text),
    'statusBarItem.errorBackground': hex(errorBg),
    'statusBarItem.errorForeground': hex(ensureContrast(text, errorBg, 4.5)),
    'statusBarItem.errorHoverBackground': hex(lighten(errorBg, 0.04)),
    'statusBarItem.warningBackground': hex(warnBg),
    'statusBarItem.warningForeground': hex(bestOn(warnBg, ui.abyss, text)),
    'statusBarItem.warningHoverBackground': hex(lighten(warnBg, 0.04)),
  };

  if (!opts.atmosphericStatusBar) {
    const fg = ensureContrast(ui.quiet, ui.abyss, 5);
    return {
      ...common,
      'statusBar.background': hex(ui.abyss),
      'statusBar.foreground': hex(fg),
      'statusBar.border': hex(ui.hairSoft),
      'statusBar.focusBorder': hex(p.sky, 0.6),
      'statusBar.noFolderBackground': hex(ui.abyss),
      'statusBar.noFolderForeground': hex(fg),
      'statusBar.noFolderBorder': hex(ui.hairSoft),
      'statusBar.debuggingBackground': hex(ui.abyss),
      'statusBar.debuggingForeground': hex(ensureContrast(ui.warn, ui.abyss, 5)),
      'statusBar.debuggingBorder': hex(ui.warn, 0.6),
      'statusBarItem.hoverBackground': hex(text, 0.08),
      'statusBarItem.activeBackground': hex(text, 0.12),
      'statusBarItem.compactHoverBackground': hex(text, 0.1),
      'statusBarItem.focusBorder': hex(p.sky, 0.6),
      'statusBarItem.prominentBackground': hex(text, 0.08),
      'statusBarItem.prominentHoverBackground': hex(text, 0.14),
      'statusBarItem.remoteBackground': hex(ui.raised),
      'statusBarItem.remoteForeground': hex(ui.ink),
      'statusBarItem.remoteHoverBackground': hex(lighten(ui.raised, 0.03)),
      'statusBarItem.remoteHoverForeground': hex(text),
      'statusBarItem.offlineBackground': hex(ui.raised),
      'statusBarItem.offlineForeground': hex(ui.ink),
    };
  }

  // The shoreline: sea below, a thin line of light on the horizon, and sand
  // where the remote indicator sits.
  const sea = p.sea;
  const foam = ensureContrast(withLightness(mix(text, p.sand, 0.3), 0.8), sea, 5.5);
  // The horizon line brightens as the light warms and lowers: a faint silver
  // thread at night and noon, a clear glow at sunrise and sunset.
  const glowChroma = Math.hypot(p.glow.a, p.glow.b);
  const horizon = hex(p.glow, Math.min(0.6, 0.26 + 2.2 * glowChroma));
  // Sand stays mid-dark so light text always reads on it (no light/dark flip).
  const sand = withLightness(p.sand, Math.min(p.sand.L, 0.5));
  const sandFg = ensureContrast(withLightness(mix(text, p.sand, 0.15), 0.93), sand, 4.5);
  const reflection = mix(sea, lch(0.5, 0.09, 40), 0.55);
  return {
    ...common,
    'statusBar.background': hex(sea),
    'statusBar.foreground': hex(foam),
    'statusBar.border': horizon,
    'statusBar.focusBorder': hex(p.glow, 0.6),
    'statusBar.noFolderBackground': hex(sea),
    'statusBar.noFolderForeground': hex(foam),
    'statusBar.noFolderBorder': horizon,
    'statusBar.debuggingBackground': hex(reflection),
    'statusBar.debuggingForeground': hex(ensureContrast(text, reflection, 6)),
    'statusBar.debuggingBorder': hex(p.glow, 0.5),
    'statusBarItem.hoverBackground': hex(text, 0.09),
    'statusBarItem.activeBackground': hex(text, 0.14),
    'statusBarItem.compactHoverBackground': hex(text, 0.12),
    'statusBarItem.focusBorder': hex(p.glow, 0.6),
    'statusBarItem.prominentBackground': hex(text, 0.1),
    'statusBarItem.prominentHoverBackground': hex(text, 0.16),
    'statusBarItem.remoteBackground': hex(sand),
    'statusBarItem.remoteForeground': hex(sandFg),
    'statusBarItem.remoteHoverBackground': hex(lighten(sand, 0.05)),
    'statusBarItem.remoteHoverForeground': hex(sandFg),
    'statusBarItem.offlineBackground': hex(mix(sea, ui.danger, 0.4)),
    'statusBarItem.offlineForeground': hex(text),
  };
}

/** ANSI colors keep their meaning (red is red); the hour's light tints them. */
function ansiColors(p: FinalPalette, bg: Lab): Record<string, string> {
  const hues: Record<string, [number, number, number]> = {
    Red: [0.72, 0.11, 24],
    Green: [0.76, 0.09, 155],
    Yellow: [0.82, 0.09, 85],
    Blue: [0.74, 0.09, 250],
    Magenta: [0.74, 0.09, 320],
    Cyan: [0.78, 0.08, 205],
  };
  const out: Record<string, string> = {
    'terminal.ansiBlack': toHex(mix(p.room, p.text, 0.25)),
    'terminal.ansiBrightBlack': toHex(ensureContrast(p.comment, bg, 4)),
    'terminal.ansiWhite': toHex(mix(p.text, p.comment, 0.25)),
    'terminal.ansiBrightWhite': toHex(p.text),
  };
  for (const [name, [l, c, h]] of Object.entries(hues)) {
    const base = ensureContrast(mix(lch(l, c, h), p.glow, 0.12), bg, 4.5);
    out[`terminal.ansi${name}`] = toHex(base);
    out[`terminal.ansiBright${name}`] = toHex(lighten(base, 0.07));
  }
  return out;
}

function symbolIconColors(p: FinalPalette, quiet: Lab, ink: Lab): Record<string, string> {
  const map: Record<string, Lab> = {
    array: p.type,
    boolean: p.number,
    class: p.type,
    color: p.string,
    constant: p.number,
    constructor: p.func,
    enumerator: p.type,
    enumeratorMember: p.number,
    event: p.keyword,
    field: p.property,
    file: quiet,
    folder: quiet,
    function: p.func,
    interface: p.type,
    key: p.property,
    keyword: p.keyword,
    method: p.func,
    module: p.type,
    namespace: p.type,
    null: p.number,
    number: p.number,
    object: p.type,
    operator: p.operator,
    package: p.type,
    property: p.property,
    reference: p.keyword,
    snippet: quiet,
    string: p.string,
    struct: p.type,
    text: ink,
    typeParameter: p.type,
    unit: p.number,
    variable: p.text,
  };
  const out: Record<string, string> = {};
  for (const [k, c] of Object.entries(map)) out[`symbolIcon.${k}Foreground`] = toHex(c);
  return out;
}

// ---------------------------------------------------------------------------
// Syntax
// ---------------------------------------------------------------------------

function tokenColors(p: FinalPalette): TextMateRule[] {
  const s = statusColors(p);
  const rule = (name: string, scope: string[], fg?: Lab, fontStyle?: string): TextMateRule => ({
    name,
    scope,
    settings: {
      ...(fg ? { foreground: toHex(fg) } : {}),
      ...(fontStyle !== undefined ? { fontStyle } : {}),
    },
  });

  return [
    rule('Comment', ['comment', 'punctuation.definition.comment', 'string.comment'], p.comment, 'italic'),
    rule(
      'Documentation tag',
      [
        'comment.block.documentation storage.type',
        'comment.block.documentation entity.name.type',
        'comment.block.documentation punctuation.definition.block.tag',
        'storage.type.class.jsdoc',
        'punctuation.definition.block.tag.jsdoc',
      ],
      mix(p.comment, p.keyword, 0.4),
      'italic',
    ),
    rule(
      'Documentation name',
      ['comment.block.documentation variable', 'variable.other.jsdoc', 'entity.name.type.instance.jsdoc'],
      mix(p.comment, p.param, 0.45),
      'italic',
    ),

    rule(
      'Keyword',
      [
        'keyword',
        'keyword.control',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.operator.new',
        'keyword.operator.expression',
        'keyword.operator.logical.python',
        'keyword.operator.word',
        'keyword.operator.wordlike',
        'keyword.operator.sizeof',
        'keyword.operator.instanceof',
        'keyword.operator.typeof',
      ],
      p.keyword,
    ),
    rule(
      'Operator',
      [
        'keyword.operator',
        'punctuation.accessor',
        'punctuation.separator.key-value',
        'storage.type.function.arrow',
        'keyword.operator.type.annotation',
        'keyword.operator.optional',
        'keyword.operator.rest',
        'keyword.operator.spread',
      ],
      p.operator,
    ),
    rule(
      'Punctuation',
      [
        'punctuation',
        'meta.brace',
        'punctuation.separator',
        'punctuation.terminator',
        'punctuation.definition.tag',
        'punctuation.definition.parameters',
        'punctuation.definition.block',
        'meta.delimiter',
      ],
      p.punct,
    ),

    rule(
      'Function',
      [
        'entity.name.function',
        'support.function',
        'variable.function',
        'entity.name.method',
        'meta.function-call.generic',
        'meta.function-call entity.name.function',
        'meta.method-call entity.name.function',
        'support.function.builtin',
      ],
      p.func,
    ),
    rule(
      'Variable',
      ['variable', 'variable.other', 'variable.other.readwrite', 'meta.definition.variable.name', 'support.variable'],
      p.text,
    ),
    rule(
      'Language variable',
      ['variable.language', 'variable.language.this', 'variable.language.self', 'variable.language.super', 'variable.parameter.function.language.special.self'],
      p.keyword,
      'italic',
    ),
    rule(
      'Parameter',
      ['variable.parameter', 'meta.parameters variable', 'entity.name.variable.parameter', 'variable.parameter.function'],
      p.param,
    ),
    rule(
      'Property',
      [
        'variable.other.property',
        'variable.other.object.property',
        'variable.other.member',
        'support.variable.property',
        'meta.object-literal.key',
        'meta.property-name',
        'support.type.property-name',
        'entity.name.tag.yaml',
        'meta.mapping.key',
      ],
      p.property,
    ),

    rule(
      'String',
      ['string', 'string.quoted', 'string.template', 'string.unquoted', 'punctuation.definition.string', 'markup.inline.raw.string'],
      p.string,
    ),
    rule(
      'Template expression',
      ['punctuation.definition.template-expression', 'punctuation.section.embedded', 'punctuation.section.interpolation'],
      p.keyword,
    ),
    rule('Template body', ['meta.template.expression', 'meta.embedded', 'meta.interpolation'], p.text),
    rule(
      'Escape and regular expression',
      [
        'constant.character.escape',
        'constant.character',
        'constant.other.placeholder',
        'string.regexp',
        'constant.other.character-class.regexp',
        'keyword.operator.quantifier.regexp',
        'punctuation.definition.group.regexp',
      ],
      p.escape,
    ),
    rule('Number', ['constant.numeric', 'keyword.other.unit'], p.number),
    rule(
      'Constant',
      [
        'constant.language',
        'constant.other',
        'support.constant',
        'variable.other.enummember',
        'constant.other.color',
        'support.constant.property-value',
      ],
      p.number,
    ),

    rule(
      'Type',
      [
        'entity.name.type',
        'entity.name.class',
        'entity.name.namespace',
        'entity.name.module',
        'entity.other.inherited-class',
        'support.type',
        'support.class',
        'support.type.primitive',
        'storage.type.primitive',
        'storage.type.built-in',
        'support.class.component',
      ],
      p.type,
    ),
    rule(
      'Decorator and annotation',
      [
        'meta.decorator',
        'entity.name.function.decorator',
        'punctuation.decorator',
        'meta.annotation',
        'storage.type.annotation',
        'punctuation.definition.annotation',
        'entity.name.type.lifetime',
        'storage.modifier.lifetime',
        'entity.name.label',
      ],
      p.escape,
    ),
    rule(
      'Macro and preprocessor',
      ['entity.name.function.macro', 'support.function.macro', 'entity.name.function.preprocessor', 'meta.preprocessor', 'keyword.control.directive'],
      p.keyword,
    ),

    rule('Tag', ['entity.name.tag', 'entity.name.tag.css', 'entity.name.tag.scss', 'entity.name.tag.less'], p.keyword),
    rule(
      'Attribute and selector',
      ['entity.other.attribute-name', 'entity.other.attribute-name.class', 'entity.other.attribute-name.id'],
      p.type,
    ),
    rule(
      'Pseudo selector',
      ['entity.other.attribute-name.pseudo-class', 'entity.other.attribute-name.pseudo-element'],
      p.escape,
    ),

    rule('Invalid', ['invalid', 'invalid.illegal'], s.danger),
    rule('Deprecated', ['invalid.deprecated'], s.warn, 'strikethrough'),

    rule(
      'Heading',
      ['markup.heading', 'markup.heading entity.name', 'entity.name.section.markdown', 'markup.heading.setext'],
      p.func,
      'bold',
    ),
    rule('Heading mark', ['punctuation.definition.heading.markdown'], p.comment),
    rule('Bold', ['markup.bold'], undefined, 'bold'),
    rule('Italic', ['markup.italic'], undefined, 'italic'),
    rule('Strikethrough', ['markup.strikethrough'], undefined, 'strikethrough'),
    rule('Link', ['markup.underline.link', 'markup.link', 'string.other.link.destination'], p.escape),
    rule('Link text', ['string.other.link.title.markdown', 'string.other.link.description.markdown'], p.string),
    rule('Inline code', ['markup.inline.raw', 'markup.raw', 'markup.fenced_code.block.markdown'], p.type),
    rule('Quote', ['markup.quote'], p.comment, 'italic'),
    rule(
      'List mark',
      ['punctuation.definition.list.begin.markdown', 'beginning.punctuation.definition.list.markdown'],
      p.keyword,
    ),
    rule('Inserted', ['markup.inserted', 'meta.diff.header.to-file', 'punctuation.definition.inserted'], s.success),
    rule('Deleted', ['markup.deleted', 'meta.diff.header.from-file', 'punctuation.definition.deleted'], s.danger),
    rule('Changed', ['markup.changed', 'punctuation.definition.changed'], s.modified),
    rule('Diff range', ['meta.diff.range', 'meta.diff.header'], p.keyword),
  ];
}

function semanticTokenColors(p: FinalPalette): Record<string, SemanticStyle> {
  const f = (c: Lab) => toHex(c);
  return {
    namespace: f(p.type),
    class: f(p.type),
    interface: f(p.type),
    enum: f(p.type),
    struct: f(p.type),
    type: f(p.type),
    typeParameter: f(p.type),
    function: f(p.func),
    method: f(p.func),
    macro: f(p.keyword),
    parameter: f(p.param),
    variable: f(p.text),
    property: f(p.property),
    enumMember: f(p.number),
    event: f(p.keyword),
    decorator: f(p.escape),
    label: f(p.escape),
    keyword: f(p.keyword),
    number: f(p.number),
    string: f(p.string),
    regexp: f(p.escape),
    operator: f(p.operator),
    comment: { foreground: f(p.comment), italic: true },
    selfParameter: { foreground: f(p.keyword), italic: true },
    selfKeyword: { foreground: f(p.keyword), italic: true },
    builtinConstant: f(p.number),
    magicFunction: f(p.func),
    lifetime: f(p.escape),
    '*.deprecated': { strikethrough: true },
  };
}
