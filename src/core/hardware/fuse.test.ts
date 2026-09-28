import { describe, expect, it } from "vitest";
import { initialFuseState, stepFuse } from "./fuse";

describe("fuse", () => {
  it("does not blow while accumulated I²t stays below the caller's let-through threshold", () => {
    const state = stepFuse(initialFuseState(), 1.25, 1, 100);
    expect(state.blown).toBe(false);
    expect(state.integratedISquaredT).toBeCloseTo(1.5625, 6);
  });

  it("blows once accumulated I²t reaches the let-through threshold", () => {
    let state = initialFuseState();
    state = stepFuse(state, 20, 1, 100); // 400 A²s in one step, over the 100 threshold
    expect(state.blown).toBe(true);
  });

  it("stays blown and stops accumulating once blown", () => {
    let state = stepFuse(initialFuseState(), 20, 1, 100);
    const before = state.integratedISquaredT;
    state = stepFuse(state, 20, 1, 100);
    expect(state.blown).toBe(true);
    expect(state.integratedISquaredT).toBe(before);
  });
});
