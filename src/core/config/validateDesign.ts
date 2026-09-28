/**
 * TypeScript port of `tools/validate_design.py`. Mirrors every design rule so the site can
 * show the same v0 (fails) / v1 (passes) validation the paper cites. Every source constant
 * carries provenance per CLAUDE.md rule 1; values marked VERIFY in the Python comments are
 * flagged the same way here.
 */
import type { Parameter } from "./provenance";

export interface Cell {
  model: string;
  vMax: number;
  vCutoff: number;
  capNomAh: number;
  capMinAh: number;
  iChargeMax: number;
  iDisMax: number;
  iDisMaxConservative: number;
  tChargeMax: number;
}

export const CELL: Cell = {
  model: "DMEGC INR18650-26E",
  vMax: 4.2,
  vCutoff: 2.5,
  capNomAh: 2.6,
  capMinAh: 2.5,
  iChargeMax: 2.6,
  iDisMax: 7.8,
  iDisMaxConservative: 5.0,
  tChargeMax: 45.0,
};
export const CELL_SOURCE: Parameter<Cell> = {
  value: CELL,
  unit: "mixed",
  source: "datasheet",
  ref: "DMEGC INR18650-26E product page + ANSMANN sheet for a pack on this cell; conservative values chosen where sources disagree",
};

export interface Bms {
  ovDetect: number;
  ovTol: number;
  uvDetect: number;
  uvTol: number;
  ocTripA: number;
}
export const BMS: Bms = { ovDetect: 4.28, ovTol: 0.05, uvDetect: 2.55, uvTol: 0.08, ocTripA: 80.0 };
export const BMS_SOURCE: Parameter<Bms> = {
  value: BMS,
  unit: "mixed",
  source: "listing",
  ref: "Generic 4S 40 A BMS board, seller listing values (VERIFY by measurement, test T0b)",
  verify: true,
};

export interface OpAmp {
  name: string;
  vicrAboveVneg: number;
  vicrBelowVpos: number;
  vsupMax: number;
  vohDrop?: number;
}
export const TL072: OpAmp = { name: "TL072", vicrAboveVneg: 4.0, vicrBelowVpos: 0.0, vsupMax: 36 };
export const TL072_SOURCE: Parameter<OpAmp> = {
  value: TL072,
  unit: "mixed",
  source: "datasheet",
  ref: "TI TL07x, ±15 V test point (VERIFY)",
  verify: true,
};
export const LM358: OpAmp = {
  name: "LM358",
  vicrAboveVneg: 0.0,
  vicrBelowVpos: 1.5,
  vsupMax: 32,
  vohDrop: 1.5,
};
export const LM358_SOURCE: Parameter<OpAmp> = {
  value: LM358,
  unit: "mixed",
  source: "datasheet",
  ref: "TI LM358",
};

export interface Ads1115Rules {
  vdd: number;
  fsr: number;
  zinCm: number;
  iInMax: number;
}
export const ADS1115: Ads1115Rules = { vdd: 3.3, fsr: 4.096, zinCm: 6e6, iInMax: 10e-3 };
export const ADS1115_SOURCE: Parameter<Ads1115Rules> = {
  value: ADS1115,
  unit: "mixed",
  source: "datasheet",
  ref: "TI SBAS444: 6 MΩ common-mode input impedance at ±4.096 V, 10 mA continuous input current",
};

export interface Irlz44nRules {
  rthJc: number;
  rthCsGrease: number;
  tjMax: number;
  vgsNeeded: number;
}
export const IRLZ44N: Irlz44nRules = { rthJc: 1.4, rthCsGrease: 0.5, tjMax: 175, vgsNeeded: 3.5 };
export const IRLZ44N_SOURCE: Parameter<Irlz44nRules> = {
  value: IRLZ44N,
  unit: "mixed",
  source: "datasheet",
  ref: "Infineon IRLZ44N (VERIFY); Vgs for ~1.3 A with margin",
  verify: true,
};

export const INA226 = { vshuntFs: 0.08192 };
export const INA226_SOURCE: Parameter<typeof INA226> = {
  value: INA226,
  unit: "V",
  source: "datasheet",
  ref: "TI SBOS547 (INA226) shunt input full scale",
};

