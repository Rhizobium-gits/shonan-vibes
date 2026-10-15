import { SkyOptions, todaysMoon } from './engine';
import { clockLabel } from './frame';

/** "Waxing crescent, 20% lit · moonrise 10:18 · highest 15:00 · moonset 19:43" */
export function moonLine(now: Date, opts: SkyOptions): string {
  const m = todaysMoon(now, opts);
  const t = (d: Date | null) => (d ? clockLabel(d.getHours() * 60 + d.getMinutes()) : '—');
  return `${m.name}, ${Math.round(m.illumination * 100)}% lit · moonrise ${t(m.rise)} · highest ${t(m.transit)} · moonset ${t(m.set)}`;
}
