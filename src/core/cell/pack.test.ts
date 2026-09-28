import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { ocvFromSoc } from "./ocv";
import { cellVoltages, initialPackState, stepPack, tapVoltageBands, tapVoltages } from "./pack";

describe("pack", () => {
  const profile = DMEGC_INR18650_26E;

  it("4 identical cells at rest sum to 4x their common OCV at the top tap", () => {
    const state = initialPackState(profile, 0.5);
    const taps = tapVoltages(state, 0, profile);
    expect(taps).toHaveLength(4);
    expect(taps[3]!).toBeCloseTo(4 * ocvFromSoc(0.5, profile), 9);
    expect(taps[1]!).toBeCloseTo(2 * ocvFromSoc(0.5, profile), 9);
  });

  it("discharging at a known current reduces SOC by coulomb counting", () => {
    let state = initialPackState(profile, 1.0);
    const currentA = 1.0;
    const capacityAh = profile.fields.capacity_nominal_Ah.value;
    const oneHourInSeconds = 3600;
    for (let t = 0; t < oneHourInSeconds; t++) {
      state = stepPack(state, currentA, 1, profile);
    }
    // 1 A for 1 h removes 1 Ah, i.e. 1/capacityAh of the nominal capacity from SOC.
    state.cells.forEach((cell) => {
      expect(cell.socFraction).toBeCloseTo(1.0 - 1 / capacityAh, 3);
    });
  });

  it("tap voltage bands widen cumulatively with each series cell", () => {
    const state = initialPackState(profile, 0.5);
    const bands = tapVoltageBands(state, 0, profile);
    const width1 = bands[0]!.highV - bands[0]!.lowV;
    const width4 = bands[3]!.highV - bands[3]!.lowV;
    expect(width4).toBeGreaterThan(width1);
  });

  it("cellVoltages returns 4 independent (non-cumulative) values", () => {
    const state = initialPackState(profile, 0.5);
    const voltages = cellVoltages(state, 0, profile);
    voltages.forEach((v) => expect(v).toBeCloseTo(ocvFromSoc(0.5, profile), 9));
  });
});
