/**
 * Thevenin equivalent circuit: R0 in series with two RC branches (double polarization),
 * parameters from the cell profile (data/cell_profiles/*.json `r0_ohm` / `rc_pairs`, both
 * provisional placeholders pending bench test T9).
 */
import type { CellProfile } from "../config/cellProfile";
import { ocvFromSoc } from "./ocv";

export interface RcBranchState {
  vV: number;
}

export interface EquivalentCircuitState {
  rc: RcBranchState[];
}

export function initialEquivalentCircuitState(profile: CellProfile): EquivalentCircuitState {
  return { rc: profile.fields.rc_pairs.value.map(() => ({ vV: 0 })) };
}

/** Discharge current convention: currentA > 0 means the cell is discharging. */
export function stepEquivalentCircuit(
  state: EquivalentCircuitState,
  currentA: number,
  dtS: number,
  profile: CellProfile,
): EquivalentCircuitState {
  const pairs = profile.fields.rc_pairs.value;
  const rc = state.rc.map((branch, i) => {
    const pair = pairs[i]!;
    const decay = Math.exp(-dtS / pair.tau_s);
    return { vV: branch.vV * decay + currentA * pair.R_ohm * (1 - decay) };
  });
  return { rc };
}

export function terminalVoltage(
  socFraction: number,
  currentA: number,
  state: EquivalentCircuitState,
  profile: CellProfile,
): number {
  const ocv = ocvFromSoc(socFraction, profile);
  const r0 = profile.fields.r0_ohm.value;
  const rcDrop = state.rc.reduce((sum, b) => sum + b.vV, 0);
  return ocv - currentA * r0 - rcDrop;
}
