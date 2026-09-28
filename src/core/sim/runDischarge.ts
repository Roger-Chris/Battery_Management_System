/**
 * Connected 4S discharge demo: pack/cell plant -> electronic load -> divider/ADS1115 and
 * INA226 measurements -> DS18B20 quantization -> software/BMS UV protection -> coulomb count.
 * It deliberately does not simulate the heatsink/probe transient, charge path, fuse transient,
 * or EKF until their missing parameters/independent measurement input are available.
 */
import { BOM } from "../config/bom";
import { DMEGC_INR18650_26E, isCellProfileProvisional } from "../config/cellProfile";
import { isProvisional, type Parameter } from "../config/provenance";
import { cellVoltages, initialPackState, stepPack, tapVoltages } from "../cell/pack";
import { ocvWithBand } from "../cell/ocv";
import { initialThermalState, stepThermal, type ThermalState } from "../cell/thermal";
import { defaultSpread } from "../cell/spread";
import { codeToTemperature, conversionTimeMs, temperatureToCode } from "../hardware/ds18b20";
import { dividerOutputVoltage } from "../hardware/divider";
import { busVoltageRegister, currentFromRegister, currentRegister } from "../hardware/ina226";
import { commandedCurrentA, dacLsbA, loadState } from "../hardware/load";
import { codeToVoltage, voltageToCode } from "../hardware/ads1115";
import { initialBmsState, stepBmsMonitor, type BmsTripState } from "../hardware/bmsBoard";
import { fixedStepSchedule } from "./scheduler";
import { tapsToCellVoltages } from "../firmware/tapToCell";
import { coulombCountStep } from "../firmware/coulombCounting";
import { SW_UV_V } from "../firmware/protection";
import { checkCellImbalance } from "../firmware/anomalyChecks";

export interface DischargeSimulationSettings {
  /** Test label written to the bench-log-compatible output. */
  testId: string;
  durationS: Parameter<number>;
  initialSoc: Parameter<number>;
  dischargeCurrentA: Parameter<number>;
  ambientC: Parameter<number>;
  profile?: typeof DMEGC_INR18650_26E;
}

export interface DischargeSample {
  timestamp_s: number;
  test_id: string;
  dac_code: number;
  requested_current_a: number;
  ina1_current_a: number;
  ina1_bus_v: number;
  ina2_current_a: number;
  ina2_bus_v: number;
  adc_codes: [number, number, number, number];
  tap_v: [number, number, number, number];
  cell_v: [number, number, number, number];
  cell_v_low: [number, number, number, number];
  cell_v_high: [number, number, number, number];
  cell_temp_c: number;
  ambient_c: number;
  true_soc: number;
  coulomb_soc: number;
  bms_state: BmsTripState;
  software_uv_trip: boolean;
  cell_imbalance_anomaly: boolean;
}

export interface DischargeSimulationResult {
  testId: string;
  durationS: number;
  samplePeriodS: number;
  sampleCount: number;
  samples: DischargeSample[];
  profileProvisional: boolean;
  warnings: string[];
}

const zeroThermal = (ambientC: number, count: number): ThermalState[] => Array.from({ length: count }, () => initialThermalState(ambientC));

function sensorSnapshot(
  state: ReturnType<typeof initialPackState>,
  currentA: number,
  thermal: ThermalState[],
  ambientC: number,
  soc: number,
  coulombSoc: number,
  testId: string,
  requestedA: number,
  bmsState: BmsTripState,
  uvTrip: boolean,
  profile: NonNullable<DischargeSimulationSettings["profile"]>,
): DischargeSample {
  const taps = tapVoltages(state, currentA, profile);
  const adcCodes = taps.map((tap) => voltageToCode(dividerOutputVoltage(tap).loadedV)) as [number, number, number, number];
  const adcPinV = adcCodes.map((code) => codeToVoltage(code));
  const tapScale = dividerOutputVoltage(1).loadedV;
  const measuredTaps = adcPinV.map((volts) => volts / tapScale) as [number, number, number, number];
  const measuredCells = tapsToCellVoltages(measuredTaps) as [number, number, number, number];
  const cellLow = state.cells.map((cell) => {
    const ocv = ocvWithBand(cell.socFraction, profile);
    const polarization = cell.circuit.rc.reduce((sum, branch) => sum + branch.vV, 0);
    return ocv.lowV - currentA * profile.fields.r0_ohm.value - polarization;
  }) as [number, number, number, number];
  const cellHigh = state.cells.map((cell) => {
    const ocv = ocvWithBand(cell.socFraction, profile);
    const polarization = cell.circuit.rc.reduce((sum, branch) => sum + branch.vV, 0);
    return ocv.highV - currentA * profile.fields.r0_ohm.value - polarization;
  }) as [number, number, number, number];
  const cellTemp = codeToTemperature(temperatureToCode(thermal[1]!.surfC), 12);
  const currentReg = currentRegister(currentA);
  const measuredCurrent = currentFromRegister(currentReg);
  const busVoltage = busVoltageRegister(taps[taps.length - 1]!) * BOM.ina226.vBusLsb.value;
  return {
    timestamp_s: 0,
    test_id: testId,
    dac_code: currentA === 0 ? 0 : Math.min(2 ** BOM.load.dacBits.value - 1, Math.round(requestedA / dacLsbA())),
    requested_current_a: requestedA,
    ina1_current_a: measuredCurrent,
    ina1_bus_v: busVoltage,
    ina2_current_a: measuredCurrent,
    ina2_bus_v: busVoltage,
    adc_codes: adcCodes,
    tap_v: measuredTaps,
    cell_v: measuredCells,
    cell_v_low: cellLow,
    cell_v_high: cellHigh,
    cell_temp_c: cellTemp,
    ambient_c: codeToTemperature(temperatureToCode(ambientC), 12),
    true_soc: soc,
    coulomb_soc: coulombSoc,
    bms_state: bmsState,
    software_uv_trip: uvTrip,
    cell_imbalance_anomaly: checkCellImbalance(measuredCells),
  };
}

