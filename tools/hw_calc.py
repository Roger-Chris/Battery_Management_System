"""
Expected-value calculator for the 4S Samsung INR18650-25R bench rig (design v1, budget build, DMEGC INR18650-26E cells).
Every number the simulation and the paper quote about the hardware front end must be
reproducible from this script. Values tagged VERIFY must be checked against the datasheet
of the exact part you bought before they are quoted as fact.

Run:  python hw_calc.py            (prints the report)
      python hw_calc.py --json     (writes expected_values.json)
"""
import json, sys

# ---------------- bill of materials ----------------
R_TOP, R_BOT, R_SERIES = 1.0e6, 200e3, 10e3        # divider ladder (0.1 %), ADC series resistor
R_TOL = 0.001
ADS_FSR = 4.096                                     # ADS1115 PGA setting (V); 16-bit signed -> 32768 counts per FSR
ADS_ZIN_CANDIDATES = [6e6]                          # TI SBAS444: common-mode input impedance 6 MΩ at FSR ±4.096 V (single-ended use)
DIODE_LEAK_CASES = [1e-9, 10e-9, 100e-9]            # why external Schottky clamps were removed in v1
V_CELL_MAX = 4.2                                    # DMEGC INR18650-26E: charge voltage 4.20 V ± 50 mV
N_CELLS = 4

INA_RSHUNT = 0.01                                   # Ω
INA_VSHUNT_FS = 0.08192                             # V, INA226 shunt input full scale
INA_VSHUNT_LSB = 2.5e-6                             # V
INA_VBUS_LSB = 1.25e-3                              # V
INA_CURRENT_LSB = 0.25e-3                           # A (design choice)

DAC_VREF = 3.3                                      # MCP4725 supplied from the Pi 3.3 V rail
DAC_DIV = 1.0e3 / (9.1e3 + 1.0e3)                   # v1: 9.1 kΩ / 1.0 kΩ divider after the DAC
I_CAP = 1.25                                        # v1 firmware current cap (0.5C for 25R)
DAC_BITS = 12
R_SENSE = 0.1                                       # Ω
R_LOAD = 10.0                                       # Ω, 50 W power resistor
RDS_ON = 0.025                                      # Ω, IRLZ44N at Vgs = 5 V (Infineon, VERIFY)
MOSFET_RTH_JC = 1.4                                 # °C/W (VERIFY)
MOSFET_RTH_CS = 0.5                                 # °C/W flat greased surface (Infineon)
HEATSINK_RTH = 2.6                                  # optional Boyd/Aavid 530002B02500G (datasheet upgrade)
HEATSINK_CUTOFF_C = 80.0                            # budget build: firmware cut-off on the heatsink DS18B20
RTH_CS_INSULATED = 1.5                              # insulating pad, MOSFET shares heatsink with resistor (assumed)
MOSFET_TJ_TARGET = 125.0                            # °C design target, below absolute max
T_AMB = 35.0                                        # °C lab assumption

DS18B20 = {"accuracy_C": 0.5, "accuracy_range": "-10 to +85 C",
           "resolution_C": {"9": 0.5, "10": 0.25, "11": 0.125, "12": 0.0625},
           "conversion_ms": {"9": 93.75, "10": 187.5, "11": 375, "12": 750}}

def report():
    out = {}
    k = R_BOT / (R_TOP + R_BOT)
    r_src = R_TOP * R_BOT / (R_TOP + R_BOT) + R_SERIES
    taps = [V_CELL_MAX * (i + 1) for i in range(N_CELLS)]
    d = out["divider"] = {
        "ratio": k, "source_impedance_ohm": r_src,
        "tap_V_at_full_charge": taps, "adc_V_at_full_charge": [t * k for t in taps],
        "adc_lsb_V": ADS_FSR / 32768, "tap_referred_lsb_mV": ADS_FSR / 32768 / k * 1e3}
    k_hi = R_BOT * (1 + R_TOL) / (R_TOP * (1 - R_TOL) + R_BOT * (1 + R_TOL))
    e = k_hi / k - 1
    d["worst_ratio_error_pct"] = e * 100
    d["worst_tap_error_mV"] = [t * e * 1e3 for t in taps]
    # cell n = tap n - tap n-1; worst case when the two tap errors have opposite sign
    d["worst_cell_error_mV_uncalibrated"] = [(taps[i] + (taps[i - 1] if i else 0)) * e * 1e3 for i in range(N_CELLS)]
    d["loading_gain_error_pct"] = {f"Zin_{z/1e6:g}MOhm": r_src / (r_src + z) * 100 for z in ADS_ZIN_CANDIDATES}
    d["diode_leak_cell_referred_error_mV"] = {f"{i*1e9:g}nA": i * r_src / k * 1e3 for i in DIODE_LEAK_CASES}
    drains = [t / (R_TOP + R_BOT) for t in taps]
    d["divider_current_uA"] = [x * 1e6 for x in drains]
    d["current_through_cell_uA"] = [sum(drains[i:]) * 1e6 for i in range(N_CELLS)]
    d["cell1_vs_cell4_imbalance_mAh_per_day"] = (sum(drains) - drains[-1]) * 24 * 1e3

    out["ina226"] = {"full_scale_A": INA_VSHUNT_FS / INA_RSHUNT, "shunt_resolution_A": INA_VSHUNT_LSB / INA_RSHUNT,
                     "current_lsb_A": INA_CURRENT_LSB, "calibration_register": 0.00512 / (INA_CURRENT_LSB * INA_RSHUNT),
                     "bus_lsb_V": INA_VBUS_LSB, "shunt_W_at_5A": 25 * INA_RSHUNT}

    lsb = DAC_VREF / 2 ** DAC_BITS
    L = out["load"] = {"dac_lsb_V": lsb, "dac_lsb_A_without_divider": lsb / R_SENSE,
                       "dac_lsb_A": lsb * DAC_DIV / R_SENSE, "dac_full_scale_A": DAC_VREF * DAC_DIV / R_SENSE,
                       "firmware_cap_A": I_CAP, "resistor_W_at_cap": I_CAP ** 2 * R_LOAD, "sense_W_at_cap": I_CAP ** 2 * R_SENSE, "rows": []}
    for vp in [16.8, 16.0, 14.8, 13.2, 12.0]:
        i_max = vp / (R_LOAD + R_SENSE + RDS_ON)
        L["rows"].append({"pack_V": vp, "max_current_A": i_max, "resistor_W_at_max": i_max ** 2 * R_LOAD,
                          "mosfet_worst_W": vp ** 2 / (4 * (R_LOAD + R_SENSE)),
                          "mosfet_worst_at_A": vp / (2 * (R_LOAD + R_SENSE))})
    L["required_heatsink_C_per_W"] = (MOSFET_TJ_TARGET - T_AMB) / L["rows"][0]["mosfet_worst_W"] - MOSFET_RTH_JC - MOSFET_RTH_CS
    L["mosfet_tj_bound_C_budget_build"] = HEATSINK_CUTOFF_C + L["rows"][0]["mosfet_worst_W"] * (MOSFET_RTH_JC + RTH_CS_INSULATED)
    L["mosfet_tj_worst_C_with_530002B02500G"] = T_AMB + L["rows"][0]["mosfet_worst_W"] * (MOSFET_RTH_JC + MOSFET_RTH_CS + HEATSINK_RTH)
    out["ds18b20"] = DS18B20
    return out

if __name__ == "__main__":
    r = report()
    if "--json" in sys.argv:
        json.dump(r, open("expected_values.json", "w"), indent=2); print("wrote expected_values.json")
    else:
        print(json.dumps(r, indent=2))
