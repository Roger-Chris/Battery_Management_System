/**
 * Typed loader for data/cell_profiles/*.json. These files ship with per-field provenance
 * already in the shape of `Parameter<T>` (see data/cell_profiles/dmegc_inr18650_26e.json),
 * so this module only adds types and a provisional-status rollup — it invents nothing.
 */
import type { Parameter } from "./provenance";
import { isProvisional } from "./provenance";
import dmegcInr18650_26e from "../../../data/cell_profiles/dmegc_inr18650_26e.json";

export interface OcvCurve {
  soc: number[];
  ocv_V: number[];
}

export interface RcPair {
  R_ohm: number;
  tau_s: number;
}

export interface CellThermal {
  C_core_J_per_K: number;
  C_surf_J_per_K: number;
  R_core_K_per_W: number;
  R_surf_K_per_W: number;
}

export interface CellProfileFields {
  capacity_nominal_Ah: Parameter<number>;
  capacity_min_Ah: Parameter<number>;
  voltage_nominal_V: Parameter<number>;
  voltage_charge_V: Parameter<number>;
  voltage_cutoff_V: Parameter<number>;
  charge_current_max_A: Parameter<number>;
  charge_end_current_A: Parameter<number>;
  discharge_current_max_A: Parameter<number>;
  charge_temperature_C: Parameter<[number, number]>;
  discharge_temperature_C: Parameter<[number, number]>;
  self_discharge_pct_per_month: Parameter<Record<string, number>>;
  cycle_life: Parameter<string>;
  mass_g: Parameter<number>;
  ocv_curve: Parameter<OcvCurve>;
  r0_ohm: Parameter<number>;
  rc_pairs: Parameter<RcPair[]>;
  thermal: Parameter<CellThermal>;
  conflicts: Parameter<string>;
}

export interface CellProfile {
  id: string;
  status: "provisional" | "final";
  note: string;
  fields: CellProfileFields;
}

export const DMEGC_INR18650_26E = dmegcInr18650_26e as unknown as CellProfile;

/** Field names still not `datasheet` or `measured` — the UI shows a Provisional badge and
 *  dependent traces show an uncertainty band while this list is non-empty. */
export function provisionalFields(profile: CellProfile): string[] {
  return (Object.entries(profile.fields) as Array<[string, Parameter<unknown>]>)
    .filter(([, param]) => isProvisional(param))
    .map(([name]) => name);
}

export function isCellProfileProvisional(profile: CellProfile): boolean {
  return provisionalFields(profile).length > 0;
}
