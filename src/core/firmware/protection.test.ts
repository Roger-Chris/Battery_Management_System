import { describe, expect, it } from "vitest";
import { evaluateProtection, HEATSINK_CUTOFF_C, LOAD_CAP_A, SW_OV_V, SW_UV_V } from "./protection";

describe("protection", () => {
  const healthy = { cellVoltagesV: [3.7, 3.7, 3.7, 3.7], loadCurrentA: 1.0, heatsinkC: 40, cellTempC: 25 };

  it("no trips for a healthy pack", () => {
    const status = evaluateProtection(healthy);
    expect(status.overVoltage).toBe(false);
    expect(status.underVoltage).toBe(false);
    expect(status.heatsinkOverTemp).toBe(false);
    expect(status.chargeOverTemp).toBe(false);
    expect(status.loadCommandLimitA).toBeCloseTo(1.0, 9);
    expect(status.chargeAllowed).toBe(true);
  });

  it("trips OV at the software threshold and disallows charging", () => {
    const status = evaluateProtection({ ...healthy, cellVoltagesV: [SW_OV_V, 3.7, 3.7, 3.7] });
    expect(status.overVoltage).toBe(true);
    expect(status.chargeAllowed).toBe(false);
  });

  it("trips UV at the software threshold and zeroes the load", () => {
    const status = evaluateProtection({ ...healthy, cellVoltagesV: [SW_UV_V, 3.7, 3.7, 3.7] });
    expect(status.underVoltage).toBe(true);
    expect(status.loadCommandLimitA).toBe(0);
  });

  it("clamps load current at the 1.25 A firmware cap", () => {
    const status = evaluateProtection({ ...healthy, loadCurrentA: 2.0 });
    expect(status.overCurrent).toBe(true);
    expect(status.loadCommandLimitA).toBeCloseTo(LOAD_CAP_A, 9);
  });

  it("zeroes the load above the heatsink cut-off", () => {
    const status = evaluateProtection({ ...healthy, heatsinkC: HEATSINK_CUTOFF_C });
    expect(status.heatsinkOverTemp).toBe(true);
    expect(status.loadCommandLimitA).toBe(0);
  });

  it("disallows charging above 45 C cell temperature", () => {
    const status = evaluateProtection({ ...healthy, cellTempC: 45 });
    expect(status.chargeOverTemp).toBe(true);
    expect(status.chargeAllowed).toBe(false);
  });
});
