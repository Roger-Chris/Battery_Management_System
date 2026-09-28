/**
 * Scalar Extended Kalman Filter for SOC: predicts via coulomb counting, corrects using a
 * measured OCV estimate against the cell profile's OCV(SOC) curve (core/cell/ocv.ts). The
 * measurement Jacobian is the numeric slope of that curve, so it inherits the curve's own
 * provisional status — same caveat as core/cell/ocv.ts.
 */
import type { CellProfile } from "../config/cellProfile";
import { ocvFromSoc } from "../cell/ocv";

export interface EkfState {
  socFraction: number;
  varianceP: number;
}

export interface EkfNoiseParams {
  /** Process noise variance added to P each step (SOC-fraction^2); tunable, no datasheet value. */
  processNoiseQ: number;
  /** Measurement noise variance for the OCV estimate (V^2); tunable, no datasheet value. */
  measurementNoiseR: number;
}

export function initialEkfState(socFraction: number, varianceP = 0.01): EkfState {
  return { socFraction, varianceP };
}

function ocvSlope(socFraction: number, profile: CellProfile, h = 0.001): number {
  const sLo = Math.max(0, socFraction - h);
  const sHi = Math.min(1, socFraction + h);
  return (ocvFromSoc(sHi, profile) - ocvFromSoc(sLo, profile)) / (sHi - sLo);
}

/**
 * One EKF step. `ocvEstimateV` is the open-circuit-voltage estimate for this step (terminal
 * voltage with the R0/RC drop already removed, e.g. from equivalentCircuit.ts, or measured at
 * rest); pass the same value every step to run pure coulomb counting with no correction.
 */
export function stepEkf(
  prev: EkfState,
  measuredCurrentA: number,
  dtS: number,
  capacityAh: number,
  ocvEstimateV: number,
  profile: CellProfile,
  noise: EkfNoiseParams,
): EkfState {
  const capacityAs = capacityAh * 3600;
  const socPredicted = prev.socFraction - (measuredCurrentA * dtS) / capacityAs;
  const pPredicted = prev.varianceP + noise.processNoiseQ;

  const h = ocvSlope(socPredicted, profile);
  const yResidual = ocvEstimateV - ocvFromSoc(socPredicted, profile);
  const s = h * h * pPredicted + noise.measurementNoiseR;
  const kalmanGain = s > 0 ? (pPredicted * h) / s : 0;

  const socUpdated = Math.min(1, Math.max(0, socPredicted + kalmanGain * yResidual));
  const pUpdated = (1 - kalmanGain * h) * pPredicted;

  return { socFraction: socUpdated, varianceP: pUpdated };
}
