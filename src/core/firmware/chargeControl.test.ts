import { describe, expect, it } from "vitest";
import { chargeRelayCommand, commandedChargeCurrentA } from "./chargeControl";

describe("chargeControl", () => {
  it("opens the relay and commands 0 A when charging is not allowed", () => {
    expect(chargeRelayCommand(false).closed).toBe(false);
    expect(commandedChargeCurrentA(false, 2.0)).toBe(0);
  });

  it("closes the relay and clamps the requested current at the 2.2 A software cap when allowed", () => {
    expect(chargeRelayCommand(true).closed).toBe(true);
    expect(commandedChargeCurrentA(true, 5.0)).toBeCloseTo(2.2, 9);
    expect(commandedChargeCurrentA(true, 1.5)).toBeCloseTo(1.5, 9);
  });
});
