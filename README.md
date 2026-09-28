# Battery bench simulation

A browser-based workspace for the design-v1, 4S1P DMEGC INR18650-26E battery-management rig. It presents the component list and signal paths, an interactive Three.js 3D walkthrough, design validation, parameter sources, BLE authentication behavior, a connected T7 discharge-model preview, and tools for comparing bench-log-format CSV traces.

## Run locally

Requirements: Node.js 22 and Python 3.14 (the Python fitting and validation tools use NumPy).

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. To create and inspect a production build:

```powershell
npm run build
npm run preview
```

## Verify changes

```powershell
npm run build
npm test
python -X utf8 tools/validate_design.py
python -X utf8 tools/fit_cell_profile.py --selftest
```

The UTF-8 option avoids Windows console encoding failures for symbols printed by the Python tools. The design validator should report 26/26 rules passing for design v1. The fitter self-test should report six passing checks.

## Compare traces

Open **Compare** and select an expected trace CSV and a second comparison CSV. Both files use the column layout in [`data/bench_log_template.csv`](data/bench_log_template.csv), including `timestamp_s`. The page aligns time from each trace's first sample, interpolates expected values at the comparison sample times, and reports bias, RMSE, and maximum absolute error for a shared numeric channel. It can export a labeled SVG overlay and a results CSV.

The Tests page can generate a short **provisional T7 discharge preview** (1–900 seconds, up to the 1.25 A firmware load cap) and export it as CSV. It runs without a physical rig: the connected path includes the cell/pack model, electronic load setpoint, divider and ADS1115 sampling, INA226 current measurement, DS18B20 quantization, under-voltage protection, and coulomb counting. The cell profile and resulting trace are simulation estimates with an uncertainty band, not bench measurements. When a rig is built, T8/T9/T12 data can refine the cell OCV, resistance and thermal profile. The 3D page has separate provisional CC/CV and charge-temperature cutoff previews; the remaining full T0–T14 procedures, fuse transients, heatsink cutoff, and EKF correction are not implemented. Review [`docs/COMPONENT_PARAMETER_RESEARCH.md`](docs/COMPONENT_PARAMETER_RESEARCH.md) for modeled values, literature links and assumptions.

## 3D rig walkthrough

Open **3D demo** to see the 4S1P cell pack and 23 selectable parts reconstructed from the supplied top-down bench layout. The scene uses its 10 mm grid for scale, shows separate pink 18650 cells and holder, detailed BMS and Pi boards, breadboard tie points, shunt monitors, the charger/relay/fuse section, and the load/heatsink assembly. Drag to orbit, scroll to zoom, select a part to focus it, and use **Reset view** to return to the full bench.

Use **Preview condition** to choose among nine cases: six basic discharge conditions, an 8-second pulsed-load train, a 65% SOC CC-to-CV charge cycle, and a warm-cell charge that opens the relay at the modeled 45 °C limit. **Play preview** animates the selected telemetry, temperature trace, battery heat glow, and charge-path particles; scrub to inspect a specific moment. The charge model uses provisional cell resistance and thermal parameters, and holds the relay open after a cutoff for this demo. These are visual model previews, not validated T0–T14 procedures or physical safety tests. Fuse transients, heatsink cutoff and EKF correction remain unmodeled. See [`docs/SCENE_REFERENCE_NOTES.md`](docs/SCENE_REFERENCE_NOTES.md) and [`docs/reference-images/`](docs/reference-images/) for scene assumptions and source images.

For the Compare page, select an expected trace CSV and a second comparison CSV. Both use the column layout in [`data/bench_log_template.csv`](data/bench_log_template.csv), including `timestamp_s`. The page aligns time from each trace's first sample, interpolates expected values at comparison sample times, and reports bias, RMSE, and maximum absolute error for a shared numeric channel. It can export a labeled SVG overlay and results CSV. The comparison source selector labels results as **model-to-measurement** or **model-to-model**. Keep measured inputs separate from model output and preserve the source label in any paper figure.

## Project layout

| Location | Purpose |
|---|---|
| `src/core/config/` | Provenance-typed configuration, hardware calculations, design checks and cell profile |
| `src/core/hardware/` | Pure hardware behavior models |
| `src/core/cell/` | Cell, pack, electrical and thermal models |
| `src/core/firmware/` | Firmware behavior and telemetry row shapes |
| `src/core/sim/` | Fixed-step schedule and connected provisional T7 discharge preview |
| `src/core/compare/` | CSV parser, trace alignment, metrics and exports |
| `src/ui/` | Responsive React interface, design tokens and Three.js 3D rig scene |
| `tools/` | Python design validator and cell-profile fitter |
| `docs/` | Hardware specification, bench test plan and firmware port notes |

Every modeled value should retain its `source` and `ref` provenance. Values from listings, assumptions, provisional profiles, and VERIFY flags remain provisional until checked against the physical rig or bench measurements.

## Deploy to Vercel

Import the repository as a Vercel project. [`vercel.json`](vercel.json) configures `npm ci`, `npm run build`, the `dist` output directory, and the single-page-app fallback. No environment variables or server runtime are required for the static site. A preview deployment is created for a connected Git branch; merge the reviewed branch to the configured production branch to publish the production deployment.

For a manual deployment, use the Vercel CLI from the project folder:

```powershell
npx vercel
npx vercel --prod
```

## Project references

- [`CLAUDE_CODE_PROMPT.md`](CLAUDE_CODE_PROMPT.md): original project requirements and UI direction.
- [`CLAUDE.md`](CLAUDE.md): standing provenance, model-scope and verification rules.
- [`docs/HARDWARE_SPEC.md`](docs/HARDWARE_SPEC.md): design-v1 bill of materials and wiring.
- [`docs/TEST_PLAN_EXPECTED_VS_MEASURED.md`](docs/TEST_PLAN_EXPECTED_VS_MEASURED.md): tests T0–T14.
- [`docs/FIRMWARE_PORT_NOTES.md`](docs/FIRMWARE_PORT_NOTES.md): TypeScript-to-Python firmware mapping.
- [`docs/COMPONENT_PARAMETER_RESEARCH.md`](docs/COMPONENT_PARAMETER_RESEARCH.md): datasheet research, modeled settings and values awaiting bench verification.
- [`docs/validation_report.md`](docs/validation_report.md): design-v0 and design-v1 validation results.

