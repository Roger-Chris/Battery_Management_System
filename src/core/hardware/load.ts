/**
 * Electronic load chain: MCP4725 DAC code -> commanded current -> ceiling-limited actual
 * current, plus MOSFET/resistor dissipation and shared-heatsink steady-state temperature.
 * Constants from `core/config/bom.ts` (already validated against `tools/hw_calc.py` in
 * `core/config/hwCalc.test.ts`). Heatsink Rth has no datasheet value for the budget build —
 * it is measured in bench test T6 — so it is a required, caller-supplied parameter here.
 */
import { BOM } from "../config/bom";

const dacVref = BOM.load.dacVref.value;
const dacDiv =
  BOM.load.dacDividerBottom.value / (BOM.load.dacDividerTop.value + BOM.load.dacDividerBottom.value);
const dacBits = BOM.load.dacBits.value;
const rSense = BOM.load.rSense.value;
const rLoad = BOM.load.rLoad.value;
const rdsOn = BOM.irlz44n.rdsOn.value;
const rthJc = BOM.irlz44n.rthJc.value;
const rthCsInsulated = BOM.heatsink.rthCsInsulatedPad.value;
const firmwareCapA = BOM.load.firmwareCapA.value;

export function dacLsbA(): number {
  return ((dacVref / 2 ** dacBits) * dacDiv) / rSense;
}

/** Ideal commanded current for a DAC code, before the physical ceiling and firmware cap. */
export function commandedCurrentA(dacCode: number): number {
  return dacCode * dacLsbA();
}

/** Current ceiling set by the pack voltage across (R_load + R_sense + R_DS(on)). */
export function currentCeilingA(packVoltageV: number): number {
  return packVoltageV / (rLoad + rSense + rdsOn);
}

export interface LoadState {
  /** Actual current delivered, after the physical ceiling and the firmware cap. */
  currentA: number;
  resistorW: number;
  senseW: number;
  mosfetW: number;
}

/**
 * `bmsFetDropOhm` models the BMS board's FET drop, which adds a small current-proportional
 * gain error to the load setpoint (docs/HARDWARE_SPEC.md net list note). It is linear and
 * removed by calibration (test T4); omit it to model the post-calibration case.
 */
export function loadState(
  dacCode: number,
  packVoltageV: number,
  opts: { bmsFetDropOhm?: number } = {},
): LoadState {
  const commanded = commandedCurrentA(dacCode);
  const ceiling = currentCeilingA(packVoltageV) - (opts.bmsFetDropOhm ?? 0) * commanded;
  const currentA = Math.min(commanded, ceiling, firmwareCapA);
  return {
    currentA,
    resistorW: currentA ** 2 * rLoad,
    senseW: currentA ** 2 * rSense,
    mosfetW: currentA * (packVoltageV - currentA * (rLoad + rSense)),
  };
}

/** Steady-state shared-heatsink temperature given total dissipated watts and the heatsink's
 *  Rth (measured in T6 — see docs/HARDWARE_SPEC.md design decision #6). */
export function heatsinkSteadyStateC(totalDissipatedW: number, heatsinkRthCPerW: number, ambientC: number): number {
  return ambientC + totalDissipatedW * heatsinkRthCPerW;
}

/** MOSFET junction temperature bound from the firmware's heatsink cut-off, not a datasheet Rth. */
export function mosfetTjBoundC(mosfetW: number, heatsinkCutoffC: number): number {
  return heatsinkCutoffC + mosfetW * (rthJc + rthCsInsulated);
}
