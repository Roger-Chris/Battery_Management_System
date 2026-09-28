/**
 * TypeScript port of `tools/hw_calc.py` `report()`. Must stay numerically identical to
 * `tools/expected_values.json` (regenerate that fixture with `python tools/hw_calc.py --json`).
 * Every input constant is a provenance-typed `Parameter` from `bom.ts` — no bare numbers.
 */
import { BOM } from "./bom";

export const PACK_VOLTAGE_SWEEP_V = [16.8, 16.0, 14.8, 13.2, 12.0] as const;

export interface DividerReport {
  ratio: number;
  source_impedance_ohm: number;
  tap_V_at_full_charge: number[];
  adc_V_at_full_charge: number[];
  adc_lsb_V: number;
  tap_referred_lsb_mV: number;
  worst_ratio_error_pct: number;
  worst_tap_error_mV: number[];
  worst_cell_error_mV_uncalibrated: number[];
  loading_gain_error_pct: Record<string, number>;
  diode_leak_cell_referred_error_mV: Record<string, number>;
  divider_current_uA: number[];
  current_through_cell_uA: number[];
  cell1_vs_cell4_imbalance_mAh_per_day: number;
}

export interface Ina226Report {
  full_scale_A: number;
  shunt_resolution_A: number;
  current_lsb_A: number;
  calibration_register: number;
  bus_lsb_V: number;
  shunt_W_at_5A: number;
}

export interface LoadRow {
  pack_V: number;
  max_current_A: number;
  resistor_W_at_max: number;
  mosfet_worst_W: number;
  mosfet_worst_at_A: number;
}

export interface LoadReport {
  dac_lsb_V: number;
  dac_lsb_A_without_divider: number;
  dac_lsb_A: number;
  dac_full_scale_A: number;
  firmware_cap_A: number;
  resistor_W_at_cap: number;
  sense_W_at_cap: number;
  rows: LoadRow[];
  required_heatsink_C_per_W: number;
  mosfet_tj_bound_C_budget_build: number;
  mosfet_tj_worst_C_with_530002B02500G: number;
}

export interface Ds18b20Report {
  accuracy_C: number;
  accuracy_range: string;
  resolution_C: Record<string, number>;
  conversion_ms: Record<string, number>;
}

export interface ExpectedValuesReport {
  divider: DividerReport;
  ina226: Ina226Report;
  load: LoadReport;
  ds18b20: Ds18b20Report;
}

