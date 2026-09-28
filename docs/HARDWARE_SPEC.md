# Hardware specification, design v1 (budget build)

Physical system: a 4S1P pack of DMEGC INR18650-26E cells, monitored and exercised by a Raspberry Pi 5.
This file is the single source of truth for the simulation. Numbers are reproduced by `tools/hw_calc.py`
(`tools/expected_values.json`) and every design rule is checked by `tools/validate_design.py`
(`docs/validation_report.md`: v0 fails 15 of 26 rules, v1 passes 26 of 26).

Tags: **datasheet** (manufacturer document), **listing** (seller page, generic part), **derived** (calculated here),
**VERIFY** (confirm on your physical part before quoting it in the paper).

## 1. Bill of materials

### Already owned
| # | Part | Qty | Role | Source of data |
|---|---|---|---|---|
| 1 | Raspberry Pi 5, 4 GB, 27 W USB-C supply, active cooler, 64 GB microSD | 1 | Edge node; powered from mains, not from the pack | Raspberry Pi product brief |
| 2 | ADS1115 16-bit ADC module | 2 | Cell-tap voltages; 0x48 taps 1–2, 0x49 taps 3–4 | TI SBAS444 |
| 3 | 1 MΩ and 200 kΩ, 0.1 % | 4 pairs | Divider ladder, ratio 1/6 | – |
| 4 | 10 kΩ | 4 | Series resistor into each ADC input | – |
| 5 | INA226 module with 0.01 Ω shunt | 2 | #1 pack current (0x40), #2 load branch (0x41) | TI SBOS547 |
| 6 | DS18B20 waterproof probe + 4.7 kΩ pull-up | 3 | Cell 2 surface, ambient, and the load heatsink (drives the 80 °C cut-off) | Analog Devices (Maxim) DS18B20 |
| 8 | 4S holder, XT60, 18 AWG | – | | |
| 9 | 4S 40 A BMS protection board, with balancing | 1 | Independent hardware protection | listing, **VERIFY** |
| 10 | MCP4725 12-bit DAC module | 1 | Load setpoint (0x60; some modules 0x62, **VERIFY** with `i2cdetect`) | Microchip DS22039 |
| 11 | IRLZ44N | 1 | Load pass element | Infineon IRLZ44N |
| 12 | 0.1 Ω sense resistor | 1 | Load current sense; must be rated ≥ 0.5 W (1 W recommended) | – |
| 12b | 10 Ω 50 W power resistor (your own) | 1 | Load dissipation; bolted to the load heatsink if aluminium-housed | Seller listing; temperature measured in T6 |
| 13 | 12 V 3–5 A adapter | 1 | Powers the fan and the LM358. **Not a charger.** | – |
| 14 | 12 V fan | 1 | Cools the load heatsink | – |
| 15 | ESP32 | 1 | BLE fallback only | – |
| 16 | Ceramic tile, sand bucket or fire blanket | – | Fire safety | – |

### To buy (prices checked on Indian stores, September 2026; small-part prices are typical, not quoted)
| # | Part | Exact part | Why | Where | Approx. price |
|---|---|---|---|---|---|
| A | Cells | DMEGC INR18650-26E, 2600 mAh, ×6–8 (4 in service + spares) | Cheap, manufacturer data available, limits well above this rig's currents | Robu.in, Batteryworks, others | ₹130–170 each |
| B | 4S Li-ion charger | Pro-Range 4S 16.8 V 2 A, DC 5.5 × 2.5 mm plug | A 12 V supply cannot charge a 16.8 V pack; 2 A ≤ the 26E's 2.6 A maximum | Robu.in | ₹504–534 |
| C | DC jack to XT60 lead | 5.5 × 2.5 mm female to XT60 male, 18 AWG | Connect the charger | Robu.in, Amazon.in | ~₹50–100 |
| D | Fuse and holder | 5 A ATO blade fuse (Littelfuse 257 series if available) + inline ATO holder | Over-current protection sized to the rig | Robu.in, Amazon.in | ~₹50–100 |
| E | Op-amp | LM358 (DIP-8), replaces TL072 | TL072 input cannot operate near 0 V on a single supply | Robu.in | ~₹10–20 |
| F | Resistors and capacitor | 9.1 kΩ, 1.0 kΩ (1 %), 100 Ω, 100 kΩ, 1 kΩ, 10 nF | DAC divider (0.80 mA steps), gate drive, loop compensation | Any | ~₹20 |
| G | Load heatsink | Generic extruded aluminium heatsink large enough for the MOSFET and the power resistor, with your 12 V fan | Temperature is measured (T6) and capped at 80 °C in firmware instead of predicted from a datasheet | Robu.in | ~₹60–150 |
| H | MOSFET insulation kit | TO-220 silicone or mica pad + insulating bushing | The MOSFET tab is the drain; it shares the heatsink with the resistor | Robu.in | ~₹10–20 |
| I | Charge-enable relay | 5 V single-channel relay module (Songle SRD-05VDC-SL-C, 10 A contacts) | Lets the Pi stop charging | Robu.in | ~₹40–60 |
| J | Thermal paste | Any silicone compound | Heatsink mounting | Any | ~₹50–100 |

