/**
 * SQLite-shaped telemetry and event records. `src/core/` stays framework-free (CLAUDE.md), so
 * this module only defines the row shapes, the `CREATE TABLE` DDL the Pi's real Python
 * firmware would run, and pure row-builder functions — no sqlite3 binding is opened here.
 */
export interface TelemetryRow {
  timestamp_ms: number;
  cell1_v: number;
  cell2_v: number;
  cell3_v: number;
  cell4_v: number;
  pack_current_a: number;
  load_current_a: number;
  t_cell_c: number;
  t_ambient_c: number;
  t_heatsink_c: number;
  soc_ekf: number;
  soc_coulomb: number;
  bms_state: string;
  charge_relay_closed: boolean;
}

export type EventType =
  | "protection_trip"
  | "protection_clear"
  | "ble_auth"
  | "ble_reject"
  | "anomaly"
  | "charge_start"
  | "charge_stop";

export interface EventRow {
  timestamp_ms: number;
  type: EventType;
  detail: string;
}

export const TELEMETRY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_ms INTEGER NOT NULL,
  cell1_v REAL, cell2_v REAL, cell3_v REAL, cell4_v REAL,
  pack_current_a REAL, load_current_a REAL,
  t_cell_c REAL, t_ambient_c REAL, t_heatsink_c REAL,
  soc_ekf REAL, soc_coulomb REAL,
  bms_state TEXT,
  charge_relay_closed INTEGER
);
`.trim();

export const EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_ms INTEGER NOT NULL,
  type TEXT NOT NULL,
  detail TEXT
);
`.trim();

const TELEMETRY_COLUMNS: Array<keyof TelemetryRow> = [
  "timestamp_ms",
  "cell1_v",
  "cell2_v",
  "cell3_v",
  "cell4_v",
  "pack_current_a",
  "load_current_a",
  "t_cell_c",
  "t_ambient_c",
  "t_heatsink_c",
  "soc_ekf",
  "soc_coulomb",
  "bms_state",
  "charge_relay_closed",
];

/** Ordered values matching an `INSERT INTO telemetry (...) VALUES (?, ?, ...)` statement. */
export function telemetryRowToValues(row: TelemetryRow): Array<string | number> {
  return TELEMETRY_COLUMNS.map((col) => {
    const v = row[col];
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
  });
}

export function eventRowToValues(row: EventRow): Array<string | number> {
  return [row.timestamp_ms, row.type, row.detail];
}
