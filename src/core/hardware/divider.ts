/**
 * Divider ladder: cell-tap voltage -> voltage at the ADS1115 pin. Same constants and math
 * as `core/config/hwCalc.ts` (which computes the fixed full-charge expected values); this
 * module generalises it to an arbitrary tap voltage for use in the live simulation.
 */
import { BOM } from "../config/bom";

export interface DividerResult {
  /** Ideal voltage at the ADC pin, ignoring ADC loading and resistor tolerance. */
  idealV: number;
  /** Voltage at the ADC pin after the ADS1115's finite common-mode input impedance loads the divider. */
  loadedV: number;
}

const rTop = BOM.divider.rTop.value;
const rBot = BOM.divider.rBot.value;
const rSeries = BOM.divider.rSeries.value;
const rTol = BOM.divider.rTolerance.value;
const zinCommonMode = BOM.ads1115.zinCommonMode.value;

export const DIVIDER_RATIO = rBot / (rTop + rBot);
export const SOURCE_IMPEDANCE_OHM = (rTop * rBot) / (rTop + rBot) + rSeries;

/** Ideal-vs-loaded ADC pin voltage for a given cell-tap voltage (v0, calibration-removable error). */
export function dividerOutputVoltage(tapV: number): DividerResult {
  const idealV = tapV * DIVIDER_RATIO;
  const loadedV = idealV * (zinCommonMode / (zinCommonMode + SOURCE_IMPEDANCE_OHM));
  return { idealV, loadedV };
}

/**
 * Worst-case ratio with all four 0.1% resistors at their tolerance extreme in the direction
 * that most changes the ratio (top resistor low, bottom resistor high). Matches
 * `tools/hw_calc.py`'s `worst_ratio_error_pct`.
 */
export function worstCaseRatio(): number {
  return (rBot * (1 + rTol)) / (rTop * (1 - rTol) + rBot * (1 + rTol));
}
