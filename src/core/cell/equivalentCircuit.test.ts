import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { ocvFromSoc } from "./ocv";
import {
  initialEquivalentCircuitState,
  stepEquivalentCircuit,
  terminalVoltage,
} from "./equivalentCircuit";

describe("equivalentCircuit", () => {
  const profile = DMEGC_INR18650_26E;

  it("at zero current, terminal voltage equals OCV", () => {
    const state = initialEquivalentCircuitState(profile);
    expect(terminalVoltage(0.5, 0, state, profile)).toBeCloseTo(ocvFromSoc(0.5, profile), 9);
  });

  it("R0 drop is immediate; RC drop builds up over time toward I*R", () => {
    let state = initialEquivalentCircuitState(profile);
    const soc = 0.5;
    const i = 1.0;
    const r0 = profile.fields.r0_ohm.value;
    const totalR = profile.fields.rc_pairs.value.reduce((s, p) => s + p.R_ohm, 0);

    const vAtStart = terminalVoltage(soc, i, state, profile);
    expect(vAtStart).toBeCloseTo(ocvFromSoc(soc, profile) - i * r0, 6); // RC branches still ~0

    for (let t = 0; t < 5000; t++) {
      state = stepEquivalentCircuit(state, i, 1, profile);
    }
    const vAtSteadyState = terminalVoltage(soc, i, state, profile);
    expect(vAtSteadyState).toBeCloseTo(ocvFromSoc(soc, profile) - i * (r0 + totalR), 3);
  });

  it("RC voltage relaxes back toward zero once current stops", () => {
    let state = initialEquivalentCircuitState(profile);
    for (let t = 0; t < 1000; t++) {
      state = stepEquivalentCircuit(state, 1.0, 1, profile);
    }
    for (let t = 0; t < 5000; t++) {
      state = stepEquivalentCircuit(state, 0, 1, profile);
    }
    const totalRcV = state.rc.reduce((s, b) => s + b.vV, 0);
    expect(totalRcV).toBeCloseTo(0, 3);
  });
});
