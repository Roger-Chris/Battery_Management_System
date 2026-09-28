/**
 * 4S 40 A BMS board: over/under-voltage protection state machine. Thresholds and the 0.1 s
 * OV trip delay are from docs/HARDWARE_SPEC.md's protection-coordination table (seller
 * listing, VERIFY by test T0b). No UV delay or balancing threshold is given in the handoff,
 * so those are required caller-supplied parameters, not invented defaults.
 */
import { BMS } from "../config/validateDesign";

export type BmsTripState = "normal" | "ov_trip" | "uv_trip";

export interface BmsMonitorState {
  state: BmsTripState;
  /** Seconds the highest cell has continuously been at/above the OV threshold. */
  ovTimerS: number;
}

export function initialBmsState(): BmsMonitorState {
  return { state: "normal", ovTimerS: 0 };
}

/**
 * Advance the BMS protection state machine by `dtS` given the current per-cell voltages.
 * OV trips after `ovTripDelayS` continuous seconds above `BMS.ovDetect` (0.1 s per the
 * handoff's protection table). UV trips immediately below `BMS.uvDetect` — the handoff gives
 * no UV delay, so none is assumed.
 */
export function stepBmsMonitor(
  prev: BmsMonitorState,
  cellVoltagesV: number[],
  dtS: number,
  ovTripDelayS: number = 0.1,
): BmsMonitorState {
  const maxV = Math.max(...cellVoltagesV);
  const minV = Math.min(...cellVoltagesV);

  if (minV <= BMS.uvDetect) {
    return { state: "uv_trip", ovTimerS: 0 };
  }

  if (maxV >= BMS.ovDetect) {
    const ovTimerS = prev.ovTimerS + dtS;
    return { state: ovTimerS >= ovTripDelayS ? "ov_trip" : "normal", ovTimerS };
  }

  return { state: "normal", ovTimerS: 0 };
}

/**
 * Balancing threshold (bleed the highest cell while it exceeds the pack average by more than
 * `thresholdV`) has no datasheet or listing value in the handoff — the caller must supply one,
 * e.g. from a future bench characterisation of the board's balance behaviour.
 */
export function cellsNeedingBalance(cellVoltagesV: number[], thresholdV: number): boolean[] {
  const avg = cellVoltagesV.reduce((a, b) => a + b, 0) / cellVoltagesV.length;
  return cellVoltagesV.map((v) => v - avg > thresholdV);
}
