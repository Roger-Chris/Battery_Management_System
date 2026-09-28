/**
 * Runtime anomaly checks. Thresholds either cite a documented figure already in the handoff,
 * or are left as required caller parameters when the handoff gives none (see CLAUDE.md:
 * "never invent a datasheet value; ask").
 */
import { MAX_CELL_MISMATCH_PCT } from "../cell/spread";

/** docs/HARDWARE_SPEC.md: "do not mix cells more than about 3% apart" — reused here as a
 *  runtime imbalance-anomaly threshold rather than just cell-selection guidance. */
export function checkCellImbalance(cellVoltagesV: number[], maxMismatchPct: number = MAX_CELL_MISMATCH_PCT): boolean {
  const avg = cellVoltagesV.reduce((a, b) => a + b, 0) / cellVoltagesV.length;
  return cellVoltagesV.some((v) => (Math.abs(v - avg) / avg) * 100 > maxMismatchPct);
}

/** A reading that hasn't changed at all across `windowSize` consecutive samples likely
 *  indicates a stuck/disconnected sensor. No datasheet noise-floor figure exists in the
 *  handoff to derive a default window from — the caller must choose one. */
export function checkSensorStuck(recentReadings: number[], windowSize: number): boolean {
  if (recentReadings.length < windowSize) return false;
  const window = recentReadings.slice(-windowSize);
  return window.every((v) => v === window[0]);
}
