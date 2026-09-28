import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "../config/hwCalc";
import { codeToVoltage, lsbVolts, roundRobinSchedule, voltageToCode } from "./ads1115";

describe("ads1115", () => {
  const expected = computeExpectedValues().divider;

  it("LSB matches hwCalc's adc_lsb_V", () => {
    expect(lsbVolts()).toBeCloseTo(expected.adc_lsb_V, 12);
  });

  it("round-trips a full-charge tap voltage through quantization within half an LSB", () => {
    const v = expected.adc_V_at_full_charge[3]!; // tap 4, largest value, still well under FSR
    const code = voltageToCode(v);
    const back = codeToVoltage(code);
    expect(Math.abs(back - v)).toBeLessThanOrEqual(lsbVolts() / 2 + 1e-12);
  });

  it("clips codes at the signed 16-bit range", () => {
    expect(voltageToCode(100)).toBe(32767);
    expect(voltageToCode(-100)).toBe(-32768);
  });

  it("schedules 4 channels round-robin at a given data rate", () => {
    const schedule = roundRobinSchedule(4, 8, 1); // 8 SPS across 4 channels -> 2 samples/channel/s
    schedule.forEach((times) => expect(times.length).toBe(2));
    expect(schedule[0]![0]).toBeCloseTo(0.125, 9);
    expect(schedule[1]![0]).toBeCloseTo(0.25, 9);
  });
});
