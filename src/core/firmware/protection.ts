/**
 * The Pi software protection layer — the row that "trips first" in docs/HARDWARE_SPEC.md's
 * protection-coordination table, ahead of the BMS board (hardware/bmsBoard.ts) and the fuse
 * (hardware/fuse.ts).
 */
import { BOM } from "../config/bom";
import { CELL, V1 } from "../config/validateDesign";

export const SW_OV_V = V1.swOv; // 4.22 V/cell
export const SW_UV_V = V1.swUv; // 3.00 V/cell
export const LOAD_CAP_A = BOM.load.firmwareCapA.value; // 1.25 A
export const HEATSINK_CUTOFF_C = BOM.heatsink.cutoffC.value; // 80 °C
export const CHARGE_MAX_CELL_TEMP_C = CELL.tChargeMax; // 45 °C
/** docs/HARDWARE_SPEC.md protection-coordination table: "2.2 A charge" — a software ceiling
 *  above the charger's own 2.0 A max output (charger.ts), kept as a separate non-binding cap. */
export const CHARGE_CURRENT_CAP_A = 2.2;

export interface ProtectionInputs {
  cellVoltagesV: number[];
  loadCurrentA: number;
  heatsinkC: number;
  cellTempC: number;
}

export interface ProtectionStatus {
  overVoltage: boolean;
  underVoltage: boolean;
  overCurrent: boolean;
  heatsinkOverTemp: boolean;
  chargeOverTemp: boolean;
  /** Load current the firmware will actually command, after every trip that forces it to 0. */
  loadCommandLimitA: number;
  chargeAllowed: boolean;
}

export function evaluateProtection(inputs: ProtectionInputs): ProtectionStatus {
  const overVoltage = inputs.cellVoltagesV.some((v) => v >= SW_OV_V);
  const underVoltage = inputs.cellVoltagesV.some((v) => v <= SW_UV_V);
  const overCurrent = inputs.loadCurrentA > LOAD_CAP_A;
  const heatsinkOverTemp = inputs.heatsinkC >= HEATSINK_CUTOFF_C;
  const chargeOverTemp = inputs.cellTempC >= CHARGE_MAX_CELL_TEMP_C;

  const loadShouldStop = underVoltage || heatsinkOverTemp;
  const loadCommandLimitA = loadShouldStop ? 0 : Math.min(inputs.loadCurrentA, LOAD_CAP_A);
  const chargeAllowed = !overVoltage && !chargeOverTemp;

  return { overVoltage, underVoltage, overCurrent, heatsinkOverTemp, chargeOverTemp, loadCommandLimitA, chargeAllowed };
}
