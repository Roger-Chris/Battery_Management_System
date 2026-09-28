# Expected vs measured: bench test plan (design v1, DMEGC INR18650-26E)

For each test: run the simulation, save the expected trace, run the rig with the same settings, log in the
`bench_log_template.csv` format, then compare with **bias, RMSE and maximum error**.
While the cell profile is provisional, the simulation shows an uncertainty band; say so in the paper.

**Safety.**
- Never deliberately overcharge, over-discharge or short real cells.
- Protection trips beyond normal limits are tested in simulation only, or with a bench supply standing in for the pack.
- Work on the ceramic tile, never leave charging unattended, and keep the sand or blanket within reach.

| ID | Test | Settings | Expected (source) | Acceptance |
|---|---|---|---|---|
| T0a | Charger open-circuit voltage | DMM on charger output, no battery | 16.8 V (charger spec) | 16.6–17.0 V, else rely on relay cut-off |
| T0b | BMS thresholds (optional) | Adjustable supply + resistor ladder in place of cells | 4.28 ± 0.05 V, 2.55 ± 0.08 V (listing) | Record actual values; update config |
| T1 | ADC calibration | Supply at 0.5 / 2.0 / 2.8 V at each divider input vs DMM | Code = V·(1/6)·(1−0.0286)/125 µV | Residual ≤ 1 mV after 2-point fit |
| T2 | Cell voltages at rest | Pack rested ≥ 1 h | DMM per cell | ≤ 3 mV per cell after calibration |
| T3 | INA226 calibration | 0.2–1.2 A through a reference meter | Reference current | Gain error ≤ 0.5 % after trim |
| T4 | Load setpoint | DAC codes for 0.25 / 0.5 / 1.0 A | I = code·0.806 mV·(1/10.1)/0.1 Ω before trim | ≤ 1 % after trim with INA226 #2 |
| T5 | Load ceiling | Command 1.25 A at pack ≈ 12.5 V | 1.23 A ceiling (derived) | Within ± 3 % |
| T6 | Heatsink characterisation | Load steps 0.4 / 0.83 / 1.25 A, 20 min each, fan on | Measures heatsink Rth = (T_hs − T_amb)/(P_FET + P_resistor) | Heatsink stays below the 80 °C cut-off at 0.83 A; record Rth |
| T7 | Capacity | 1.0 A (≈ 0.38C) from 4.20 V to 3.00 V/cell | Below the 2.50–2.60 Ah rated at 0.2C to 2.5 V; simulation gives the provisional value | Per-cell spread ≤ 3 %; far below 2.3 Ah suggests fake or aged cells |
| T8 | OCV curve (produces model input) | 0.13 A (C/20) full discharge, or 10 % steps with 1 h rest | – | Replaces provisional OCV |
| T9 | Pulse test (produces model input) | 1.0 A for 10 s, rest 60 s, every 10 % SOC | – | Fit residual ≤ 5 mV |
| T10 | Model validation | Held-out variable profile ≤ 1.25 A (e.g. scaled WMTC current) | Simulation with T8–T9 parameters | Voltage RMSE ≤ 15 mV; surface temperature ± 1.5 °C |
| T11 | Charge | Charger from 3.3 V/cell, cell probe below 45 °C | CC 2.0 A then CV taper (charger + model) | Time and end current within ± 10 % |
| T12 | Cell thermal | Surface DS18B20 during T7 | Lumped model (profile thermal block) | RMSE ≤ 1 °C after fitting R_surf |
| T13 | SOC estimation | T10 profile | Coulomb count from calibrated INA226 | Report RMSE and max error in % SOC |
| T14 | BLE authentication | Owner, technician, unknown key, replay | Accept / accept / reject / reject | All correct; lockout after 3 failures |

Order: T0–T3 calibrate the instruments, T8–T9 parameterise the cell, T10 onward are the true expected-versus-measured
results. Do not validate on the data used to fit.
