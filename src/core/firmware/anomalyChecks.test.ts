import { describe, expect, it } from "vitest";
import { checkCellImbalance, checkSensorStuck } from "./anomalyChecks";

describe("anomalyChecks", () => {
  it("does not flag a healthy pack within the 3% mismatch guidance", () => {
    expect(checkCellImbalance([3.70, 3.71, 3.69, 3.70])).toBe(false);
  });

  it("flags a cell more than 3% off the pack average", () => {
    expect(checkCellImbalance([3.70, 3.70, 3.70, 3.40])).toBe(true);
  });

  it("does not flag a sensor with fewer readings than the window", () => {
    expect(checkSensorStuck([25, 25], 5)).toBe(false);
  });

  it("flags a sensor whose last N readings are all identical", () => {
    expect(checkSensorStuck([20, 21, 22, 25, 25, 25, 25], 4)).toBe(true);
  });

  it("does not flag a sensor with varying recent readings", () => {
    expect(checkSensorStuck([25, 25.1, 25.3, 25.2], 4)).toBe(false);
  });
});
