# Prompt for Claude Code

Unzip `bms-handoff.zip` into `C:\development\Battery Management System`, open Claude Code in that folder, and paste everything below the line.

---

You are building the simulation website for my final-year project, **Edge AI Battery Intelligence Platform with Authenticated BLE Access**. It will be hosted on Vercel and is the base for a review paper, so every number must be traceable to a datasheet, a derivation, a published source, or a bench measurement.

Before writing code, read in this order: `README.md`, `docs/HARDWARE_SPEC.md`, `docs/validation_report.md`, `docs/TEST_PLAN_EXPECTED_VS_MEASURED.md`, `tools/hw_calc.py`, `tools/validate_design.py`, `data/cell_profiles/dmegc_inr18650_26e.json`. Then summarise back to me in ten lines what the rig is, and wait for my go-ahead.

## What the site must do
It is a one-to-one simulation of **my real bench rig**, component for component, as specified in `docs/HARDWARE_SPEC.md` (design v1):
- A 4S1P pack of DMEGC INR18650-26E cells.
- A 1 MΩ/200 kΩ divider ladder into two ADS1115s.
- Two INA226s.
- Three DS18B20s.
- An electronic load: MCP4725 → 9.1 kΩ/1 kΩ divider → LM358 → IRLZ44N. The MOSFET (on an insulating pad) and my own 10 Ω 50 W resistor share a generic fan-cooled heatsink. A DS18B20 on the heatsink drives an 80 °C firmware cut-off.
- A 4S 40 A BMS board, a 5 A ATO fuse, a 16.8 V 2 A charger behind a relay.
- A Raspberry Pi 5 running the edge logic and BLE.

It shows me **what I should measure** for each bench test (T0–T14) before I build. Later, I upload my measured CSVs and it overlays measured on expected with bias, RMSE and maximum error.

## Non-negotiable honesty rules
1. Every constant lives in a typed config with `{ value, unit, source: 'datasheet'|'listing'|'derived'|'literature'|'measured'|'provisional'|'assumed', ref }`. No bare numbers in model code.
2. Anything `listing`, `provisional`, `assumed` or marked VERIFY is shown in the UI with a subtle "Provisional" badge. Expected traces that depend on provisional inputs show an uncertainty band.
3. Never invent a datasheet figure. If you need one that is not in the handoff, stop and ask me.
4. Tests (Vitest) must reproduce every value in `tools/expected_values.json`, and every rule in `tools/validate_design.py` must be mirrored by a TypeScript test that passes for design v1 and fails for v0. CI runs `npm test` and `python tools/validate_design.py`.
5. Model-to-model checks and model-to-measurement checks are labelled differently everywhere, including exported figures.
6. Out of scope for the one-to-one mode: vehicles, large packs, thermal runaway kinetics.

## Stack
- Vite + React + TypeScript (strict), Vitest, CSS modules with design tokens. No UI kit, no Tailwind.
- Physics and hardware models are framework-free in `src/core/` and run in a Web Worker.
- Static build for Vercel with a `vercel.json`.
- Charts in SVG, so figures export cleanly for the paper.

## Architecture
```
src/core/config/     typed parameters with provenance; loads data/cell_profiles/*.json
src/core/cell/       4 cells: OCV(SOC) table + R0 + two RC pairs (SOC/temperature tables when measured),
                     per-cell capacity and resistance spread, two-node thermal model from the profile, self-discharge
src/core/hardware/   divider+ADS1115 (PGA, data rate, 6 MΩ loading, gain/offset error, noise, quantisation, 4 channels, timing)
                     INA226 (register model, CAL=2048, averaging, conversion time), DS18B20 (12-bit, 750 ms, ±0.5 °C, probe lag)
                     load (DAC → divider → LM358 loop → IRLZ44N; ceiling V/(R_load+R_sense+R_DS); BMS FET drop gain error;
                     MOSFET, shared heatsink with thermal resistance as a measured parameter from T6, resistor thermal), BMS board (thresholds, delays, balancing), fuse (I²t from the
                     Littelfuse ATO curve), charger (CC-CV, output tolerance), relay
src/core/firmware/   exactly what the Pi runs: calibration, tap-to-cell conversion, protection (OV 4.22, UV 3.00, load cap 1.25 A, heatsink 80 °C, no charging above 45 °C cell temperature),
                     charge control via relay, coulomb counting, EKF SOC, anomaly checks, BLE HMAC-SHA256 challenge-response
                     with lockout, SQLite-shaped telemetry and event records. Document a line-by-line port to Python.
src/core/sim/        fixed-step scheduler honouring each sensor's real sample timing
src/core/compare/    CSV import (data/bench_log_template.csv), time alignment, bias/RMSE/max, residuals
src/ui/              pages below
tools/               keep hw_calc.py and validate_design.py; add fit_cell_profile.py (T8/T9 CSV → cell profile JSON)
```

