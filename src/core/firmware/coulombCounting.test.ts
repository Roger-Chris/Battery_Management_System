import { describe, expect, it } from "vitest";
import { coulombCountStep } from "./coulombCounting";

describe("coulombCounting", () => {
  it("removes 1 Ah / capacityAh of SOC for 1 A over 1 hour", () => {
    let soc = 1.0;
    const capacityAh = 2.6;
    for (let t = 0; t < 3600; t++) {
      soc = coulombCountStep(soc, 1.0, 1, capacityAh);
    }
    expect(soc).toBeCloseTo(1.0 - 1 / capacityAh, 6);
  });

  it("charging current (negative convention) increases SOC", () => {
    let soc = 0.5;
    for (let t = 0; t < 3600; t++) {
      soc = coulombCountStep(soc, -1.0, 1, 2.6);
    }
    expect(soc).toBeGreaterThan(0.5);
  });
});