export function computeExpectedValues(): ExpectedValuesReport {
  const rTop = BOM.divider.rTop.value;
  const rBot = BOM.divider.rBot.value;
  const rSeries = BOM.divider.rSeries.value;
  const rTol = BOM.divider.rTolerance.value;
  const adsFsr = BOM.ads1115.fsr.value;
  const adsZinCandidates = [BOM.ads1115.zinCommonMode.value];
  const diodeLeakCases = BOM.diodeLeakageCases.value;
  const vCellMax = BOM.cell.vChargeMax.value;
  const nCells = BOM.cell.seriesCount.value;

  const k = rBot / (rTop + rBot);
  const rSrc = (rTop * rBot) / (rTop + rBot) + rSeries;
  const taps = Array.from({ length: nCells }, (_, i) => vCellMax * (i + 1));

  const kHi = (rBot * (1 + rTol)) / (rTop * (1 - rTol) + rBot * (1 + rTol));
  const e = kHi / k - 1;

  const loadingGainErrorPct: Record<string, number> = {};
  for (const z of adsZinCandidates) {
    loadingGainErrorPct[`Zin_${z / 1e6}MOhm`] = (rSrc / (rSrc + z)) * 100;
  }

  const diodeLeakMv: Record<string, number> = {};
  for (const { nA, A } of diodeLeakCases) {
    diodeLeakMv[`${nA}nA`] = ((A * rSrc) / k) * 1e3;
  }

  const drains = taps.map((t) => t / (rTop + rBot));
  const drainsSum = drains.reduce((a, b) => a + b, 0);

  const divider: DividerReport = {
    ratio: k,
    source_impedance_ohm: rSrc,
    tap_V_at_full_charge: taps,
    adc_V_at_full_charge: taps.map((t) => t * k),
    adc_lsb_V: adsFsr / 32768,
    tap_referred_lsb_mV: (adsFsr / 32768 / k) * 1e3,
    worst_ratio_error_pct: e * 100,
    worst_tap_error_mV: taps.map((t) => t * e * 1e3),
    worst_cell_error_mV_uncalibrated: taps.map((t, i) => (t + (i ? taps[i - 1]! : 0)) * e * 1e3),
    loading_gain_error_pct: loadingGainErrorPct,
    diode_leak_cell_referred_error_mV: diodeLeakMv,
    divider_current_uA: drains.map((x) => x * 1e6),
    current_through_cell_uA: drains.map(
      (_, i) => drains.slice(i).reduce((a, b) => a + b, 0) * 1e6,
    ),
    cell1_vs_cell4_imbalance_mAh_per_day: (drainsSum - drains[drains.length - 1]!) * 24 * 1e3,
  };

  const rShunt = BOM.ina226.rShunt.value;
  const ina226: Ina226Report = {
    full_scale_A: BOM.ina226.vShuntFullScale.value / rShunt,
    shunt_resolution_A: BOM.ina226.vShuntLsb.value / rShunt,
    current_lsb_A: BOM.ina226.currentLsb.value,
    calibration_register: 0.00512 / (BOM.ina226.currentLsb.value * rShunt),
    bus_lsb_V: BOM.ina226.vBusLsb.value,
    shunt_W_at_5A: 25 * rShunt,
  };

  const dacVref = BOM.load.dacVref.value;
  const dacDiv =
    BOM.load.dacDividerBottom.value /
    (BOM.load.dacDividerTop.value + BOM.load.dacDividerBottom.value);
  const iCap = BOM.load.firmwareCapA.value;
  const dacBits = BOM.load.dacBits.value;
  const rSense = BOM.load.rSense.value;
  const rLoad = BOM.load.rLoad.value;
  const rdsOn = BOM.irlz44n.rdsOn.value;
  const mosfetRthJc = BOM.irlz44n.rthJc.value;
  const mosfetRthCsGreased = BOM.irlz44n.rthCsGreased.value;
  const heatsinkRth = BOM.heatsink.rthDatasheetUpgrade.value;
  const heatsinkCutoffC = BOM.heatsink.cutoffC.value;
  const rthCsInsulated = BOM.heatsink.rthCsInsulatedPad.value;
  const mosfetTjTarget = BOM.thermalDesign.mosfetTjTarget.value;
  const tAmb = BOM.thermalDesign.ambientC.value;

  const lsb = dacVref / 2 ** dacBits;
  const rows: LoadRow[] = PACK_VOLTAGE_SWEEP_V.map((vp) => {
    const iMax = vp / (rLoad + rSense + rdsOn);
    return {
      pack_V: vp,
      max_current_A: iMax,
      resistor_W_at_max: iMax ** 2 * rLoad,
      mosfet_worst_W: vp ** 2 / (4 * (rLoad + rSense)),
      mosfet_worst_at_A: vp / (2 * (rLoad + rSense)),
    };
  });
  const firstRow = rows[0]!;

  const load: LoadReport = {
    dac_lsb_V: lsb,
    dac_lsb_A_without_divider: lsb / rSense,
    dac_lsb_A: (lsb * dacDiv) / rSense,
    dac_full_scale_A: (dacVref * dacDiv) / rSense,
    firmware_cap_A: iCap,
    resistor_W_at_cap: iCap ** 2 * rLoad,
    sense_W_at_cap: iCap ** 2 * rSense,
    rows,
    required_heatsink_C_per_W:
      (mosfetTjTarget - tAmb) / firstRow.mosfet_worst_W - mosfetRthJc - mosfetRthCsGreased,
    mosfet_tj_bound_C_budget_build:
      heatsinkCutoffC + firstRow.mosfet_worst_W * (mosfetRthJc + rthCsInsulated),
    mosfet_tj_worst_C_with_530002B02500G:
      tAmb + firstRow.mosfet_worst_W * (mosfetRthJc + mosfetRthCsGreased + heatsinkRth),
  };

  const ds18b20: Ds18b20Report = {
    accuracy_C: BOM.ds18b20.accuracyC.value,
    accuracy_range: BOM.ds18b20.accuracyRange.value,
    resolution_C: BOM.ds18b20.resolutionC.value,
    conversion_ms: BOM.ds18b20.conversionMs.value,
  };

  return { divider, ina226, load, ds18b20 };
}
