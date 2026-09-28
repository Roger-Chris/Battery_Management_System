import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "../config/hwCalc";
import { commandedCurrentA, currentCeilingA, dacLsbA, loadState, mosfetTjBoundC } from "./load";

describe("load", () => {
  const expected = computeExpectedValues().load;

  it("DAC LSB matches hwCalc's dac_lsb_A", () => {
    expect(dacLsbA()).toBeCloseTo(expected.dac_lsb_A, 12);
  });

  it("current ceiling matches hwCalc's rows for every swept pack voltage", () => {
    expected.rows.forEach((row) => {
      expect(currentCeilingA(row.pack_V)).toBeCloseTo(row.max_current_A, 9);
    });
  });

  it("firmware cap wins over a commanded current above 1.25 A", () => {
    const highCode = Math.round(2.0 / dacLsbA()); // command ~2 A, above the 1.25 A cap
    const state = loadState(highCode, 16.8);
    expect(state.currentA).toBeCloseTo(expected.firmware_cap_A, 6);
    expect(state.resistorW).toBeCloseTo(expected.resistor_W_at_cap, 3);
    expect(state.senseW).toBeCloseTo(expected.sense_W_at_cap, 3);
  });

  it("a small commanded current is delivered as commanded (well under ceiling and cap)", () => {
    const code = Math.round(0.5 / dacLsbA());
    const state = loadState(code, 16.8);
    expect(state.currentA).toBeCloseTo(commandedCurrentA(code), 6);
  });

  it("MOSFET Tj bound at the firmware heatsink cut-off matches hwCalc's budget-build bound", () => {
    const firstRow = expected.rows[0]!;
    expect(mosfetTjBoundC(firstRow.mosfet_worst_W, 80.0)).toBeCloseTo(
      expected.mosfet_tj_bound_C_budget_build,
      6,
    );
  });
});
