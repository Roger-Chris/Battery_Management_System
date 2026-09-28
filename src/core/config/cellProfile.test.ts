import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E, isCellProfileProvisional, provisionalFields } from "./cellProfile";

describe("cellProfile", () => {
  it("loads the DMEGC INR18650-26E profile with its declared id", () => {
    expect(DMEGC_INR18650_26E.id).toBe("dmegc-inr18650-26e");
    expect(DMEGC_INR18650_26E.status).toBe("provisional");
  });

  it("flags ocv_curve, r0_ohm, rc_pairs and thermal as provisional, matching the JSON's own sources", () => {
    const fields = provisionalFields(DMEGC_INR18650_26E);
    expect(fields).toEqual(
      expect.arrayContaining(["ocv_curve", "r0_ohm", "rc_pairs", "thermal"]),
    );
    expect(fields).not.toEqual(expect.arrayContaining(["capacity_nominal_Ah", "voltage_charge_V"]));
    expect(isCellProfileProvisional(DMEGC_INR18650_26E)).toBe(true);
  });
});
