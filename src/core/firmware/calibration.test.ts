import { describe, expect, it } from "vitest";
import { applyCalibration, fitTwoPointCalibration, IDENTITY_CALIBRATION } from "./calibration";

describe("calibration", () => {
  it("identity calibration passes raw values through unchanged", () => {
    expect(applyCalibration(1.2345, IDENTITY_CALIBRATION)).toBe(1.2345);
  });

  it("fits a 2-point calibration that exactly removes a known linear gain/offset error", () => {
    const trueGain = 1.0286; // matches the ~2.86% loading gain error from hwCalc
    const trueOffset = 0.002;
    const raw = (refV: number) => (refV - trueOffset) / trueGain;

    const cal = fitTwoPointCalibration(raw(0.5), 0.5, raw(2.8), 2.8);
    const midProbeV = 1.4;
    const corrected = applyCalibration(raw(midProbeV), cal);
    expect(corrected).toBeCloseTo(midProbeV, 9); // residual << 1 mV for a purely linear error
  });
});
