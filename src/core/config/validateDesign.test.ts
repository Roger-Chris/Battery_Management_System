import { describe, expect, it } from "vitest";
import { BASE, V1, rules, run, validateDesign } from "./validateDesign";

const RULE_NAMES = [
  "Charger CV voltage equals 4 × 4.20 V",
  "Charger current within cell maximum charge current",
  "Charger current below fuse rating with 25 % margin",
  "Fuse at or below 18 AWG wiring, the most conservative cell limit and BMS limits",
  "Top tap stays below ADS1115 VDD and FSR",
  "Fault current into ADC pin (bottom resistor open) under 10 mA without external clamps",
  "No clamp-diode leakage error (≤ 1 mV at the cell)",
  "Per-channel ADC calibration planned (loading gain error is ~2.9 %)",
  "Op-amp input range reaches 0 V on a single supply",
  "Op-amp output can drive the gate",
  "Op-amp supply within rating",
  "Load setpoint resolution ≤ 1 mA",
  "Firmware current cap defined and ≤ DAC full scale",
  "Standard test current reachable at end of discharge",
  "MOSFET junction ≤ 125 °C at worst-case dissipation",
  "Power resistor mounted on a monitored heatsink (50 W rating assumes one)",
  "Sense resistor rated ≥ 2 × its dissipation",
  "INA226 full scale covers charger and load currents",
  "Software over-voltage trips before the BMS board",
  "Software under-voltage trips before the BMS board",
  "Software under-voltage at or above the cell cut-off",
  "Load current cap within the most conservative cell discharge limit",
  "Pi can stop charging (charge-enable relay)",
  "I²C addresses unique",
  "DS18B20 12-bit conversion fits the sample period",
];

// v0 (BASE) has a fixed 20 °C/W clip-on heatsink, so it gets one Tj rule and no
// "heatsink temperature sensor" rule; v1 has the measured budget heatsink so it gets both.
const V0_RULE_NAMES = RULE_NAMES;
const V1_RULE_NAMES = [
  ...RULE_NAMES.slice(0, 15),
  "Heatsink temperature sensor present for the cut-off",
  ...RULE_NAMES.slice(15),
];

// Rules that fail for v0 (bill of materials as first proposed), per docs/validation_report.md.
const V0_EXPECTED_FAILURES = new Set([
  "Charger CV voltage equals 4 × 4.20 V",
  "Charger current within cell maximum charge current",
  "No clamp-diode leakage error (≤ 1 mV at the cell)",
  "Op-amp input range reaches 0 V on a single supply",
  "Op-amp output can drive the gate",
  "Load setpoint resolution ≤ 1 mA",
  "Firmware current cap defined and ≤ DAC full scale",
  "MOSFET junction ≤ 125 °C at worst-case dissipation",
  "Power resistor mounted on a monitored heatsink (50 W rating assumes one)",
  "Sense resistor rated ≥ 2 × its dissipation",
  "INA226 full scale covers charger and load currents",
  "Software over-voltage trips before the BMS board",
  "Load current cap within the most conservative cell discharge limit",
  "Pi can stop charging (charge-enable relay)",
]);

describe("validate_design.py rule mirror", () => {
  it("v0 (bill of materials as first proposed) mirrors every rule name and fails the documented 14/25", () => {
    const results = rules(BASE);
    expect(results.map((r) => r.name)).toEqual(V0_RULE_NAMES);
    for (const r of results) {
      expect(r.ok).toBe(!V0_EXPECTED_FAILURES.has(r.name));
    }
    const runResult = run("v0", BASE);
    expect(runResult.totalCount).toBe(25);
    expect(runResult.passCount).toBe(11);
    expect(runResult.allPass).toBe(false);
  });

  it("v1 (corrected budget design) mirrors every rule name and passes 26/26", () => {
    const results = rules(V1);
    expect(results.map((r) => r.name)).toEqual(V1_RULE_NAMES);
    for (const r of results) {
      expect(r.ok).toBe(true);
    }
    const runResult = run("v1", V1);
    expect(runResult.totalCount).toBe(26);
    expect(runResult.passCount).toBe(26);
    expect(runResult.allPass).toBe(true);
  });

  it("validateDesign() reports the handoff as valid only because v1 passes every rule", () => {
    const result = validateDesign();
    expect(result.v0.allPass).toBe(false);
    expect(result.v1.allPass).toBe(true);
    expect(result.ok).toBe(true);
  });
});
