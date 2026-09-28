"""
Design validation loop for the 4S DMEGC INR18650-26E bench rig.

Every rule below is a pass/fail check against datasheet or derived values. The script evaluates
two configurations: v0 = the bill of materials as first proposed, v1 = the corrected design.
A handoff is only valid when v1 passes every rule. Values tagged VERIFY in the sources must be
confirmed on the physical part (see docs/HARDWARE_SPEC.md).

Run: python validate_design.py            -> prints report, exits 1 if v1 fails
     python validate_design.py --report   -> also writes validation_report.md
"""
import sys, copy

# ------------------------------------------------------------------ sources
CELL = dict(  # DMEGC INR18650-26E (DMEGC product page + ANSMANN sheet for a pack on this cell); conservative values
    model="DMEGC INR18650-26E", v_max=4.20, v_cutoff=2.50, cap_nom_Ah=2.60, cap_min_Ah=2.50,
    i_charge_max=2.6, i_dis_max=7.8, i_dis_max_conservative=5.0, t_charge_max=45.0)
BMS = dict(  # generic 4S 40A board, seller listing values (VERIFY by measurement, test T0b)
    ov_detect=4.28, ov_tol=0.05, uv_detect=2.55, uv_tol=0.08, oc_trip_A=80.0)
TL072 = dict(name="TL072", vicr_above_vneg=4.0, vicr_below_vpos=0.0, vsup_max=36)      # TI TL07x, ±15 V test point (VERIFY)
LM358 = dict(name="LM358", vicr_above_vneg=0.0, vicr_below_vpos=1.5, vsup_max=32, voh_drop=1.5)  # TI LM358
ADS1115 = dict(vdd=3.3, fsr=4.096, zin_cm=6e6, i_in_max=10e-3)   # TI SBAS444: 6 MΩ common-mode at ±4.096 V, 10 mA continuous
IRLZ44N = dict(rth_jc=1.4, rth_cs_grease=0.5, tj_max=175, vgs_needed=3.5)  # Infineon IRLZ44N (VERIFY); vgs for ~1.3 A with margin
INA226 = dict(vshunt_fs=0.08192)
HEATSINKS = {"generic small clip-on (assumed 20 °C/W)": 20.0,
             "Boyd/Aavid 530002B02500G (2.6 °C/W)": 2.6,
             "generic heatsink + 12 V fan, measured in T6": None}
RTH_CS_INSULATED = 1.5  # silicone/mica pad needed when MOSFET shares the heatsink with the resistor (assumed; VERIFY pad data)
AWG18_CHASSIS_A = 10.0  # conservative chassis-wiring figure for 18 AWG PVC

BASE = dict(
    n_series=4, charger_v=12.0, charger_a=4.0, fuse_a=5.0,
    divider=(1e6, 200e3), r_series=10e3, schottky_clamps=True, calibrate_adc=True,
    opamp=TL072, opamp_supply=5.0,
    dac_vref=3.3, dac_divider=None, r_sense=0.1, r_load=10.0, r_sense_rating_W=None,
    i_cap=None, heatsink="generic small clip-on (assumed 20 °C/W)", resistor_mounted_on_heatsink=False,
    sw_ov=4.25, sw_uv=3.0, charge_relay=False, t_amb=35.0,
    i2c={"ADS1115 #1": 0x48, "ADS1115 #2": 0x49, "INA226 #1": 0x40, "INA226 #2": 0x41, "MCP4725": 0x60},
    ds18b20_period_s=1.0, test_current_A=1.0)

V1 = copy.deepcopy(BASE)
V1.update(charger_v=16.8, charger_a=2.0, schottky_clamps=False, opamp=LM358, opamp_supply=12.0,
          dac_divider=(9.1e3, 1.0e3), r_sense_rating_W=1.0, i_cap=1.25,
          heatsink="generic heatsink + 12 V fan, measured in T6", shared_heatsink=True,
          heatsink_cutoff_C=80.0, heatsink_sensor=True, resistor_mounted_on_heatsink=True,
          sw_ov=4.22, charge_relay=True)

