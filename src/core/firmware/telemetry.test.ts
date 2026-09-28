import { describe, expect, it } from "vitest";
import { eventRowToValues, telemetryRowToValues } from "./telemetry";

describe("telemetry", () => {
  it("converts a telemetry row into ordered INSERT values, booleans as 0/1", () => {
    const row = {
      timestamp_ms: 1000,
      cell1_v: 3.7,
      cell2_v: 3.71,
      cell3_v: 3.69,
      cell4_v: 3.7,
      pack_current_a: 1.0,
      load_current_a: 1.0,
      t_cell_c: 26,
      t_ambient_c: 24,
      t_heatsink_c: 40,
      soc_ekf: 0.62,
      soc_coulomb: 0.61,
      bms_state: "normal",
      charge_relay_closed: true,
    };
    const values = telemetryRowToValues(row);
    expect(values[0]).toBe(1000);
    expect(values[values.length - 1]).toBe(1); // charge_relay_closed -> 1
    expect(values).toHaveLength(14);
  });

  it("converts an event row into ordered INSERT values", () => {
    expect(eventRowToValues({ timestamp_ms: 500, type: "protection_trip", detail: "OV" })).toEqual([
      500,
      "protection_trip",
      "OV",
    ]);
  });
});