function currentAt(settings: DischargeSimulationSettings): number {
  return settings.dischargeCurrentA.value;
}

export function runDischargeSimulation(settings: DischargeSimulationSettings): DischargeSimulationResult {
  const profile = settings.profile ?? DMEGC_INR18650_26E;
  const durationS = settings.durationS.value;
  const initialSoc = settings.initialSoc.value;
  const requestedA = currentAt(settings);
  const ambientC = settings.ambientC.value;
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error("Simulation duration must be greater than zero.");
  if (!Number.isFinite(initialSoc) || initialSoc < 0 || initialSoc > 1) throw new Error("Initial SOC must be between 0 and 1.");
  if (!Number.isFinite(requestedA) || requestedA < 0) throw new Error("Discharge current must be zero or greater.");
  if (!Number.isFinite(ambientC)) throw new Error("Ambient temperature must be finite.");

  const profileIsProvisional = isCellProfileProvisional(profile);
  const adsRate = BOM.ads1115.dataRateSps.value;
  const dtS = 1 / adsRate;
  const tracePeriodS = BOM.simulation.tracePeriodS.value;
  const inaPeriodS = ((BOM.ina226.shuntConversionMs.value + BOM.ina226.busConversionMs.value) * BOM.ina226.averageCount.value) / 1000;
  const dsPeriodS = conversionTimeMs(12) / 1000;
  const schedule = fixedStepSchedule(dtS, durationS, {
    ads1115_scan: 2 / adsRate,
    ina226: inaPeriodS,
    ds18b20: dsPeriodS,
    trace: tracePeriodS,
  });

  let state = initialPackState(profile, initialSoc, BOM.cell.seriesCount.value);
  let thermal = zeroThermal(ambientC, state.cells.length);
  const spread = defaultSpread(state.cells.length);
  let coulombSoc = initialSoc;
  let bms = initialBmsState();
  let measuredCurrentA = 0;
  let lastSample = sensorSnapshot(state, 0, thermal, ambientC, initialSoc, coulombSoc, settings.testId, requestedA, bms.state, false, profile);
  const samples: DischargeSample[] = [];
  const cellResistanceOhm = profile.fields.r0_ohm.value + profile.fields.rc_pairs.value.reduce((sum, branch) => sum + branch.R_ohm, 0);

  for (const tick of schedule) {
    const preLoadCellV = cellVoltages(state, measuredCurrentA, profile);
    const preLoadPackV = preLoadCellV.reduce((sum, value) => sum + value, 0);
    const maxCode = 2 ** BOM.load.dacBits.value - 1;
    const dacCode = Math.min(maxCode, Math.round(requestedA / dacLsbA()));
    const desiredCurrent = commandedCurrentA(dacCode);
    let load = loadState(dacCode, preLoadPackV);
    let cellV = cellVoltages(state, load.currentA, profile);
    const uvTrip = cellV.some((voltage) => voltage <= SW_UV_V);
    if (uvTrip || bms.state !== "normal") {
      load = loadState(0, preLoadPackV);
      cellV = cellVoltages(state, 0, profile);
    }
    bms = stepBmsMonitor(bms, cellV, dtS);
    if (bms.state !== "normal") load = loadState(0, preLoadPackV);

    const instant = sensorSnapshot(state, load.currentA, thermal, ambientC, initialSoc, coulombSoc, settings.testId, desiredCurrent, bms.state, uvTrip, profile);
    if (tick.dueSensors.includes("ads1115_scan")) lastSample = { ...lastSample, adc_codes: instant.adc_codes, tap_v: instant.tap_v, cell_v: instant.cell_v, cell_v_low: instant.cell_v_low, cell_v_high: instant.cell_v_high };
    if (tick.dueSensors.includes("ina226")) lastSample = { ...lastSample, ina1_current_a: instant.ina1_current_a, ina1_bus_v: instant.ina1_bus_v, ina2_current_a: instant.ina2_current_a, ina2_bus_v: instant.ina2_bus_v };
    if (tick.dueSensors.includes("ds18b20")) lastSample = { ...lastSample, cell_temp_c: instant.cell_temp_c, ambient_c: instant.ambient_c };
    if (tick.dueSensors.includes("trace")) {
      const trueSoc = state.cells.reduce((sum, cell) => sum + cell.socFraction, 0) / state.cells.length;
      const output = { ...lastSample, timestamp_s: tick.tS, dac_code: load.currentA === 0 ? 0 : dacCode, requested_current_a: desiredCurrent, true_soc: trueSoc, coulomb_soc: coulombSoc, bms_state: bms.state, software_uv_trip: uvTrip };
      samples.push(output);
    }

    measuredCurrentA = load.currentA === 0 ? 0 : lastSample.ina1_current_a;
    coulombSoc = coulombCountStep(coulombSoc, measuredCurrentA, dtS, profile.fields.capacity_nominal_Ah.value);
    state = stepPack(state, load.currentA, dtS, profile, spread);
    thermal = thermal.map((cellThermal) => stepThermal(cellThermal, load.currentA ** 2 * cellResistanceOhm, ambientC, dtS, profile));
  }

  const warnings = [
    "Cell OCV, R0/RC and thermal profile are provisional; voltage bands are shown per cell.",
    "Temperature traces exclude waterproof probe lag; the probe time constant needs a bench step-response measurement.",
    "Heatsink temperature and its 80 °C protection cutoff are not simulated until T6 supplies the installed thermal response.",
    "This discharge run does not exercise charger/relay control, fuse transient behavior, or EKF correction.",
  ];
  if (!profileIsProvisional) warnings.shift();
  if (isProvisional(BOM.ads1115.dataRateSps) || isProvisional(BOM.ina226.averageCount)) warnings.push("ADS1115 and INA226 timing use datasheet power-on defaults; verify the Pi firmware configuration.");
  if (isProvisional(BOM.fuse.meltingI2t)) warnings.push("Fuse data uses a provisional Littelfuse 287 replacement candidate; verify the installed fuse marking before using a fuse-trip trace.");

  return { testId: settings.testId, durationS, samplePeriodS: tracePeriodS, sampleCount: samples.length, samples, profileProvisional: profileIsProvisional, warnings };
}

