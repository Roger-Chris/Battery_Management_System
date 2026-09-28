import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { OCV_PROVISIONAL_BAND_V, ocvFromSoc, ocvUncertaintyBandV, ocvWithBand } from "./ocv";

describe("ocv", () => {
  const profile = DMEGC_INR18650_26E;
  const { soc, ocv_V } = profile.fields.ocv_curve.value;

  it("returns the exact table value at each knot", () => {
    soc.forEach((s, i) => {
      expect(ocvFromSoc(s, profile)).toBeCloseTo(ocv_V[i]!, 9);
    });
  });

  it("interpolates linearly between knots", () => {
    const mid = (soc[0]! + soc[1]!) / 2;
    const expectedV = (ocv_V[0]! + ocv_V[1]!) / 2;
    expect(ocvFromSoc(mid, profile)).toBeCloseTo(expectedV, 9);
  });

  it("clamps outside [0, 1]", () => {
    expect(ocvFromSoc(-0.5, profile)).toBeCloseTo(ocv_V[0]!, 9);
    expect(ocvFromSoc(1.5, profile)).toBeCloseTo(ocv_V[ocv_V.length - 1]!, 9);
  });

  it("reports the ±30 mV provisional band since this profile's OCV curve is provisional", () => {
    expect(ocvUncertaintyBandV(profile)).toBe(OCV_PROVISIONAL_BAND_V);
    const band = ocvWithBand(0.5, profile);
    expect(band.highV - band.lowV).toBeCloseTo(2 * OCV_PROVISIONAL_BAND_V, 9);
    expect(band.nominalV).toBeGreaterThan(band.lowV);
    expect(band.nominalV).toBeLessThan(band.highV);
  });
});
