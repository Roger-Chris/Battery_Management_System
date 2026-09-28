/** CSV ingestion, relative-time alignment, metrics and exports for bench-log traces. */
export type TraceSource = "model" | "measurement";

export interface TraceRow {
  timestamp_s: number;
  values: Record<string, number>;
}

export interface Trace {
  headers: string[];
  rows: TraceRow[];
  testId?: string;
}

export interface ResidualPoint {
  time_s: number;
  expected: number;
  observed: number;
  residual: number;
}

export interface Comparison {
  expectedSource: TraceSource;
  observedSource: TraceSource;
  signal: string;
  unit: string;
  bias: number;
  rmse: number;
  maxAbsError: number;
  points: ResidualPoint[];
}

export const BENCH_LOG_HEADERS = [
  "timestamp_s", "test_id", "dac_code", "i_cmd_a", "ina1_current_a", "ina1_bus_v",
  "ina2_current_a", "ina2_bus_v", "ads48_ch0_code", "ads48_ch1_code", "ads49_ch0_code",
  "ads49_ch1_code", "tap1_v", "tap2_v", "tap3_v", "tap4_v", "cell1_v", "cell2_v",
  "cell3_v", "cell4_v", "t_cell_c", "t_ambient_c", "t_spare_c", "dmm_ref_v",
  "dmm_ref_a", "bms_board_state", "charge_relay", "heatsink_t_c", "note",
] as const;

const UNIT_BY_SIGNAL: Record<string, string> = {
  ina1_current_a: "A", ina1_bus_v: "V", ina2_current_a: "A", ina2_bus_v: "V",
  i_cmd_a: "A", tap1_v: "V", tap2_v: "V", tap3_v: "V", tap4_v: "V",
  cell1_v: "V", cell2_v: "V", cell3_v: "V", cell4_v: "V", t_cell_c: "°C",
  t_ambient_c: "°C", t_spare_c: "°C", dmm_ref_v: "V", dmm_ref_a: "A", heatsink_t_c: "°C",
  dac_code: "code", ads48_ch0_code: "code", ads48_ch1_code: "code", ads49_ch0_code: "code", ads49_ch1_code: "code",
};

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function parseTraceCsv(text: string): Trace {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row.");
  const headers = rows[0]!.map((header) => header.trim());
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.");
  const timeIndex = headers.indexOf("timestamp_s");
  if (timeIndex < 0) throw new Error('CSV is missing required column "timestamp_s".');
  const testIdIndex = headers.indexOf("test_id");
  const parsed: TraceRow[] = [];
  for (let line = 1; line < rows.length; line++) {
    const cells = rows[line]!;
    if (cells.length !== headers.length) throw new Error(`CSV row ${line + 1} has ${cells.length} fields; expected ${headers.length}.`);
    const timestampRaw = cells[timeIndex]!;
    const timestamp = Number(timestampRaw);
    if (timestampRaw === "" || !Number.isFinite(timestamp)) throw new Error(`CSV row ${line + 1} has an invalid timestamp_s.`);
    const values: Record<string, number> = {};
    headers.forEach((header, column) => {
      if (column === timeIndex || header === "test_id" || header === "note" || header === "bms_board_state" || header === "charge_relay") return;
      const raw = cells[column]!;
      if (raw === "") return;
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) throw new Error(`CSV row ${line + 1} column "${header}" is not numeric.`);
      values[header] = numeric;
    });
    parsed.push({ timestamp_s: timestamp, values });
  }
  parsed.sort((a, b) => a.timestamp_s - b.timestamp_s);
  const ids = testIdIndex < 0 ? [] : [...new Set(rows.slice(1).map((r) => r[testIdIndex] ?? "").filter(Boolean))];
  if (ids.length > 1) throw new Error(`CSV contains multiple test IDs (${ids.join(", ")}); compare one test per file.`);
  return { headers, rows: parsed, ...(ids.length === 1 ? { testId: ids[0] } : {}) };
}

function interpolate(rows: TraceRow[], relativeTime: number, signal: string): number | undefined {
  const firstTime = rows[0]!.timestamp_s;
  const target = firstTime + relativeTime;
  if (target < firstTime || target > rows[rows.length - 1]!.timestamp_s) return undefined;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (rows[mid]!.timestamp_s < target) low = mid + 1;
    else high = mid;
  }
  const right = rows[low]!;
  const rightValue = right.values[signal];
  if (right.timestamp_s === target || low === 0) return rightValue;
  const left = rows[low - 1]!;
  const leftValue = left.values[signal];
  if (leftValue === undefined || rightValue === undefined) return undefined;
  const fraction = (target - left.timestamp_s) / (right.timestamp_s - left.timestamp_s);
  return leftValue + fraction * (rightValue - leftValue);
}