/** Heatsink label -> Rth in °C/W, or null when it is not characterised by a datasheet
 *  (budget build: bounded instead by the firmware cut-off on a DS18B20, measured in T6). */
export const HEATSINKS: Record<string, number | null> = {
  "generic small clip-on (assumed 20 °C/W)": 20.0,
  "Boyd/Aavid 530002B02500G (2.6 °C/W)": 2.6,
  "generic heatsink + 12 V fan, measured in T6": null,
};
export const HEATSINKS_SOURCE: Parameter<Record<string, number | null>> = {
  value: HEATSINKS,
  unit: "K/W",
  source: "assumed",
  ref: "'generic small clip-on' is an assumed placeholder for the v0 BOM; the datasheet upgrade cites docs/HARDWARE_SPEC.md; the budget-build heatsink is measured in T6, not predicted",
};

export const RTH_CS_INSULATED = 1.5; // silicone/mica pad needed when the MOSFET shares the heatsink with the resistor (assumed; VERIFY pad data)
export const AWG18_CHASSIS_A = 10.0; // conservative chassis-wiring figure for 18 AWG PVC

export interface DesignConfig {
  nSeries: number;
  chargerV: number;
  chargerA: number;
  fuseA: number;
  divider: [number, number];
  rSeries: number;
  schottkyClamps: boolean;
  calibrateAdc: boolean;
  opamp: OpAmp;
  opampSupply: number;
  dacVref: number;
  dacDivider: [number, number] | null;
  rSense: number;
  rLoad: number;
  rSenseRatingW: number | null;
  iCap: number | null;
  heatsink: string;
  sharedHeatsink?: boolean;
  heatsinkCutoffC?: number;
  heatsinkSensor?: boolean;
  resistorMountedOnHeatsink: boolean;
  swOv: number;
  swUv: number;
  chargeRelay: boolean;
  tAmb: number;
  i2c: Record<string, number>;
  ds18b20PeriodS: number;
  testCurrentA: number;
}

export const BASE: DesignConfig = {
  nSeries: 4,
  chargerV: 12.0,
  chargerA: 4.0,
  fuseA: 5.0,
  divider: [1e6, 200e3],
  rSeries: 10e3,
  schottkyClamps: true,
  calibrateAdc: true,
  opamp: TL072,
  opampSupply: 5.0,
  dacVref: 3.3,
  dacDivider: null,
  rSense: 0.1,
  rLoad: 10.0,
  rSenseRatingW: null,
  iCap: null,
  heatsink: "generic small clip-on (assumed 20 °C/W)",
  resistorMountedOnHeatsink: false,
  swOv: 4.25,
  swUv: 3.0,
  chargeRelay: false,
  tAmb: 35.0,
  i2c: { "ADS1115 #1": 0x48, "ADS1115 #2": 0x49, "INA226 #1": 0x40, "INA226 #2": 0x41, MCP4725: 0x60 },
  ds18b20PeriodS: 1.0,
  testCurrentA: 1.0,
};

export const V1: DesignConfig = {
  ...BASE,
  chargerV: 16.8,
  chargerA: 2.0,
  schottkyClamps: false,
  opamp: LM358,
  opampSupply: 12.0,
  dacDivider: [9.1e3, 1.0e3],
  rSenseRatingW: 1.0,
  iCap: 1.25,
  heatsink: "generic heatsink + 12 V fan, measured in T6",
  sharedHeatsink: true,
  heatsinkCutoffC: 80.0,
  heatsinkSensor: true,
  resistorMountedOnHeatsink: true,
  swOv: 4.22,
  chargeRelay: true,
};

export interface RuleResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function rules(c: DesignConfig): RuleResult[] {
  const out: RuleResult[] = [];
  const rule = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const ns = c.nSeries;
  const vfull = ns * CELL.vMax;
  const vmin = ns * c.swUv;

