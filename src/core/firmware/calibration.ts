/**
 * Two-point linear calibration, as run in bench test T1 (docs/TEST_PLAN_EXPECTED_VS_MEASURED.md:
 * "Residual ≤ 1 mV after 2-point fit"). Removes the divider's linear loading-gain error and
 * per-channel offset; it cannot remove non-linear effects.
 */
export interface Calibration {
  gain: number;
  offset: number;
}

export const IDENTITY_CALIBRATION: Calibration = { gain: 1, offset: 0 };

export function fitTwoPointCalibration(
  rawLow: number,
  refLow: number,
  rawHigh: number,
  refHigh: number,
): Calibration {
  const gain = (refHigh - refLow) / (rawHigh - rawLow);
  const offset = refLow - gain * rawLow;
  return { gain, offset };
}

export function applyCalibration(raw: number, cal: Calibration): number {
  return cal.gain * raw + cal.offset;
}
