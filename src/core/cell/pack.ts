/**
 * 4S1P pack: combines per-cell equivalent-circuit state into series tap voltages, as seen by
 * the divider ladder (docs/HARDWARE_SPEC.md net list: tap N = sum of cells 1..N). All cells
 * share the same series current; per-cell capacity spread (spread.ts) changes how fast each
 * cell's SOC moves.
 */
import type { CellProfile } from "../config/cellProfile";
import { ocvWithBand } from "./ocv";
import {
  type EquivalentCircuitState,
  initialEquivalentCircuitState,
  stepEquivalentCircuit,
  terminalVoltage,
} from "./equivalentCircuit";
import { type CellSpreadFactors, defaultSpread } from "./spread";

export interface CellState {
  socFraction: number;
  circuit: EquivalentCircuitState;
}

export interface PackState {
  cells: CellState[];
}

export function initialPackState(profile: CellProfile, initialSocFraction: number, cellCount = 4): PackState {
  return {
    cells: Array.from({ length: cellCount }, () => ({
      socFraction: initialSocFraction,
      circuit: initialEquivalentCircuitState(profile),
    })),
  };
}

/** Pack current convention: currentA > 0 discharging. */
export function stepPack(
  state: PackState,
  currentA: number,
  dtS: number,
  profile: CellProfile,
  spread: CellSpreadFactors[] = defaultSpread(state.cells.length),
): PackState {
  const capacityAh = profile.fields.capacity_nominal_Ah.value;
  const cells = state.cells.map((cell, i) => {
    const factor = spread[i] ?? { capacityFactor: 1, r0Factor: 1 };
    const capacityAs = capacityAh * factor.capacityFactor * 3600;
    const socFraction = cell.socFraction - (currentA * dtS) / capacityAs;
    const circuit = stepEquivalentCircuit(cell.circuit, currentA, dtS, profile);
    return { socFraction, circuit };
  });
  return { cells };
}

export function cellVoltages(state: PackState, currentA: number, profile: CellProfile): number[] {
  return state.cells.map((cell) => terminalVoltage(cell.socFraction, currentA, cell.circuit, profile));
}

/** Cumulative tap voltages (tap 1..N), matching the divider ladder's net list. */
export function tapVoltages(state: PackState, currentA: number, profile: CellProfile): number[] {
  let cumulative = 0;
  return state.cells.map((cell) => {
    cumulative += terminalVoltage(cell.socFraction, currentA, cell.circuit, profile);
    return cumulative;
  });
}

export interface TapVoltageBand {
  nominalV: number;
  lowV: number;
  highV: number;
}

/** Cumulative tap voltage bands, propagating each cell's OCV uncertainty (ocv.ts). */
export function tapVoltageBands(state: PackState, currentA: number, profile: CellProfile): TapVoltageBand[] {
  const r0 = profile.fields.r0_ohm.value;
  let cumNominal = 0;
  let cumLow = 0;
  let cumHigh = 0;
  return state.cells.map((cell) => {
    const ocvBand = ocvWithBand(cell.socFraction, profile);
    const rcDropV = cell.circuit.rc.reduce((sum, b) => sum + b.vV, 0);
    const nominalV = ocvBand.nominalV - currentA * r0 - rcDropV;
    const lowV = ocvBand.lowV - currentA * r0 - rcDropV;
    const highV = ocvBand.highV - currentA * r0 - rcDropV;
    cumNominal += nominalV;
    cumLow += lowV;
    cumHigh += highV;
    return { nominalV: cumNominal, lowV: cumLow, highV: cumHigh };
  });
}