**Estimated total to buy: about ₹1,800–2,400** (with 6–8 cells).

Optional datasheet upgrade (not required): Boyd/Aavid 530002B02500G heatsink (2.6 °C/W) and Arcol HS50 10R J resistor from element14 India, about $3–5 each at US distributors plus Indian shipping. They let you predict temperatures from datasheets instead of measuring them.

Removed: **Schottky clamp diodes** on the ADC inputs (reason in section 4).

Buy cells from an established store. Run test T7 (capacity) on every cell and do not mix cells more than about 3 % apart.

## 2. Wiring (net list)

Ground reference: **Pi GND = pack B− (cell 1 negative)**, so voltage measurement keeps working if the BMS board opens.
All supplies (Pi USB-C, 12 V adapter, charger) are isolated adapters; their negatives join this ground.

| Net | Connects |
|---|---|
| B− | Cell 1 −, BMS B−, Pi GND, ADS1115 GND ×2, INA226 GND ×2, MCP4725 GND, LM358 V−, 12 V adapter −, divider bottoms |
| B1…B4 | Cell tops 1–4 → BMS balance leads B1–B4; each tap → 1 MΩ → divider node → 200 kΩ → B−; node → 10 kΩ → ADS input |
| B+ | Cell 4 + (= B4), BMS B+ |
| P+ bus | B+ → 5 A fuse → INA226 #1 VIN+ → VIN− → P+ bus |
| Load branch | P+ bus → INA226 #2 VIN+ → VIN− → 10 Ω 50 W resistor → IRLZ44N drain; source → 0.1 Ω → P− |
| Charge path | Charger + → relay COM → NO → P+ bus; charger − → P− |
| P− | BMS P− (charge and discharge port), sense-resistor bottom, charger − |
| Load control | MCP4725 VOUT → 9.1 kΩ → node → 1 kΩ → B−; node → LM358 IN+; sense-resistor top → 1 kΩ → LM358 IN−; 10 nF IN− to OUT; OUT → 100 Ω → gate; 100 kΩ gate → B− |
| Supplies | LM358 V+ and fan from 12 V; MCP4725, ADS1115, INA226 from Pi 3.3 V; relay module from Pi 5 V |
| Pi GPIO | GPIO2/3 I²C1 (through the hub), GPIO4 1-Wire (all three DS18B20s on one bus, 4.7 kΩ to 3.3 V), GPIO17 relay input |
| Heatsink | MOSFET (on insulating pad) and power resistor share one heatsink; heatsink DS18B20 bonded next to the MOSFET; fan blows across the fins |

Note: the load's sense voltage is referenced to P−, while the DAC is referenced to B−. The BMS board's FET drop
(I × a few mΩ) therefore adds a small, current-proportional gain error to the load setpoint. It is linear, so it is
removed by calibrating against INA226 #2 (test T4) and by the firmware's outer current trim loop.

## 3. Expected values (derived; see tools/expected_values.json)

**Cell-voltage chain.**
- Divider ratio 1/6; taps at full charge 0.70 / 1.40 / 2.10 / 2.80 V at the ADC, below the 3.3 V supply.
- ADS1115 at ±4.096 V: 125 µV per step, **0.75 mV per step at the tap**.
- Source impedance 176.7 kΩ against the ADS1115's 6 MΩ common-mode input impedance: **2.86 % gain error** (linear, removed by calibration).

**Current (INA226, 0.01 Ω).**
- Full scale 8.19 A, resolution 0.25 mA, calibration register **2048** for a 0.25 mA current LSB.
- Bus voltage LSB 1.25 mV.

