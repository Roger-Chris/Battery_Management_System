/**
 * Provisional CC/CV charge preview using the same pack, equivalent-circuit, sensor and
 * two-node thermal models as the discharge simulator. The charge cut-off is a latched
 * software relay command for this demo; no physical charger or battery is connected.
 */
import { BOM } from "../config/bom";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import type { CellProfile } from "../config/cellProfile";
import { cellVoltages, initialPackState, stepPack } from "../cell/pack";
import { stepThermal, type ThermalState } from "../cell/thermal";
import { defaultSpread } from "../cell/spread";
import { sensorSnapshot, type DischargeSample } from "./runDischarge";
import { fixedStepSchedule } from "./scheduler";
import { evaluateProtection } from "../firmware/protection";
import { chargeRelayCommand, commandedChargeCurrentA } from "../firmware/chargeControl";
import { CHARGER_MAX_CURRENT_A, CHARGER_SETPOINT_V, clampChargeCurrentA, isConstantVoltagePhase } from "../hardware/charger";
import { initialBmsState, stepBmsMonitor } from "../hardware/bmsBoard";
import { codeToTemperature, temperatureToCode } from "../hardware/ds18b20";

export type ChargerPhase = "cc" | "cv" | "cutoff";
export type ChargeCutoffReason = "cell temperature limit" | "cell over-voltage" | "charge complete" | "BMS over-voltage";

export interface ChargeSimulationSample extends DischargeSample {
  mode: "charge";
  charge_current_a: number;
  charge_relay_closed: boolean;
  charger_phase: ChargerPhase;
  charge_cutoff_reason: ChargeCutoffReason | null;
  cell_core_temp_c: number;
}

export interface ChargeSimulationResult {
  testId: string;
  durationS: number;
  samplePeriodS: number;
  sampleCount: number;
  samples: ChargeSimulationSample[];
  warnings: string[];
}

export interface ChargeSimulationSettings {
  testId: string;
  durationS: number;
  initialSoc: number;
  initialCellTempC: number;
  ambientC: number;
  requestedCurrentA?: number;
  profile?: CellProfile;
}