  rule(
    "Charger CV voltage equals 4 × 4.20 V",
    Math.abs(c.chargerV - vfull) <= 0.01 * vfull,
    `charger ${c.chargerV} V vs required ${vfull.toFixed(1)} V`,
  );
  rule(
    "Charger current within cell maximum charge current",
    c.chargerA <= CELL.iChargeMax,
    `${c.chargerA} A per cell (4S1P) vs max ${CELL.iChargeMax} A`,
  );
  rule(
    "Charger current below fuse rating with 25 % margin",
    c.chargerA * 1.25 <= c.fuseA,
    `${c.chargerA} A × 1.25 vs fuse ${c.fuseA} A`,
  );
  rule(
    "Fuse at or below 18 AWG wiring, the most conservative cell limit and BMS limits",
    c.fuseA <= Math.min(AWG18_CHASSIS_A, CELL.iDisMaxConservative, BMS.ocTripA),
    `fuse ${c.fuseA} A`,
  );

  const k = c.divider[1] / (c.divider[0] + c.divider[1]);
  const vadc = vfull * k;
  rule(
    "Top tap stays below ADS1115 VDD and FSR",
    vadc < ADS1115.vdd && vadc < ADS1115.fsr,
    `${vadc.toFixed(2)} V at ADC`,
  );

  const iFault = (vfull - ADS1115.vdd - 0.3) / (c.divider[0] + c.rSeries);
  rule(
    "Fault current into ADC pin (bottom resistor open) under 10 mA without external clamps",
    iFault < ADS1115.iInMax,
    `${(iFault * 1e6).toFixed(1)} µA`,
  );

  const rSrc = (c.divider[0] * c.divider[1]) / (c.divider[0] + c.divider[1]) + c.rSeries;
  const leak = c.schottkyClamps ? 10e-9 : 0.0;
  rule(
    "No clamp-diode leakage error (≤ 1 mV at the cell)",
    (leak * rSrc) / k <= 1e-3,
    leak ? `${(((leak * rSrc) / k) * 1e3).toFixed(1)} mV at 10 nA leakage` : "external clamps removed",
  );
  rule(
    "Per-channel ADC calibration planned (loading gain error is ~2.9 %)",
    c.calibrateAdc,
    `source ${(rSrc / 1e3).toFixed(1)} kΩ vs ${(ADS1115.zinCm / 1e6).toFixed(0)} MΩ → ${((rSrc / (rSrc + ADS1115.zinCm)) * 100).toFixed(2)} %`,
  );

  const op = c.opamp;
  rule(
    "Op-amp input range reaches 0 V on a single supply",
    op.vicrAboveVneg <= 0.0,
    `${op.name} input needs ≥ V− + ${op.vicrAboveVneg} V; sense voltage is 0–0.13 V`,
  );
  const voh = c.opampSupply - (op.vohDrop ?? 1.5);
  rule(
    "Op-amp output can drive the gate",
    voh >= IRLZ44N.vgsNeeded + 0.2,
    `Voh ≈ ${voh.toFixed(1)} V`,
  );
  rule("Op-amp supply within rating", c.opampSupply <= op.vsupMax, `${c.opampSupply} V`);

  const div = c.dacDivider ? c.dacDivider[1] / (c.dacDivider[0] + c.dacDivider[1]) : 1.0;
  const lsbA = ((c.dacVref / 4096) * div) / c.rSense;
  const fsA = (c.dacVref * div) / c.rSense;
  rule("Load setpoint resolution ≤ 1 mA", lsbA <= 1e-3, `${(lsbA * 1e3).toFixed(2)} mA per DAC step`);

  const cap = c.iCap ?? fsA;
  rule(
    "Firmware current cap defined and ≤ DAC full scale",
    c.iCap !== null && cap <= fsA,
    `cap ${cap.toFixed(2)} A, DAC full scale ${fsA.toFixed(2)} A`,
  );
  rule(
    "Standard test current reachable at end of discharge",
    vmin / (c.rLoad + c.rSense + 0.025) >= c.testCurrentA,
    `ceiling at ${vmin.toFixed(0)} V = ${(vmin / (c.rLoad + c.rSense + 0.025)).toFixed(2)} A vs test ${c.testCurrentA} A`,
  );

