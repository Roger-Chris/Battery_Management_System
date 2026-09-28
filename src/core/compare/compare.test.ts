import { describe, expect, it } from "vitest";
import { compareTraces, comparisonCsv, comparisonSvg, comparisonType, parseTraceCsv } from "./compare";

const header = "timestamp_s,test_id,cell1_v,note";

describe("compare traces", () => {
  it("parses quoted CSV values and sorts timestamp rows", () => {
    const trace = parseTraceCsv(`${header}\n2,T2,3.8,"rest, stable"\n1,T2,3.7,first`);
    expect(trace.testId).toBe("T2");
    expect(trace.rows.map((row) => row.timestamp_s)).toEqual([1, 2]);
    expect(trace.rows[1]!.values.cell1_v).toBe(3.8);
  });

  it("aligns relative time, interpolates, and calculates the metrics", () => {
    const expected = parseTraceCsv(`${header}\n10,T2,3.70,a\n12,T2,3.90,b`);
    const measured = parseTraceCsv(`${header}\n100,T2,3.72,a\n101,T2,3.82,b\n102,T2,3.94,c`);
    const result = compareTraces(expected, measured, "cell1_v", "model", "measurement");
    expect(result.points.map((point) => point.expected)).toEqual([3.7, 3.8, 3.9]);
    expect(result.bias).toBeCloseTo(0.0266666667);
    expect(result.rmse).toBeCloseTo(Math.sqrt(0.0008));
    expect(result.maxAbsError).toBeCloseTo(0.04);
    expect(comparisonType(result)).toBe("model-to-measurement");
  });

  it("labels model-to-model comparisons and includes the type in exports", () => {
    const trace = parseTraceCsv(`${header}\n0,T2,3.7,a\n1,T2,3.8,b`);
    const result = compareTraces(trace, trace, "cell1_v", "model", "model");
    expect(comparisonType(result)).toBe("model-to-model");
    expect(comparisonCsv(result)).toContain("sample,model-to-model,cell1_v,V,0,3.7,3.7,0");
    expect(comparisonSvg(result)).toContain("model-to-model · cell1_v (V)");
  });

  it("rejects missing required columns and signals", () => {
    expect(() => parseTraceCsv("time_s,cell1_v\n0,3.7")).toThrow('timestamp_s');
    expect(() => parseTraceCsv(`${header}\n,T2,3.7,a`)).toThrow("invalid timestamp_s");
    const trace = parseTraceCsv(`${header}\n0,T2,3.7,a`);
    expect(() => compareTraces(trace, trace, "cell2_v", "model", "model")).toThrow("must be present");
    const otherTest = parseTraceCsv(`${header}\n0,T3,3.7,a`);
    expect(() => compareTraces(trace, otherTest, "cell1_v", "model", "model")).toThrow("Test IDs do not match");
  });
});
