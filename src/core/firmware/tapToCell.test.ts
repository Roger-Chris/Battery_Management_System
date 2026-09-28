import { describe, expect, it } from "vitest";
import { tapsToCellVoltages } from "./tapToCell";

describe("tapToCell", () => {
  it("recovers 4 equal cell voltages from cumulative taps", () => {
    const cells = tapsToCellVoltages([0.7, 1.4, 2.1, 2.8]);
    cells.forEach((v) => expect(v).toBeCloseTo(0.7, 9));
  });

  it("recovers unequal per-cell voltages", () => {
    const cells = tapsToCellVoltages([0.7, 1.39, 2.11, 2.79]);
    expect(cells[0]).toBeCloseTo(0.7, 9);
    expect(cells[1]).toBeCloseTo(0.69, 9);
    expect(cells[2]).toBeCloseTo(0.72, 9);
    expect(cells[3]).toBeCloseTo(0.68, 9);
  });
});