export function runChargeSimulation(settings: ChargeSimulationSettings): ChargeSimulationResult {
  const profile = settings.profile ?? DMEGC_INR18650_26E;
  const durationS = settings.durationS;
  const initialSoc = settings.initialSoc;
  const ambientC = settings.ambientC;
  const requestedCurrentA = Math.min(settings.requestedCurrentA ?? CHARGER_MAX_CURRENT_A, CHARGER_MAX_CURRENT_A);
  const initialCellTempC = settings.initialCellTempC;
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error("Simulation duration must be greater than zero.");
  if (!Number.isFinite(initialSoc) || initialSoc < 0 || initialSoc > 1) throw new Error("Initial SOC must be between 0 and 1.");
  if (!Number.isFinite(initialCellTempC) || !Number.isFinite(ambientC)) throw new Error("Temperatures must be finite.");
  if (!Number.isFinite(requestedCurrentA) || requestedCurrentA < 0) throw new Error("Charge current must be zero or greater.");

  const adsRate = BOM.ads1115.dataRateSps.value;
  const dtS = 1 / adsRate;
  const tracePeriodS = BOM.simulation.tracePeriodS.value;
  const schedule = fixedStepSchedule(dtS, durationS, {
    ads1115_scan: 2 / adsRate,
    ina226: ((BOM.ina226.shuntConversionMs.value + BOM.ina226.busConversionMs.value) * BOM.ina226.averageCount.value) / 1000,
    ds18b20: 0.75,
    trace: tracePeriodS,
  });

  let state = initialPackState(profile, initialSoc, BOM.cell.seriesCount.value);
  let thermal: ThermalState[] = Array.from({ length: state.cells.length }, () => ({ coreC: initialCellTempC, surfC: initialCellTempC }));
  const spread = defaultSpread(state.cells.length);
  let coulombSoc = initialSoc;
  let bms = initialBmsState();
  let cutoffReason: ChargeCutoffReason | null = null;
  let latest: ChargeSimulationSample | undefined;
  const samples: ChargeSimulationSample[] = [];
  const cellResistanceOhm = profile.fields.r0_ohm.value + profile.fields.rc_pairs.value.reduce((sum, branch) => sum + branch.R_ohm, 0);
  const packResistanceOhm = state.cells.length * cellResistanceOhm;

  for (const tick of schedule) {
    const openCellV = cellVoltages(state, 0, profile);
    const openPackV = openCellV.reduce((sum, value) => sum + value, 0);
    const currentAtVoltageLimit = Math.max(0, (CHARGER_SETPOINT_V - openPackV) / packResistanceOhm);
    const cvActive = currentAtVoltageLimit < requestedCurrentA || isConstantVoltagePhase(openPackV, CHARGER_SETPOINT_V);
    const proposedCurrentA = cvActive
      ? Math.min(requestedCurrentA, currentAtVoltageLimit)
      : requestedCurrentA;
    const proposedCellV = cellVoltages(state, -proposedCurrentA, profile);
    const hottestCellC = Math.max(...thermal.map((cell) => cell.surfC));
    const measuredCellTempC = codeToTemperature(temperatureToCode(hottestCellC), 12);
    const proposedProtection = evaluateProtection({
      cellVoltagesV: proposedCellV,
      loadCurrentA: 0,
      heatsinkC: ambientC,
      cellTempC: measuredCellTempC,
    });

    if (cutoffReason === null && proposedProtection.chargeOverTemp) cutoffReason = "cell temperature limit";
    if (cutoffReason === null && proposedProtection.overVoltage) cutoffReason = "cell over-voltage";
    if (cutoffReason === null && bms.state === "ov_trip") cutoffReason = "BMS over-voltage";
    if (cutoffReason === null && cvActive && proposedCurrentA <= profile.fields.charge_end_current_A.value) cutoffReason = "charge complete";

    const relayClosed = chargeRelayCommand(cutoffReason === null).closed;
    const chargeCurrentA = relayClosed
      ? commandedChargeCurrentA(true, clampChargeCurrentA(proposedCurrentA))
      : 0;
    const loadedCellV = cellVoltages(state, -chargeCurrentA, profile);
    bms = stepBmsMonitor(bms, loadedCellV, dtS);
    if (bms.state === "ov_trip" && cutoffReason === null) cutoffReason = "BMS over-voltage";

    const sampleAtTick = sensorSnapshot(
      state,
      -chargeCurrentA,
      thermal,
      ambientC,
      state.cells.reduce((sum, cell) => sum + cell.socFraction, 0) / state.cells.length,
      coulombSoc,
      settings.testId,
      0,
      bms.state,
      false,
      profile,
    );
    const phase: ChargerPhase = cutoffReason ? "cutoff" : cvActive ? "cv" : "cc";
    latest = {
      ...sampleAtTick,
      timestamp_s: tick.tS,
      test_id: settings.testId,
      requested_current_a: chargeCurrentA,
      mode: "charge",
      charge_current_a: chargeCurrentA,
      charge_relay_closed: relayClosed,
      charger_phase: phase,
      charge_cutoff_reason: cutoffReason,
      cell_core_temp_c: thermal[1]!.coreC,
      bms_state: bms.state,
    };
    if (tick.dueSensors.includes("trace")) samples.push(latest);

    state = stepPack(state, -chargeCurrentA, dtS, profile, spread);
    state.cells = state.cells.map((cell) => ({ ...cell, socFraction: Math.min(1, cell.socFraction) }));
    const chargeHeatW = chargeCurrentA ** 2 * cellResistanceOhm;
    thermal = thermal.map((cell) => stepThermal(cell, chargeHeatW, ambientC, dtS, profile));
    coulombSoc = Math.min(1, coulombSoc + (chargeCurrentA * dtS) / (profile.fields.capacity_nominal_Ah.value * 3600));
  }

  return {
    testId: settings.testId,
    durationS,
    samplePeriodS: tracePeriodS,
    sampleCount: samples.length,
    samples,
    warnings: [
      "Cell resistance, RC polarization and thermal response are provisional placeholders awaiting T9/T12 measurements.",
      "The temperature safety stop uses the configured 45 °C charge limit and latches the demo relay open after a cutoff event.",
      "This is a software model preview; it does not control or validate a physical charger, relay, or battery.",
    ],
  };
}