**Temperature (DS18B20).**
- ±0.5 °C from −10 to +85 °C, 0.0625 °C per step at 12 bits, 750 ms per conversion.

**Electronic load.**
- DAC step 0.806 mV → **0.80 mA per step** after the divider; full scale 3.27 A.
- Firmware cap **1.25 A** (0.5C).
- Current ceiling V / 10.125 Ω: 1.66 A at 16.8 V, 1.30 A at 13.2 V, 1.19 A at 12.0 V. The standard test current of **1.0 A** is reachable down to the 3.0 V/cell cut-off.

| Quantity | Value |
|---|---|
| Resistor dissipation at the cap | 15.6 W |
| Sense-resistor dissipation at the cap | 0.16 W |
| MOSFET worst case | 6.99 W at 0.83 A (16.8 V) |
| MOSFET junction bound | ≤ 100 °C: 80 °C heatsink cut-off + 6.99 W × (R_θJC 1.4 + insulating pad ≈ 1.5 °C/W) |
| Heatsink thermal resistance | Measured in T6 (not predicted) |

**Protection coordination.**

| Layer | Over-voltage | Under-voltage | Over-current |
|---|---|---|---|
| Pi software (trips first) | 4.22 V/cell, stops charge via relay | 3.00 V/cell, load to 0 A | 1.25 A load cap; 2.2 A charge; load off above 80 °C heatsink; charge off above 45 °C cell |
| BMS board (listing, **VERIFY**) | 4.28 ± 0.05 V, 0.1 s | 2.55 ± 0.08 V | about 80 A |
| Fuse | – | – | 5 A (ATO fast-acting) |
| DMEGC 26E limits | 4.20 ± 0.05 V charge | 2.50 V cut-off (2.75 V recommended) | 7.8 A per DMEGC, 5 A in the most conservative source; 2.6 A charge; charge 0–45 °C |

Measure the charger's open-circuit voltage before first use (test T0a). If it is above 16.9 V, the software stops
charge at 4.20 V per cell through the relay.

## 4. Design decisions (v0 → v1)
1. **Charger.** A 12 V supply cannot charge a 4S pack (it needs 16.8 V CC-CV). Buy the 16.8 V 2 A charger; keep the 12 V adapter for the fan and the op-amp.
2. **Cells: DMEGC INR18650-26E instead of Samsung 25R.** About a quarter of the price. Every quoted limit is far above this rig's 1.25 A load and 2 A charge.
3. **Clamp diodes removed.** The ADS1115 tolerates 10 mA continuous input current (TI SBAS444). With 1 MΩ + 10 kΩ in series, the worst fault current is about 13 µA. External Schottky clamps would only add leakage error (10 nA → 10.6 mV at the cell).
4. **LM358 instead of TL072.** The TL072 needs its inputs a few volts above V−; the sense voltage sits at 0–0.13 V.
5. **9.1 kΩ / 1 kΩ divider after the DAC.** Current steps drop from 8.06 mA to 0.80 mA.
6. **Measured heatsink instead of a datasheet heatsink.** A generic heatsink and fan carry both the MOSFET (on an insulating pad) and your own 10 Ω 50 W resistor. The spare DS18B20 sits on the heatsink, and firmware cuts the load at 80 °C, which bounds the MOSFET junction at about 100 °C. Test T6 measures the heatsink's thermal resistance.
7. **1.25 A firmware load cap** (resistor dissipation 15.6 W).
8. **Software thresholds inside the BMS window.** OV 4.22 V (below the board's 4.23 V minimum) and UV 3.00 V (above its 2.63 V maximum and the cell's 2.5 V cut-off).
9. **Charge-enable relay.** The Pi can stop charging, including when the cell probe exceeds the cell's 45 °C charge limit.

If your 10 Ω 50 W resistor is a white ceramic (cement) block rather than a gold aluminium-housed one, it cannot be bolted to the heatsink. Keep it in free air, away from plastic, and lower the load cap until test T6 shows its surface stays below its datasheet limit.

## 5. Still to confirm on the bench
- BMS thresholds (listing values). Test T0b needs an adjustable supply; otherwise keep them marked VERIFY.
- MCP4725 address, charger open-circuit voltage, the heatsink thermal resistance (T6), your power resistor's type, and the IRLZ44N thermal figures.
- DMEGC 26E OCV curve, internal resistance and thermal values (tests T8, T9, T12). The cell profile ships provisional until then; no manufacturer bare-cell impedance figure was found.
