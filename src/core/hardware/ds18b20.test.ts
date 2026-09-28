import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "../config/hwCalc";
import { codeToTemperature, conversionTimeMs, probeLagStep, resolutionC, temperatureToCode } from "./ds18b20";

describe("ds18b20", () => {
  const expected = computeExpectedValues().ds18b20;

  it("resolution and conversion time match hwCalc for every bit depth", () => {
    ([9, 10, 11, 12] as const).forEach((bits) => {
      expect(resolutionC(bits)).toBeCloseTo(expected.resolution_C[String(bits)]!, 9);
      expect(conversionTimeMs(bits)).toBeCloseTo(expected.conversion_ms[String(bits)]!, 9);
    });
  });

  it("round-trips a temperature through 12-bit quantization within half an LSB", () => {
    const t = 36.4;
    const back = codeToTemperature(temperatureToCode(t, 12), 12);
    expect(Math.abs(back - t)).toBeLessThanOrEqual(resolutionC(12) / 2);
  });

  it("probe lag asymptotically approaches the true temperature", () => {
    let reading = 25;
    for (let i = 0; i < 50; i++) {
      reading = probeLagStep(reading, 40, 1, 5);
    }
    expect(reading).toBeCloseTo(40, 2);
  });
});
