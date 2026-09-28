/**
 * Typed bill-of-materials constants with provenance, ported from `tools/hw_calc.py`.
 * Single source of truth for values consumed by `hwCalc.ts`. See docs/HARDWARE_SPEC.md
 * for the underlying bill of materials and net list these figures describe.
 */
import type { Parameter } from "./provenance";

export const BOM = {
  divider: {
    rTop: {
      value: 1.0e6,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #3: 1 MΩ, 0.1%, divider ladder top leg",
    } satisfies Parameter<number>,
    rBot: {
      value: 200e3,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #3: 200 kΩ, 0.1%, divider ladder bottom leg",
    } satisfies Parameter<number>,
    rSeries: {
      value: 10e3,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #4: 10 kΩ series resistor into each ADC input",
    } satisfies Parameter<number>,
    rTolerance: {
      value: 0.001,
      unit: "fraction",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #3: 0.1% tolerance resistors",
    } satisfies Parameter<number>,
  },
  ads1115: {
    fsr: {
      value: 4.096,
      unit: "V",
      source: "datasheet",
      ref: "TI SBAS444 (ADS1115), PGA ±4.096 V setting; 16-bit signed → 32768 counts per FSR",
    } satisfies Parameter<number>,
    zinCommonMode: {
      value: 6.0e6,
      unit: "ohm",
      source: "datasheet",
      ref: "TI SBAS444: 6 MΩ common-mode input impedance at FSR ±4.096 V (single-ended use)",
    } satisfies Parameter<number>,
    dataRateSps: {
      value: 128,
      unit: "samples/s",
      source: "datasheet",
      ref: "TI SBAS444E, ADS1115 power-on default data rate is 128 SPS; verify the Pi firmware/module configuration before treating it as the physical rig setting",
      verify: true,
    } satisfies Parameter<number>,
  },
  diodeLeakageCases: {
    value: [
      { nA: 1, A: 1e-9 },
      { nA: 10, A: 10e-9 },
      { nA: 100, A: 100e-9 },
    ],
    unit: "A",
    source: "literature",
    ref: "Generic Schottky clamp-diode leakage current assumptions used to justify removing external clamp diodes (docs/HARDWARE_SPEC.md design decision #3)",
  } satisfies Parameter<Array<{ nA: number; A: number }>>,
  cell: {
    vChargeMax: {
      value: 4.2,
      unit: "V",
      source: "datasheet",
      ref: "DMEGC INR18650-26E charge voltage 4.20 V ± 50 mV; see data/cell_profiles/dmegc_inr18650_26e.json voltage_charge_V",
    } satisfies Parameter<number>,
    seriesCount: {
      value: 4,
      unit: "count",
      source: "derived",
      ref: "docs/HARDWARE_SPEC.md: 4S1P pack design",
    } satisfies Parameter<number>,
  },
  ina226: {
    rShunt: {
      value: 0.01,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #5: INA226 module with 0.01 Ω shunt",
    } satisfies Parameter<number>,
    vShuntFullScale: {
      value: 0.08192,
      unit: "V",
      source: "datasheet",
      ref: "TI SBOS547 (INA226) shunt input full scale",
    } satisfies Parameter<number>,
    vShuntLsb: {
      value: 2.5e-6,
      unit: "V",
      source: "datasheet",
      ref: "TI SBOS547 (INA226) shunt voltage LSB",
    } satisfies Parameter<number>,
    vBusLsb: {
      value: 1.25e-3,
      unit: "V",
      source: "datasheet",
      ref: "TI SBOS547 (INA226) bus voltage LSB",
    } satisfies Parameter<number>,
    currentLsb: {
      value: 0.25e-3,
      unit: "A",
      source: "derived",
      ref: "Design choice: current LSB selected for the calibration register (tools/hw_calc.py)",
    } satisfies Parameter<number>,
    averageCount: {
      value: 1,
      unit: "samples",
      source: "datasheet",
      ref: "TI SBOS547C, INA226 configuration-register power-on default is one averaged sample; verify the Pi firmware/module configuration",
      verify: true,
    } satisfies Parameter<number>,
    shuntConversionMs: {
      value: 1.1,
      unit: "ms",
      source: "datasheet",
      ref: "TI SBOS547C, INA226 VSHCT power-on default is 1.1 ms; verify the Pi firmware/module configuration",
      verify: true,
    } satisfies Parameter<number>,
    busConversionMs: {
      value: 1.1,
      unit: "ms",
      source: "datasheet",
      ref: "TI SBOS547C, INA226 VBUSCT power-on default is 1.1 ms; verify the Pi firmware/module configuration",
      verify: true,
    } satisfies Parameter<number>,
  },
  fuse: {
    meltingI2t: {
      value: 26,
      unit: "A²·s",
      source: "datasheet",
      ref: "Littelfuse ATOF 287 replacement for obsolete ATO 257, 5 A part 0287005: typical I²t 26 A²·s before arcing, averaged from breaking-capacity tests; this is not guaranteed total clearing I²t and the installed fuse must be identified",
      verify: true,
    } satisfies Parameter<number>,
  },
  simulation: {
    demoDurationS: {
      value: 300,
      unit: "s",
      source: "assumed",
      ref: "Five-minute interactive demo duration chosen for responsive browser previews; it is not a bench-test duration and can be changed by the caller",
    } satisfies Parameter<number>,
    dischargeCurrentA: {
      value: 1.0,
      unit: "A",
      source: "derived",
      ref: "docs/TEST_PLAN_EXPECTED_VS_MEASURED.md T7 and T9 use 1.0 A discharge/pulse current; simulator load is still bounded by its 1.25 A firmware cap",
    } satisfies Parameter<number>,
    initialSoc: {
      value: 1.0,
      unit: "fraction",
      source: "derived",
      ref: "docs/TEST_PLAN_EXPECTED_VS_MEASURED.md T7 starts at 4.20 V/cell; the provisional OCV profile maps its full-charge endpoint to SOC 1.0",
    } satisfies Parameter<number>,
    tracePeriodS: {
      value: 1.0,
      unit: "s",
      source: "derived",
      ref: "docs/HARDWARE_SPEC.md and validate_design.ts: DS18B20 sampling period is 1 s; used as the demo CSV output cadence",
    } satisfies Parameter<number>,
  },
  load: {
    dacVref: {
      value: 3.3,
      unit: "V",
      source: "derived",
      ref: "MCP4725 supplied from the Raspberry Pi 3.3 V rail",
    } satisfies Parameter<number>,
    dacDividerTop: {
      value: 9.1e3,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #F: 9.1 kΩ DAC output divider (design decision #5)",
    } satisfies Parameter<number>,
    dacDividerBottom: {
      value: 1.0e3,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #F: 1.0 kΩ DAC output divider (design decision #5)",
    } satisfies Parameter<number>,
    dacBits: {
      value: 12,
      unit: "bit",
      source: "datasheet",
      ref: "Microchip DS22039 (MCP4725) 12-bit DAC",
    } satisfies Parameter<number>,
    firmwareCapA: {
      value: 1.25,
      unit: "A",
      source: "derived",
      ref: "docs/HARDWARE_SPEC.md design decision #7: 1.25 A firmware load cap (0.5C)",
    } satisfies Parameter<number>,
    rSense: {
      value: 0.1,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #12: 0.1 Ω load current sense resistor",
    } satisfies Parameter<number>,
    rLoad: {
      value: 10.0,
      unit: "ohm",
      source: "listing",
      ref: "docs/HARDWARE_SPEC.md BOM #12b: user's own 10 Ω 50 W power resistor",
    } satisfies Parameter<number>,
  },
  irlz44n: {
    rdsOn: {
      value: 0.025,
      unit: "ohm",
      source: "datasheet",
      ref: "Infineon IRLZ44N at Vgs = 5 V",
      verify: true,
    } satisfies Parameter<number>,
    rthJc: {
      value: 1.4,
      unit: "K/W",
      source: "datasheet",
      ref: "Infineon IRLZ44N junction-to-case thermal resistance",
      verify: true,
    } satisfies Parameter<number>,
    rthCsGreased: {
      value: 0.5,
      unit: "K/W",
      source: "datasheet",
      ref: "Infineon IRLZ44N junction-to-case, flat greased surface",
      verify: true,
    } satisfies Parameter<number>,
  },
  heatsink: {
    rthDatasheetUpgrade: {
      value: 2.6,
      unit: "K/W",
      source: "datasheet",
      ref: "Optional Boyd/Aavid 530002B02500G heatsink (docs/HARDWARE_SPEC.md optional datasheet upgrade, not fitted in the budget build)",
    } satisfies Parameter<number>,
    cutoffC: {
      value: 80.0,
      unit: "degC",
      source: "derived",
      ref: "docs/HARDWARE_SPEC.md design decision #6: firmware cut-off on the shared heatsink DS18B20",
    } satisfies Parameter<number>,
    rthCsInsulatedPad: {
      value: 1.5,
      unit: "K/W",
      source: "assumed",
      ref: "Silicone/mica insulating pad estimate; the MOSFET shares the heatsink with the resistor (tools/hw_calc.py; VERIFY pad data)",
      verify: true,
    } satisfies Parameter<number>,
  },
  thermalDesign: {
    mosfetTjTarget: {
      value: 125.0,
      unit: "degC",
      source: "derived",
      ref: "Design target, below the IRLZ44N absolute maximum junction temperature",
    } satisfies Parameter<number>,
    ambientC: {
      value: 35.0,
      unit: "degC",
      source: "assumed",
      ref: "Lab ambient temperature assumption (tools/hw_calc.py)",
    } satisfies Parameter<number>,
  },
  ds18b20: {
    accuracyC: {
      value: 0.5,
      unit: "degC",
      source: "datasheet",
      ref: "Analog Devices (Maxim) DS18B20, -10 to +85 °C",
    } satisfies Parameter<number>,
    accuracyRange: {
      value: "-10 to +85 C",
      unit: "degC",
      source: "datasheet",
      ref: "Analog Devices (Maxim) DS18B20",
    } satisfies Parameter<string>,
    resolutionC: {
      value: { "9": 0.5, "10": 0.25, "11": 0.125, "12": 0.0625 } as Record<string, number>,
      unit: "degC",
      source: "datasheet",
      ref: "Analog Devices (Maxim) DS18B20 resolution by configured bit depth",
    } satisfies Parameter<Record<string, number>>,
    conversionMs: {
      value: { "9": 93.75, "10": 187.5, "11": 375, "12": 750 } as Record<string, number>,
      unit: "ms",
      source: "datasheet",
      ref: "Analog Devices (Maxim) DS18B20 conversion time by configured bit depth",
    } satisfies Parameter<Record<string, number>>,
  },
} as const;
