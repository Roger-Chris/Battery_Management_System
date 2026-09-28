import { describe, expect, it } from "vitest";
import { computeExpectedValues } from "./hwCalc";
import expectedValues from "../../../tools/expected_values.json";

describe("computeExpectedValues", () => {
  it("reproduces every value in tools/expected_values.json", () => {
    expect(computeExpectedValues()).toEqual(expectedValues);
  });
});
