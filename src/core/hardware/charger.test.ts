import { describe, expect, it } from "vitest";
import {
  CHARGER_MAX_CURRENT_A,
  CHARGER_SETPOINT_V,
  clampChargeCurrentA,
  isChargerOcvAcceptable,
  isConstantVoltagePhase,
} from "./charger";

describe("charger", () => {
  it("accepts an OCV within test T0a's band and rejects outside it", () => {
    expect(isChargerOcvAcceptable(16.8)).toBe(true);
    expect(isChargerOcvAcceptable(16.5)).toBe(false);
    expect(isChargerOcvAcceptable(17.1)).toBe(false);
  });

  it("is in CC phase below the setpoint and CV phase at/above it", () => {
    expect(isConstantVoltagePhase(15.0)).toBe(false);
    expect(isConstantVoltagePhase(CHARGER_SETPOINT_V)).toBe(true);
  });

  it("clamps requested current to the charger's 2 A maximum and floors at 0", () => {
    expect(clampChargeCurrentA(5)).toBe(CHARGER_MAX_CURRENT_A);
    expect(clampChargeCurrentA(-1)).toBe(0);
    expect(clampChargeCurrentA(1.0)).toBe(1.0);
  });
});
