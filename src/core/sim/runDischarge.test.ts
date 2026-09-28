import { describe, expect, it } from "vitest";
import { dischargeSimulationCsv, runDischargeSimulation } from "./runDischarge";
import type { Parameter } from "../config/provenance";

function p(value: number, unit: string): Parameter<number> {
  return { value, unit, source: "assumed", ref: "Test-only simulation input" };
}

describe("runDischargeSimulation", () => {
  it("connects the cell, load and sensor models into a bench-log-compatible trace", () => {
    const result = runDischargeSimulation({
      testId: "T7",
      durationS: p(3, "s"),
      initialSoc: p(1, "fraction"),
      dischargeCurrentA: p(1, "A"),
      ambientC: p(25, "degC"),
    });
    expect(result.sampleCount).toBe(3);
    expect(result.samples[0]!.timestamp_s).toBe(1);
    expect(result.samples[0]!.dac_code).toBeGreaterThan(0);
    expect(result.samples[0]!.ina1_current_a).toBeCloseTo(1, 2);
    expect(result.samples[2]!.true_soc).toBeLessThan(result.samples[0]!.true_soc);
    expect(result.samples[2]!.coulomb_soc).toBeLessThan(1);
    expect(result.samples[0]!.cell_v_low[0]).toBeLessThan(result.samples[0]!.cell_v[0]);
    expect(result.samples[0]!.cell_v_high[0]).toBeGreaterThan(result.samples[0]!.cell_v[0]);
    expect(result.samples[0]!.cell_temp_c / 0.0625).toBeCloseTo(Math.round(result.samples[0]!.cell_temp_c / 0.0625));
    const csv = dischargeSimulationCsv(result);
    expect(csv.split("\n")[0]).toContain("timestamp_s,test_id,dac_code,i_cmd_a");
    expect(csv).toContain("cell1_v_low,cell1_v_high");
    expect(csv).toContain("model output; not a bench measurement");
  });

  it("stops the electronic load at the software under-voltage limit", () => {
    const result = runDischargeSimulation({
      testId: "UV-demo",
      durationS: p(1, "s"),
      initialSoc: p(0, "fraction"),
      dischargeCurrentA: p(1, "A"),
      ambientC: p(25, "degC"),
    });
    expect(result.samples[0]!.software_uv_trip).toBe(true);
    expect(result.samples[0]!.ina1_current_a).toBe(0);
  });

  it("rejects invalid run inputs instead of silently clamping them", () => {
    expect(() => runDischargeSimulation({
      testId: "bad",
      durationS: p(0, "s"),
      initialSoc: p(1, "fraction"),
      dischargeCurrentA: p(1, "A"),
      ambientC: p(25, "degC"),
    })).toThrow("duration");
  });
});
