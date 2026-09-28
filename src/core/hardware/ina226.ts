/**
 * INA226 register model. LSBs and the calibration register are the design's own choices
 * (see `core/config/bom.ts`, ported from `tools/hw_calc.py`); register formulas (current =
 * shunt-voltage-register × CAL / 2048, power = current-register × bus-register / 5000) are
 * TI SBOS547's documented register equations, not invented values.
 * Averaging count and conversion time are caller-supplied: the handoff does not specify
 * which of the datasheet's selectable settings this rig uses.
 */
import { BOM } from "../config/bom";

const rShunt = BOM.ina226.rShunt.value;
const vShuntLsb = BOM.ina226.vShuntLsb.value;
const vBusLsb = BOM.ina226.vBusLsb.value;
const currentLsb = BOM.ina226.currentLsb.value;

export function calibrationRegister(): number {
  return Math.round(0.00512 / (currentLsb * rShunt));
}

export function shuntVoltageRegister(currentA: number): number {
  const shuntV = currentA * rShunt;
  return Math.round(shuntV / vShuntLsb);
}

export function busVoltageRegister(busV: number): number {
  return Math.round(busV / vBusLsb);
}

/** TI SBOS547: Current_Register = (ShuntVoltage_Register × CAL) / 2048. */
export function currentRegister(currentA: number): number {
  return Math.round((shuntVoltageRegister(currentA) * calibrationRegister()) / 2048);
}

export function currentFromRegister(reg: number): number {
  return reg * currentLsb;
}

/** TI SBOS547: Power_LSB = 25 × Current_LSB; Power_Register = Power / Power_LSB. */
export function powerRegister(currentA: number, busV: number): number {
  const powerLsb = 25 * currentLsb;
  return Math.round((currentA * busV) / powerLsb);
}

export function powerFromRegister(reg: number): number {
  return reg * 25 * currentLsb;
}