  const pFet = vfull ** 2 / (4 * (c.rLoad + c.rSense));
  const rcs = c.sharedHeatsink ? RTH_CS_INSULATED : IRLZ44N.rthCsGrease;
  const rhs = HEATSINKS[c.heatsink];
  if (rhs === undefined) {
    throw new Error(`Unknown heatsink: ${c.heatsink}`);
  }
  if (rhs === null) {
    const tcut = c.heatsinkCutoffC;
    const tj = (tcut ?? 1e9) + pFet * (IRLZ44N.rthJc + rcs);
    rule(
      "MOSFET junction ≤ 125 °C at worst-case dissipation",
      tcut !== undefined && tj <= 125,
      `${pFet.toFixed(2)} W; heatsink cut-off ${tcut} °C → Tj ≤ ${tj.toFixed(0)} °C (heatsink Rth measured in T6)`,
    );
    rule(
      "Heatsink temperature sensor present for the cut-off",
      c.heatsinkSensor ?? false,
      "spare DS18B20 bonded to the heatsink",
    );
  } else {
    const tj = c.tAmb + pFet * (IRLZ44N.rthJc + rcs + rhs);
    rule(
      "MOSFET junction ≤ 125 °C at worst-case dissipation",
      tj <= 125,
      `${pFet.toFixed(2)} W → Tj ${tj.toFixed(0)} °C with ${c.heatsink}`,
    );
  }

  const pRes = Math.min(cap, vfull / (c.rLoad + c.rSense)) ** 2 * c.rLoad;
  rule(
    "Power resistor mounted on a monitored heatsink (50 W rating assumes one)",
    c.resistorMountedOnHeatsink,
    `${pRes.toFixed(1)} W at the current cap`,
  );

  const pSense = Math.min(cap, 1.7) ** 2 * c.rSense;
  rule(
    "Sense resistor rated ≥ 2 × its dissipation",
    c.rSenseRatingW !== null && c.rSenseRatingW >= 2 * pSense,
    `${pSense.toFixed(3)} W dissipated, rating ${c.rSenseRatingW} W`,
  );

  rule(
    "INA226 full scale covers charger and load currents",
    INA226.vshuntFs / 0.01 >= Math.max(c.chargerA, cap) * 1.5,
    "8.19 A full scale",
  );

  const ovMin = BMS.ovDetect - BMS.ovTol;
  const uvMax = BMS.uvDetect + BMS.uvTol;
  rule(
    "Software over-voltage trips before the BMS board",
    c.swOv < ovMin,
    `${c.swOv} V vs BMS minimum ${ovMin.toFixed(2)} V`,
  );
  rule(
    "Software under-voltage trips before the BMS board",
    c.swUv > uvMax,
    `${c.swUv} V vs BMS maximum ${uvMax.toFixed(2)} V`,
  );
  rule(
    "Software under-voltage at or above the cell cut-off",
    c.swUv >= CELL.vCutoff,
    `${c.swUv} V vs ${CELL.vCutoff} V`,
  );
  rule(
    "Load current cap within the most conservative cell discharge limit",
    cap <= CELL.iDisMaxConservative,
    `${cap.toFixed(2)} A vs ${CELL.iDisMaxConservative} A`,
  );
  rule(
    "Pi can stop charging (charge-enable relay)",
    c.chargeRelay,
    "needed because the BMS board is the only other switch",
  );

  const addrs = Object.values(c.i2c);
  rule(
    "I²C addresses unique",
    new Set(addrs).size === addrs.length,
    Object.entries(c.i2c)
      .map(([name, addr]) => `${name} 0x${addr.toString(16).toUpperCase().padStart(2, "0")}`)
      .join(", "),
  );
  rule(
    "DS18B20 12-bit conversion fits the sample period",
    0.75 <= c.ds18b20PeriodS,
    `750 ms vs ${c.ds18b20PeriodS} s`,
  );

  return out;
}

export interface ValidationRun {
  name: string;
  results: RuleResult[];
  passCount: number;
  totalCount: number;
  allPass: boolean;
}

export function run(name: string, cfg: DesignConfig): ValidationRun {
  const results = rules(cfg);
  const passCount = results.filter((r) => r.ok).length;
  return { name, results, passCount, totalCount: results.length, allPass: passCount === results.length };
}

export interface DesignValidation {
  v0: ValidationRun;
  v1: ValidationRun;
  ok: boolean;
}

/** Mirrors `validate_design.py`'s exit code: valid only when v1 passes every rule. */
export function validateDesign(): DesignValidation {
  const v0 = run("v0, bill of materials as first proposed", BASE);
  const v1 = run("v1, corrected budget design (this handoff)", V1);
  return { v0, v1, ok: v1.allPass };
}
