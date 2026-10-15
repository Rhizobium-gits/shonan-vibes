import * as vscode from 'vscode';
import { AtmosphereOptions, SkyOptions, parseClock } from './engine';
import { THEME_NAME } from './theme/mapper';

export const SECTION = 'shonanVibes';

export interface Settings {
  dynamicColors: boolean;
  intensity: number;
  updateIntervalMinutes: number;
  useLocalTime: boolean;
  sunrise: number | null;
  sunset: number | null;
  oceanSaturation: number;
  nightDarkness: number;
  atmosphericStatusBar: boolean;
  statusBarIndicator: boolean;
  seasonalTint: boolean;
  fixedTime: number | null;
  latitude: number;
  longitude: number;
  cloudCover: number;
  shorelineMotion: boolean;
}

function num(value: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(hi, Math.max(lo, n));
}

export function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    dynamicColors: c.get<boolean>('dynamicColors', true),
    intensity: num(c.get('intensity'), 1, 0, 1),
    updateIntervalMinutes: num(c.get('updateInterval'), 3, 1, 60),
    useLocalTime: c.get<boolean>('useLocalTime', true),
    sunrise: parseClock(c.get<string>('sunriseTime')),
    sunset: parseClock(c.get<string>('sunsetTime')),
    oceanSaturation: num(c.get('oceanSaturation'), 1, 0, 1.5),
    nightDarkness: num(c.get('nightDarkness'), 0.5, 0, 1),
    atmosphericStatusBar: c.get<boolean>('enableAtmosphericStatusBar', true),
    statusBarIndicator: c.get<boolean>('statusBarIndicator', true),
    seasonalTint: c.get<boolean>('seasonalTint', true),
    fixedTime: parseClock(c.get<string>('fixedTime')),
    latitude: num(c.get('latitude'), 35.2995, -90, 90),
    longitude: num(c.get('longitude'), 139.48, -180, 180),
    cloudCover: num(c.get('cloudCover'), 0, 0, 1),
    shorelineMotion: c.get<boolean>('shorelineMotion', true),
  };
}

export function skyOptions(s: Settings): SkyOptions {
  return {
    latitude: s.latitude,
    longitude: s.longitude,
    useLocalTime: s.useLocalTime,
    sunrise: s.sunrise,
    sunset: s.sunset,
  };
}

export function atmosphereOptions(s: Settings): AtmosphereOptions {
  return {
    intensity: s.intensity,
    oceanSaturation: s.oceanSaturation,
    nightDarkness: s.nightDarkness,
    seasonalTint: s.seasonalTint,
    cloudCover: s.cloudCover,
  };
}

/** "Now", or today at the held time. */
export function clockFor(s: Settings, now = new Date()): Date {
  if (s.fixedTime === null) return now;
  const d = new Date(now);
  d.setHours(Math.floor(s.fixedTime / 60), s.fixedTime % 60, 0, 0);
  return d;
}

/** Is Shonan Vibes the theme on screen (or the one auto-detect would pick)? */
export function isThemeActive(): boolean {
  const wb = vscode.workspace.getConfiguration('workbench');
  if (wb.get<string>('colorTheme') === THEME_NAME) return true;
  if (vscode.workspace.getConfiguration('window').get<boolean>('autoDetectColorScheme')) {
    return (
      wb.get<string>('preferredDarkColorTheme') === THEME_NAME ||
      wb.get<string>('preferredLightColorTheme') === THEME_NAME
    );
  }
  return false;
}
