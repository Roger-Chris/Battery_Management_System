/**
 * ADS1115 16-bit ADC: pin voltage <-> two's-complement register code, at a caller-chosen
 * PGA full-scale range, plus the round-robin timing for reading N muxed channels. TI SBAS444
 * is the source for the ±4.096 V FSR and the 6 MΩ common-mode input impedance (see
 * `core/config/bom.ts`); this module does not invent a data rate or noise figure — the
 * handoff does not specify one, so callers (Phase 4 firmware config) must supply it.
 */
import { BOM } from "../config/bom";

const CODE_MIN = -32768;
const CODE_MAX = 32767;

export function lsbVolts(fsrV: number = BOM.ads1115.fsr.value): number {
  return fsrV / 32768;
}

/** Quantize a pin voltage to the ADS1115's signed 16-bit code at the given PGA FSR. */
export function voltageToCode(voltageV: number, fsrV: number = BOM.ads1115.fsr.value): number {
  const raw = Math.round(voltageV / lsbVolts(fsrV));
  return Math.min(CODE_MAX, Math.max(CODE_MIN, raw));
}

export function codeToVoltage(code: number, fsrV: number = BOM.ads1115.fsr.value): number {
  return code * lsbVolts(fsrV);
}

/**
 * Sample timestamps for `channelCount` channels read round-robin at `dataRateSps` (the
 * device converts one channel per 1/dataRateSps seconds). Returns, for each channel, the
 * timestamps (s) at which a fresh conversion for that channel is available up to `durationS`.
 */
export function roundRobinSchedule(
  channelCount: number,
  dataRateSps: number,
  durationS: number,
): number[][] {
  const conversionPeriodS = 1 / dataRateSps;
  const schedule: number[][] = Array.from({ length: channelCount }, () => []);
  let t = conversionPeriodS;
  let channel = 0;
  while (t <= durationS) {
    schedule[channel % channelCount]!.push(t);
    channel += 1;
    t += conversionPeriodS;
  }
  return schedule;
}