export function compareTraces(
  expected: Trace,
  observed: Trace,
  signal: string,
  expectedSource: TraceSource,
  observedSource: TraceSource,
): Comparison {
  if (expected.testId && observed.testId && expected.testId !== observed.testId) throw new Error(`Test IDs do not match (${expected.testId} vs ${observed.testId}).`);
  if (!expected.headers.includes(signal) || !observed.headers.includes(signal)) throw new Error(`Signal "${signal}" must be present in both CSV files.`);
  const expectedRows = expected.rows.filter((row) => row.values[signal] !== undefined);
  const observedRows = observed.rows.filter((row) => row.values[signal] !== undefined);
  if (expectedRows.length === 0 || observedRows.length === 0) throw new Error(`Signal "${signal}" has no numeric values in one or both files.`);
  const expectedDuration = expectedRows[expectedRows.length - 1]!.timestamp_s - expectedRows[0]!.timestamp_s;
  const points: ResidualPoint[] = [];
  for (const row of observedRows) {
    const time = row.timestamp_s - observedRows[0]!.timestamp_s;
    if (time > expectedDuration) continue;
    const expectedValue = interpolate(expectedRows, time, signal);
    const observedValue = row.values[signal]!;
    if (expectedValue !== undefined) points.push({ time_s: time, expected: expectedValue, observed: observedValue, residual: observedValue - expectedValue });
  }
  if (points.length === 0) throw new Error("The traces do not overlap in time for this signal.");
  const bias = points.reduce((sum, point) => sum + point.residual, 0) / points.length;
  const rmse = Math.sqrt(points.reduce((sum, point) => sum + point.residual ** 2, 0) / points.length);
  const maxAbsError = Math.max(...points.map((point) => Math.abs(point.residual)));
  return { expectedSource, observedSource, signal, unit: UNIT_BY_SIGNAL[signal] ?? "value", bias, rmse, maxAbsError, points };
}

export function comparisonType(result: Comparison): "model-to-model" | "model-to-measurement" {
  return result.expectedSource === "model" && result.observedSource === "model" ? "model-to-model" : "model-to-measurement";
}

export function comparisonCsv(result: Comparison): string {
  const lines = ["row_type,comparison_type,signal,unit,time_s,expected,observed,residual,bias,rmse,max_abs_error"];
  const csvCell = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  for (const point of result.points) lines.push(["sample", comparisonType(result), result.signal, result.unit, point.time_s, point.expected, point.observed, point.residual, "", "", ""].map(csvCell).join(","));
  lines.push(["metrics", comparisonType(result), result.signal, result.unit, "", "", "", "", result.bias, result.rmse, result.maxAbsError].map(csvCell).join(","));
  return lines.join("\n");
}

function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
export function comparisonSvg(result: Comparison, width = 960, height = 480): string {
  const pad = { left: 72, right: 25, top: 65, bottom: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const timeMax = Math.max(result.points.reduce((latest, point) => Math.max(latest, point.time_s), 0), 1);
  const { min: rawMin, max: rawMax } = result.points.reduce((range, point) => ({
    min: Math.min(range.min, point.expected, point.observed),
    max: Math.max(range.max, point.expected, point.observed),
  }), { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
  let min = rawMin, max = rawMax;
  const span = max - min || Math.abs(max) * 0.05 || 1;
  min -= span * 0.08; max += span * 0.08;
  const x = (t: number) => pad.left + (t / timeMax) * plotW;
  const y = (v: number) => pad.top + ((max - v) / (max - min)) * plotH;
  const path = (get: (p: ResidualPoint) => number) => result.points.map((p, i) => `${i ? "L" : "M"}${x(p.time_s).toFixed(2)},${y(get(p)).toFixed(2)}`).join(" ");
  const type = comparisonType(result);
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = min + ((max - min) * i) / 4;
    const yy = y(value);
    return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#d9d9df"/><text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#6e6e73" font-size="12">${value.toPrecision(4)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(type)} comparison for ${xml(result.signal)}"><rect width="100%" height="100%" fill="#fff"/><text x="${pad.left}" y="25" font-family="Arial,sans-serif" font-size="15" font-weight="600" fill="#1c1c1e">${xml(type)} · ${xml(result.signal)} (${xml(result.unit)})</text><text x="${pad.left}" y="45" font-family="Arial,sans-serif" font-size="11" fill="#636366">Bias ${result.bias.toPrecision(4)} ${xml(result.unit)} · RMSE ${result.rmse.toPrecision(4)} ${xml(result.unit)} · Maximum error ${result.maxAbsError.toPrecision(4)} ${xml(result.unit)}</text>${grid}<path d="${path((p) => p.expected)}" fill="none" stroke="#007aff" stroke-width="2.5"/><path d="${path((p) => p.observed)}" fill="none" stroke="#ff9500" stroke-width="2"/><text x="${pad.left + 8}" y="${height - 16}" font-family="Arial,sans-serif" font-size="12" fill="#007aff">Expected</text><text x="${pad.left + 90}" y="${height - 16}" font-family="Arial,sans-serif" font-size="12" fill="#ff9500">${result.observedSource === "measurement" ? "Measured" : "Compared model"}</text><text x="${width / 2}" y="${height - 3}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#636366">Time from trace start (s)</text></svg>`;
}
