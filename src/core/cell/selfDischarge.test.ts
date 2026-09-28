import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { selfDischargeFractionPerSecond, selfDischargePctPerMonth } from "./selfDischarge";

describe("selfDischarge", () => {
  const profile = DMEGC_INR18650_26E;

  it("matches the profile's table exactly at each knot temperature", () => {
    expect(selfDischargePctPerMonth(20, profile)).toBeCloseTo(2, 9);
    expect(selfDischargePctPerMonth(30, profile)).toBeCloseTo(5, 9);
    expect(selfDischargePctPerMonth(40, profile)).toBeCloseTo(10, 9);
  });

  it("interpolates between knots and clamps outside the table", () => {
    expect(selfDischargePctPerMonth(25, profile)).toBeCloseTo(3.5, 9);
    expect(selfDischargePctPerMonth(0, profile)).toBeCloseTo(2, 9);
    expect(selfDischargePctPerMonth(60, profile)).toBeCloseTo(10, 9);
  });

  it("converts %/month to a per-second fraction assuming a 30-day month", () => {
    const ratePerSecond = selfDischargeFractionPerSecond(20, profile);
    const impliedPctPerMonth = ratePerSecond * 30 * 86400 * 100;
    expect(impliedPctPerMonth).toBeCloseTo(2, 9);
  });
});
