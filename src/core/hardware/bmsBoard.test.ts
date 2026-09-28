import { describe, expect, it } from "vitest";
import { cellsNeedingBalance, initialBmsState, stepBmsMonitor } from "./bmsBoard";

describe("bmsBoard", () => {
  it("stays normal for a healthy pack", () => {
    const state = stepBmsMonitor(initialBmsState(), [3.7, 3.71, 3.69, 3.7], 1);
    expect(state.state).toBe("normal");
  });

  it("trips UV immediately below the listed threshold", () => {
    const state = stepBmsMonitor(initialBmsState(), [3.7, 3.7, 3.7, 2.5], 1);
    expect(state.state).toBe("uv_trip");
  });

  it("requires 0.1 s continuous over-voltage before tripping OV", () => {
    let state = initialBmsState();
    state = stepBmsMonitor(state, [4.29, 4.0, 4.0, 4.0], 0.05);
    expect(state.state).toBe("normal"); // only 0.05 s so far
    state = stepBmsMonitor(state, [4.29, 4.0, 4.0, 4.0], 0.05);
    expect(state.state).toBe("ov_trip"); // 0.1 s cumulative
  });

  it("resets the OV timer once voltage drops back below threshold", () => {
    let state = initialBmsState();
    state = stepBmsMonitor(state, [4.29, 4.0, 4.0, 4.0], 0.05);
    state = stepBmsMonitor(state, [4.0, 4.0, 4.0, 4.0], 0.05);
    expect(state.ovTimerS).toBe(0);
  });

  it("flags cells above the caller-supplied balance threshold", () => {
    const flags = cellsNeedingBalance([3.7, 3.9, 3.7, 3.7], 0.05);
    expect(flags).toEqual([false, true, false, false]);
  });
});