def rules(c):
    out = []
    def rule(name, ok, detail): out.append((name, bool(ok), detail))
    ns = c["n_series"]; vfull = ns * CELL["v_max"]; vmin = ns * c["sw_uv"]
    rule("Charger CV voltage equals 4 × 4.20 V", abs(c["charger_v"] - vfull) <= 0.01 * vfull,
         f"charger {c['charger_v']} V vs required {vfull:.1f} V")
    rule("Charger current within cell maximum charge current", c["charger_a"] <= CELL["i_charge_max"],
         f"{c['charger_a']} A per cell (4S1P) vs max {CELL['i_charge_max']} A")
    rule("Charger current below fuse rating with 25 % margin", c["charger_a"] * 1.25 <= c["fuse_a"],
         f"{c['charger_a']} A × 1.25 vs fuse {c['fuse_a']} A")
    rule("Fuse at or below 18 AWG wiring, the most conservative cell limit and BMS limits", c["fuse_a"] <= min(AWG18_CHASSIS_A, CELL["i_dis_max_conservative"], BMS["oc_trip_A"]),
         f"fuse {c['fuse_a']} A")
    # ADC front end
    k = c["divider"][1] / sum(c["divider"]); vadc = vfull * k
    rule("Top tap stays below ADS1115 VDD and FSR", vadc < ADS1115["vdd"] and vadc < ADS1115["fsr"], f"{vadc:.2f} V at ADC")
    i_fault = (vfull - ADS1115["vdd"] - 0.3) / (c["divider"][0] + c["r_series"])
    rule("Fault current into ADC pin (bottom resistor open) under 10 mA without external clamps",
         i_fault < ADS1115["i_in_max"], f"{i_fault*1e6:.1f} µA")
    r_src = c["divider"][0] * c["divider"][1] / sum(c["divider"]) + c["r_series"]
    leak = 10e-9 if c["schottky_clamps"] else 0.0
    rule("No clamp-diode leakage error (≤ 1 mV at the cell)", leak * r_src / k <= 1e-3,
         f"{leak*r_src/k*1e3:.1f} mV at 10 nA leakage" if leak else "external clamps removed")
    rule("Per-channel ADC calibration planned (loading gain error is ~2.9 %)", c["calibrate_adc"],
         f"source {r_src/1e3:.1f} kΩ vs {ADS1115['zin_cm']/1e6:.0f} MΩ → {r_src/(r_src+ADS1115['zin_cm'])*100:.2f} %")
    # load
    op = c["opamp"]
    rule("Op-amp input range reaches 0 V on a single supply", op["vicr_above_vneg"] <= 0.0,
         f"{op['name']} input needs ≥ V− + {op['vicr_above_vneg']} V; sense voltage is 0–0.13 V")
    voh = c["opamp_supply"] - op.get("voh_drop", 1.5)
    rule("Op-amp output can drive the gate", voh >= IRLZ44N["vgs_needed"] + 0.2, f"Voh ≈ {voh:.1f} V")
    rule("Op-amp supply within rating", c["opamp_supply"] <= op["vsup_max"], f"{c['opamp_supply']} V")
    div = 1.0 if not c["dac_divider"] else c["dac_divider"][1] / sum(c["dac_divider"])
    lsb_A = c["dac_vref"] / 4096 * div / c["r_sense"]; fs_A = c["dac_vref"] * div / c["r_sense"]
    rule("Load setpoint resolution ≤ 1 mA", lsb_A <= 1e-3, f"{lsb_A*1e3:.2f} mA per DAC step")
    cap = c["i_cap"] if c["i_cap"] else fs_A
    rule("Firmware current cap defined and ≤ DAC full scale", c["i_cap"] is not None and cap <= fs_A,
         f"cap {cap:.2f} A, DAC full scale {fs_A:.2f} A")
    rule("Standard test current reachable at end of discharge", vmin / (c["r_load"] + c["r_sense"] + 0.025) >= c["test_current_A"],
         f"ceiling at {vmin:.0f} V = {vmin/(c['r_load']+c['r_sense']+0.025):.2f} A vs test {c['test_current_A']} A")
    p_fet = vfull ** 2 / (4 * (c["r_load"] + c["r_sense"]))
    rcs = RTH_CS_INSULATED if c.get("shared_heatsink") else IRLZ44N["rth_cs_grease"]
    rhs = HEATSINKS[c["heatsink"]]
    if rhs is None:
        # heatsink not characterised by datasheet: firmware cut-off on a DS18B20 bonded to the heatsink bounds Tj
        tcut = c.get("heatsink_cutoff_C")
        tj = (tcut if tcut is not None else 1e9) + p_fet * (IRLZ44N["rth_jc"] + rcs)
        rule("MOSFET junction ≤ 125 °C at worst-case dissipation", tcut is not None and tj <= 125,
             f"{p_fet:.2f} W; heatsink cut-off {tcut} °C → Tj ≤ {tj:.0f} °C (heatsink Rth measured in T6)")
        rule("Heatsink temperature sensor present for the cut-off", c.get("heatsink_sensor", False), "spare DS18B20 bonded to the heatsink")
    else:
        tj = c["t_amb"] + p_fet * (IRLZ44N["rth_jc"] + rcs + rhs)
        rule("MOSFET junction ≤ 125 °C at worst-case dissipation", tj <= 125, f"{p_fet:.2f} W → Tj {tj:.0f} °C with {c['heatsink']}")
    p_res = min(cap, vfull / (c["r_load"] + c["r_sense"])) ** 2 * c["r_load"]
    rule("Power resistor mounted on a monitored heatsink (50 W rating assumes one)", c["resistor_mounted_on_heatsink"],
         f"{p_res:.1f} W at the current cap")
    p_sense = min(cap, 1.7) ** 2 * c["r_sense"]
    rule("Sense resistor rated ≥ 2 × its dissipation", c["r_sense_rating_W"] is not None and c["r_sense_rating_W"] >= 2 * p_sense,
         f"{p_sense:.3f} W dissipated, rating {c['r_sense_rating_W']} W")
    rule("INA226 full scale covers charger and load currents", INA226["vshunt_fs"] / 0.01 >= max(c["charger_a"], cap) * 1.5,
         f"8.19 A full scale")
    # protection coordination
    ov_min = BMS["ov_detect"] - BMS["ov_tol"]; uv_max = BMS["uv_detect"] + BMS["uv_tol"]
    rule("Software over-voltage trips before the BMS board", c["sw_ov"] < ov_min, f"{c['sw_ov']} V vs BMS minimum {ov_min:.2f} V")
    rule("Software under-voltage trips before the BMS board", c["sw_uv"] > uv_max, f"{c['sw_uv']} V vs BMS maximum {uv_max:.2f} V")
    rule("Software under-voltage at or above the cell cut-off", c["sw_uv"] >= CELL["v_cutoff"], f"{c['sw_uv']} V vs {CELL['v_cutoff']} V")
    rule("Load current cap within the most conservative cell discharge limit", cap <= CELL["i_dis_max_conservative"], f"{cap:.2f} A vs {CELL['i_dis_max_conservative']} A")
    rule("Pi can stop charging (charge-enable relay)", c["charge_relay"], "needed because the BMS board is the only other switch")
    addrs = list(c["i2c"].values())
    rule("I²C addresses unique", len(addrs) == len(set(addrs)), ", ".join(f"{k} 0x{v:02X}" for k, v in c["i2c"].items()))
    rule("DS18B20 12-bit conversion fits the sample period", 0.75 <= c["ds18b20_period_s"], f"750 ms vs {c['ds18b20_period_s']} s")
    return out

def run(name, cfg):
    res = rules(cfg); n_ok = sum(ok for _, ok, _ in res)
    lines = [f"## {name}: {n_ok}/{len(res)} rules pass", "", "| Rule | Result | Detail |", "|---|---|---|"]
    lines += [f"| {r} | {'PASS' if ok else '**FAIL**'} | {d} |" for r, ok, d in res]
    return n_ok == len(res), "\n".join(lines)

if __name__ == "__main__":
    ok0, rep0 = run("v0, bill of materials as first proposed", BASE)
    ok1, rep1 = run("v1, corrected budget design (this handoff)", V1)
    report = "# Design validation report\n\nGenerated by tools/validate_design.py.\n\n" + rep0 + "\n\n" + rep1 + "\n"
    print(report)
    if "--report" in sys.argv: open("validation_report.md", "w").write(report)
    sys.exit(0 if ok1 else 1)
