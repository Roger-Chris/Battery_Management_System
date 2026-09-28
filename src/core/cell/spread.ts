/**
 * Per-cell capacity/resistance spread across the 4S pack. docs/HARDWARE_SPEC.md: "Run test
 * T7 (capacity) on every cell and do not mix cells more than about 3 % apart." Cells default
 * to identical (factor 1) until the caller supplies measured per-cell spread from T7/T9.
 */
export const MAX_CELL_MISMATCH_PCT = 3;

export interface CellSpreadFactors {
  capacityFactor: number;
  r0Factor: number;
}

export function defaultSpread(cellCount: number): CellSpreadFactors[] {
  return Array.from({ length: cellCount }, () => ({ capacityFactor: 1, r0Factor: 1 }));
}