## Pages
1. **Overview**: the rig at a glance, live key readings, which parameters are still provisional.
2. **Bench**: a clean 2D wiring view of the real rig from the net list; select any part to see its datasheet values, sources and live simulated reading.
3. **Tests**: pick T0–T14, see the procedure, run the simulation, see the expected traces with uncertainty bands, download the expected CSV.
4. **Signal chain**: for each channel, the step from physical quantity to register code to engineering value, with the error budget.
5. **Compare**: upload bench CSVs, overlay measured on expected, show the metrics, export SVG figures and a results CSV.
6. **Sources**: every parameter with its provenance, the validation report, and known limits.
7. **BLE**: the authentication demo (owner, technician, unknown key, replay, lockout).

## Visual design: follow Apple's Human Interface Guidelines
- **Typography.** Use the system font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif`. Do not bundle or host SF Pro files; Apple licenses them for Apple platforms only. Use Inter from Google Fonts as the fallback.
- **Type scale.** Follow HIG text styles: Large Title 34, Title 1 28, Title 2 22, Headline 17 semibold, Body 17, Callout 16, Subheadline 15, Footnote 13, Caption 12. Numbers use `font-variant-numeric: tabular-nums`.
- **Layout.** Sidebar navigation on desktop, bottom tab bar on phones. Each page has a large title that collapses on scroll. Use grouped inset lists (rounded 10–12 px containers on a grouped background) for settings and part details. Spacing follows an 8-point grid, with generous whitespace and one idea per section.
- **Colours: Apple system palette with automatic dark mode.**
  - Light: accent systemBlue #007AFF; green #34C759, orange #FF9500, red #FF3B30; grouped background #F2F2F7; cells #FFFFFF.
  - Dark: accent #0A84FF; green #30D158, orange #FF9F0A, red #FF453A; background #000000; cells #1C1C1E.
  - Labels and separators use Apple's label and separator colours.
- **Controls.** Segmented controls, switches, steppers and sheets (modal detail panels that slide up) instead of custom widgets. Every tap target is at least 44 × 44 px.
- **Charts.** Swift Charts feel: few gridlines, direct labels instead of legends where possible, accent for the expected trace, secondary label colour for bands, a crosshair with a value readout.
- **Motion.** Short spring transitions, disabled under `prefers-reduced-motion`.
- **Materials.** A translucent blur only on the navigation bar and sheets.
- **Avoid.** Gradients, emoji, glassmorphism everywhere, marketing copy, decorative icons, Apple logos or trademarks, and anything implying Apple affiliation. Icons, where needed: a simple outline set such as Lucide, used sparingly.
- **Copy.** Plain, sentence case, specific ("Cell 3 is 12 mV below the pack average"), never vague.

## Work in phases; stop after each for my review
1. Scaffold, config schema with provenance, port `hw_calc` and `validate_design` to TypeScript with passing tests, CI script.
2. Hardware models with tests.
3. Cell and thermal model from the profile, with provisional badges and uncertainty bands; `fit_cell_profile.py`.
4. Firmware logic and scheduler.
5. UI pages following the design rules above.
6. CSV compare and figure export.
7. Vercel deployment and a README for my team.

## Reference material
`reference/v2-scooter-sim/` is an earlier prototype of a different system (13S8P scooter pack). Reuse only the BLE HMAC code, the logging idea, the chart approach and the headless-test pattern. `reference/pybamm-validation/` shows the fit-then-validate-on-held-out-data method to follow with my bench data.

## Ask me, do not guess
- The MCP4725 address as reported by `i2cdetect`.
- The charger's measured open-circuit voltage.
- The BMS thresholds if I run T0b.
- The heatsink I actually buy and whether my power resistor is aluminium-housed or a ceramic block.
- The cell's internal resistance: no manufacturer figure exists for the bare DMEGC 26E, so it stays provisional until my T9 data arrives.
- Any value the handoff marks VERIFY.
