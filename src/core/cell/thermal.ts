/**
 * Two-node (core/surface) lumped thermal model, parameters from the cell profile
 * (data/cell_profiles/*.json `thermal` block, an assumed placeholder pending bench test T12).
 */
import type { CellProfile } from "../config/cellProfile";

export interface ThermalState {
  coreC: number;
  surfC: number;
}

export function initialThermalState(ambientC: number): ThermalState {
  return { coreC: ambientC, surfC: ambientC };
}

export function stepThermal(
  state: ThermalState,
  heatGenW: number,
  ambientC: number,
  dtS: number,
  profile: CellProfile,
): ThermalState {
  const { C_core_J_per_K, C_surf_J_per_K, R_core_K_per_W, R_surf_K_per_W } = profile.fields.thermal.value;
  const qCoreToSurfW = (state.coreC - state.surfC) / R_core_K_per_W;
  const qSurfToAmbW = (state.surfC - ambientC) / R_surf_K_per_W;
  const dCoreC = ((heatGenW - qCoreToSurfW) / C_core_J_per_K) * dtS;
  const dSurfC = ((qCoreToSurfW - qSurfToAmbW) / C_surf_J_per_K) * dtS;
  return { coreC: state.coreC + dCoreC, surfC: state.surfC + dSurfC };
}
