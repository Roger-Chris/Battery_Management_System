import { describe, expect, it } from "vitest";
import { defaultSpread } from "./spread";

describe("spread", () => {
  it("defaults to 4 identical cells", () => {
    const spread = defaultSpread(4);
    expect(spread).toHaveLength(4);
    spread.forEach((s) => {
      expect(s.capacityFactor).toBe(1);
      expect(s.r0Factor).toBe(1);
    });
  });
});
