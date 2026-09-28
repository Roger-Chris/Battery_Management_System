/**
 * DS18B20 temperature probe: physical temperature -> quantized code, at a caller-chosen bit
 * depth (Analog Devices/Maxim datasheet resolution/conversion-time tables, from
 * `core/config/bom.ts`). Probe thermal lag (first-order step response) has no datasheet
 * figure in the handoff, so its time constant is a required parameter, not a guess —
 * estimate it from a bench step-response test before trusting the lag model.
 */
import { BOM } from "../config/bom";

export type Ds18b20Bits = 9 | 10 | 11 | 12;

export function resolutionC(bits: Ds18b20Bits): number {
  return BOM.ds18b20.resolutionC.value[String(bits)]!;
}

export function conversionTimeMs(bits: Ds18b20Bits): number {
  return BOM.ds18b20.conversionMs.value[String(bits)]!;
}

export function temperatureToCode(tempC: number, bits: Ds18b20Bits = 12): number {
  const res = resolutionC(bits);
  return Math.round(tempC / res);
}

export function codeToTemperature(code: number, bits: Ds18b20Bits = 12): number {
  return code * resolutionC(bits);
}

/**
 * First-order lag applied to a true-temperature series to model the probe's thermal mass.
 * `tauS` must be sourced from a bench step-response measurement; there is no datasheet value.
 */
export function probeLagStep(previousReadingC: number, trueTempC: number, dtS: number, tauS: number): number {
  const alpha = 1 - Math.exp(-dtS / tauS);
  return previousReadingC + alpha * (trueTempC - previousReadingC);
}
