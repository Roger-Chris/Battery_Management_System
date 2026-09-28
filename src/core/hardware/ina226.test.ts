import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "../config/hwCalc";
import {
  calibrationRegister,
  currentFromRegister,
  currentRegister,
  powerFromRegister,
  powerRegister,
} from "./ina226";

describe("ina226", () => {
  const expected = computeExpectedValues().ina226;

  it("calibration register matches hwCalc", () => {
    expect(calibrationRegister()).toBeCloseTo(expected.calibration_register, 0);
  });

  it("round-trips a mid-range current through the current register within one LSB", () => {
    const i = 0.6; // A, within the 8.19 A full scale
    const reg = currentRegister(i);
    const back = currentFromRegister(reg);
    expect(Math.abs(back - i)).toBeLessThanOrEqual(expected.current_lsb_A);
  });

  it("power register is consistent with current x bus voltage", () => {
    const i = 1.0;
    const busV = 16.0;
    const reg = powerRegister(i, busV);
    const backW = powerFromRegister(reg);
    expect(backW).toBeCloseTo(i * busV, 0);
  });
});
