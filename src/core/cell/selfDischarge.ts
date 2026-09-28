/**
 * Self-discharge rate from the cell profile's %/month table (data/cell_profiles/*.json
 * `self_discharge_pct_per_month`, ANSMANN datasheet maximum values), interpolated by
 * temperature. Converting %/month to a per-second rate assumes a 30-day month — a disclosed
 * convention, not a datasheet figure.
 */
import type { CellProfile } from "../config/cellProfile";

const SECONDS_PER_DAY = 86400;
const DAYS_PER_MONTH_ASSUMED = 30;

function interpolate(x: number, points: Array<[number, number]>): number {
  const n = points.length;
  if (x <= points[0]![0]) return points[0]![1];
  if (x >= points[n - 1]![0]) return points[n - 1]![1];
  for (let i = 1; i < n; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[n - 1]![1];
}

export function selfDischargePctPerMonth(tempC: number, profile: CellProfile): number {
  const table = profile.fields.self_discharge_pct_per_month.value;
  const points = Object.entries(table)
    .map(([k, v]) => [Number(k.replace("C", "")), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  return interpolate(tempC, points);
}

export function selfDischargeFractionPerSecond(tempC: number, profile: CellProfile): number {
  const pct = selfDischargePctPerMonth(tempC, profile);
  return pct / 100 / (DAYS_PER_MONTH_ASSUMED * SECONDS_PER_DAY);
}
