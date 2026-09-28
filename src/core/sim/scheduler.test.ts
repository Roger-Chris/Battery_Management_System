import { describe, expect, it } from "vitest";
import { fixedStepSchedule } from "./scheduler";

describe("scheduler", () => {
  it("fires each sensor at its own period, independent of the others", () => {
    const ticks = [...fixedStepSchedule(0.05, 3, { ds18b20: 0.75, ina226: 0.5 })];
    const ds18b20Times = ticks.filter((t) => t.dueSensors.includes("ds18b20")).map((t) => t.tS);
    const ina226Times = ticks.filter((t) => t.dueSensors.includes("ina226")).map((t) => t.tS);

    expect(ds18b20Times).toEqual([0.75, 1.5, 2.25, 3]);
    expect(ina226Times).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
  });

  it("a tick can have zero, one, or several due sensors", () => {
    const ticks = [...fixedStepSchedule(0.5, 1, { fast: 0.5, slow: 1 })];
    const byTime = Object.fromEntries(ticks.map((t) => [t.tS, t.dueSensors]));
    expect(byTime[0]).toEqual([]);
    expect(byTime[0.5]).toEqual(["fast"]);
    expect(byTime[1]).toEqual(["fast", "slow"]);
  });

  it("covers the full duration inclusive of the final step", () => {
    const ticks = [...fixedStepSchedule(1, 5, { s: 1 })];
    expect(ticks[ticks.length - 1]!.tS).toBe(5);
    expect(ticks).toHaveLength(6); // t = 0..5
  });
});
