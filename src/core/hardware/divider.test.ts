import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "../config/hwCalc";
import { DIVIDER_RATIO, SOURCE_IMPEDANCE_OHM, dividerOutputVoltage, worstCaseRatio } from "./divider";

describe("divider", () => {
  const expected = computeExpectedValues().divider;

  it("matches the ratio and source impedance from hwCalc", () => {
    expect(DIVIDER_RATIO).toBeCloseTo(expected.ratio, 12);
    expect(SOURCE_IMPEDANCE_OHM).toBeCloseTo(expected.source_impedance_ohm, 6);
  });

  it("reproduces the full-charge tap voltages at the ADC pin, ideal and loaded", () => {
    expected.tap_V_at_full_charge.forEach((tapV, i) => {
      const { idealV, loadedV } = dividerOutputVoltage(tapV);
      expect(idealV).toBeCloseTo(expected.adc_V_at_full_charge[i]!, 9);
      expect(idealV - loadedV).toBeGreaterThan(0); // loading always pulls the reading down
    });
  });

  it("worst-case ratio matches hwCalc's worst_ratio_error_pct", () => {
    const e = worstCaseRatio() / DIVIDER_RATIO - 1;
    expect(e * 100).toBeCloseTo(expected.worst_ratio_error_pct, 9);
  });
});