const BENCH_HEADERS = [
  "timestamp_s", "test_id", "dac_code", "i_cmd_a", "ina1_current_a", "ina1_bus_v", "ina2_current_a", "ina2_bus_v",
  "ads48_ch0_code", "ads48_ch1_code", "ads49_ch0_code", "ads49_ch1_code", "tap1_v", "tap2_v", "tap3_v", "tap4_v",
  "cell1_v", "cell2_v", "cell3_v", "cell4_v", "t_cell_c", "t_ambient_c", "t_spare_c", "dmm_ref_v", "dmm_ref_a",
  "bms_board_state", "charge_relay", "heatsink_t_c", "note", "cell1_v_low", "cell1_v_high", "cell2_v_low", "cell2_v_high",
  "cell3_v_low", "cell3_v_high", "cell4_v_low", "cell4_v_high",
];

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Bench template columns first, followed by model-only per-cell uncertainty limits. */
export function dischargeSimulationCsv(result: DischargeSimulationResult): string {
  const lines = [BENCH_HEADERS.join(",")];
  for (const sample of result.samples) {
    const values: Array<string | number> = [
      sample.timestamp_s, sample.test_id, sample.dac_code, sample.requested_current_a,
      sample.ina1_current_a, sample.ina1_bus_v, sample.ina2_current_a, sample.ina2_bus_v,
      sample.adc_codes[0], sample.adc_codes[1], sample.adc_codes[2], sample.adc_codes[3],
      sample.tap_v[0], sample.tap_v[1], sample.tap_v[2], sample.tap_v[3],
      sample.cell_v[0], sample.cell_v[1], sample.cell_v[2], sample.cell_v[3],
      sample.cell_temp_c, sample.ambient_c, "", "", "", sample.bms_state, "false", "",
      "model output; not a bench measurement", sample.cell_v_low[0], sample.cell_v_high[0], sample.cell_v_low[1], sample.cell_v_high[1],
      sample.cell_v_low[2], sample.cell_v_high[2], sample.cell_v_low[3], sample.cell_v_high[3],
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  return lines.join("\n");
}
