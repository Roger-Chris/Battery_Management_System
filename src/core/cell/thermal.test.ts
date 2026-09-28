import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { initialThermalState, stepThermal } from "./thermal";

describe("thermal", () => {
  const profile = DMEGC_INR18650_26E;
  const { R_core_K_per_W, R_surf_K_per_W } = profile.fields.thermal.value;

  it("stays at ambient with zero heat generation", () => {
    let state = initialThermalState(25);
    for (let t = 0; t < 1000; t++) {
      state = stepThermal(state, 0, 25, 1, profile);
    }
    expect(state.coreC).toBeCloseTo(25, 6);
    expect(state.surfC).toBeCloseTo(25, 6);
  });

  it("reaches the analytic steady state for constant heat generation", () => {
    let state = initialThermalState(25);
    const pWatts = 2.0;
    for (let t = 0; t < 200000; t++) {
      state = stepThermal(state, pWatts, 25, 1, profile);
    }
    // At steady state, the same power P flows core->surf->ambient.
    expect(state.surfC - 25).toBeCloseTo(pWatts * R_surf_K_per_W, 1);
    expect(state.coreC - state.surfC).toBeCloseTo(pWatts * R_core_K_per_W, 1);
  });
});
