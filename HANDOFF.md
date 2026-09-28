# Handoff: BMS bench-rig simulation site

Status as of this handoff: **Phases 1–6 implemented; Phase 7 is deployment-ready; connected T7 simulation and interactive 3D rig demo implemented** (see `CLAUDE_CODE_PROMPT.md` for the
full phase plan and all project rules — read that file first, it is the spec this handoff
summarizes progress against). `CLAUDE.md` has the standing repo rules (provenance, Provisional
badges, `npm test` + `python tools/validate_design.py` must pass before any commit, framework-free
`src/core/`, HIG-following UI). The static site is Vercel-ready but is not published. The Tests
page now runs a provisional connected T7 discharge preview and exports its trace; the full
T0–T14 scenario set and hardware-model coverage remain outstanding.

## Stack (already scaffolded, do not change without asking)

Vite + React + TypeScript (strict) + Vitest. No UI kit, no Tailwind. `src/core/` is
framework-free and will run in a Web Worker eventually; UI lives in `src/ui/`.
Node 22, Python 3.14 (no scipy installed — `tools/fit_cell_profile.py` is numpy-only by design).

**Windows console gotcha**: always run the Python tools as `python -X utf8 tools/....py` — the
default Windows cp1252 console encoding crashes on the ✓/µ/Ω/≤ characters both scripts print.
`package.json`'s `validate:design` script and `.github/workflows/ci.yml` already do this.

**GitHub is connected.** The previously empty `Roger-Chris/Battery_Management_System` repository
now has the complete project on `main`; the workspace folder itself still has no local `.git`
metadata. The GitHub commit history is the shared remote copy. Localhost demo runs from this
workspace using `npm run dev`.

## What's done

### Phase 1 — scaffold + provenance config (`src/core/config/`)
- `provenance.ts`: `Parameter<T>` type (`value/unit/source/ref/verify?`), `isProvisional()`.
- `bom.ts`: every constant from `tools/hw_calc.py`, wrapped with real provenance citing
  `docs/HARDWARE_SPEC.md` / datasheets.
- `hwCalc.ts`: TS port of `tools/hw_calc.py`'s `report()`. **Verified numerically identical**
  to `tools/expected_values.json` (the committed fixture) in `hwCalc.test.ts`.
- `validateDesign.ts`: TS port of all 26 rules in `tools/validate_design.py`. Verified against
  `docs/validation_report.md`'s actual output (v0: 11/25 pass, v1: 26/26 pass) in
  `validateDesign.test.ts`.
- `cellProfile.ts`: typed loader for `data/cell_profiles/dmegc_inr18650_26e.json`, with
  `isCellProfileProvisional()`/`provisionalFields()`.
- `.github/workflows/ci.yml`: runs `npm ci`, typecheck, `npm test`, `python -X utf8
  tools/validate_design.py`.

### Phase 2 — hardware behavior models (`src/core/hardware/`)
`divider.ts`, `ads1115.ts`, `ina226.ts`, `ds18b20.ts`, `load.ts`, `bmsBoard.ts`, `fuse.ts`,
`charger.ts`, `relay.ts`. Each is pure functions over `bom.ts`/`validateDesign.ts` constants,
each has a `.test.ts`. Notably:
- INA226 power-register math: I initially recalled TI's formula wrong from memory; the test
  caught it (64 W vs 16 W expected) — now derived directly from `Power_LSB = 25 × Current_LSB`
  instead of a half-remembered magic constant. If you touch `ina226.ts`, re-verify against the
  TI SBOS547 datasheet, not memory.
- Several parameters have **no value in the handoff** and are required caller arguments, not
  invented defaults: Littelfuse 257 fuse I²t curve (`fuse.ts`), INA226 conversion-time/averaging
  settings (`ina226.ts`), DS18B20 probe-lag time constant (`ds18b20.ts`), BMS balance threshold
  and UV trip delay (`bmsBoard.ts`). **These need real values from the user before Phase 6/7
  should be supplied before simulated traces for those behaviors are treated as trustworthy.**
  Datasheet research now supplies ADS1115's 128 SPS power-on default and INA226's one-sample,
  1.1 ms conversion defaults as flagged-to-verify BOM parameters. The 5 A fuse's 26 A²s value is
  only a provisional Littelfuse 287 replacement candidate, not the identified installed fuse.

### Phase 3 — cell/thermal model (`src/core/cell/`) + fitting tool
`ocv.ts` (OCV(SOC) interpolation + a ±30 mV uncertainty band while provisional — that number is
taken from the profile JSON's own "expect tens of mV deviation" note, not invented),
`equivalentCircuit.ts` (R0 + 2 RC branches), `thermal.ts` (two-node core/surface), `selfDischarge.ts`,
`spread.ts` (per-cell capacity/R0 spread, defaults identical), `pack.ts` (4S series combination,
tap voltages + bands for the divider ladder).

`tools/fit_cell_profile.py`: fits `ocv_curve` (T8), `r0_ohm`+`rc_pairs` (T9, via a numpy-only
variable-projection two-exponential fit — **not** Prony's method; I tried Prony first and its
self-test caught that it's too noise-sensitive for closely-spaced RC time constants), and
`thermal.R_surf_K_per_W` (T12). Run `python -X utf8 tools/fit_cell_profile.py --selftest` to
verify the numerics (all 6 checks should PASS).

**Important finding from the self-test**: separating two RC time constants needs a relaxation
window several times longer than the slower one. The profile's placeholder slow branch is
τ≈300 s, but test T9's protocol only rests 60 s — likely too short to resolve it. Consider
lengthening T9's rest period before relying on its RC fit.

### Phase 4 — firmware + scheduler (`src/core/firmware/`, `src/core/sim/`)
`calibration.ts` (T1's 2-point fit), `tapToCell.ts`, `protection.ts` (OV 4.22 V / UV 3.00 V /
1.25 A load cap / 2.2 A charge cap — that 2.2 A figure is quoted directly from
`docs/HARDWARE_SPEC.md`'s protection table, distinct from the charger's own 2.0 A max / 80 °C
heatsink / 45 °C charge cutoff), `chargeControl.ts`, `coulombCounting.ts` (operates on
*measured*, not ground-truth, current — deliberately, to be representative of what the Pi
actually sees), `ekfSoc.ts` (scalar EKF; its test shows it out-performing raw coulomb counting
under a miscalibrated capacity), `anomalyChecks.ts`, `ble.ts` (HMAC-SHA256 challenge/response +
3-strikes/30s lockout, ported from `reference/v2-scooter-sim/src/ui.js`'s pattern with the UI
stripped out; uses the runtime's built-in `crypto.subtle` — no new dependency; tested against
all 5 of T14's scenarios), `telemetry.ts` (SQLite-shaped row types + DDL, no sqlite3 binding
opened in `src/core/`, per the framework-free rule).

`src/core/sim/scheduler.ts`: `fixedStepSchedule()`, a generator giving per-tick due-sensor lists
from integer step-count periods (avoids float drift over long runs). `runDischarge.ts` now uses it
for a connected T7 preview: cell/pack and thermal plant, DAC-controlled load, divider/ADS1115,
INA226, DS18B20, under-voltage protection and measured-current coulomb counting. The Tests page
plots per-cell voltage bands and exports bench-template-shaped CSV with an explicit model-output
label. The run is bounded to 1–900 seconds in the UI to keep it responsive.

This is a focused vertical slice, not yet a validated digital twin. Its cell profile is provisional;
probe lag and heatsink dynamics are omitted, and it does not yet exercise charging, relay control,
fuse transients, EKF, or the other T0–T14 scenarios. Those omissions are surfaced in the UI and
export notes.

`docs/FIRMWARE_PORT_NOTES.md`: the line-by-line TS→Python mapping `CLAUDE_CODE_PROMPT.md`
explicitly asked for, module by module, with a worked example and a section on what does *not*
port 1:1 (BLE transport, SQLite I/O, the scheduler's bounded-vs-unbounded loop).

### Current verification status
- `npm test` (Vitest): **93/93 passing**, 30 test files.
- `npx tsc --noEmit`: clean (strict mode).
- `npm run build` (`tsc --noEmit && vite build`): succeeds.
- `python -X utf8 tools/validate_design.py`: exits 0, v1 26/26.
- `python -X utf8 tools/fit_cell_profile.py --selftest`: exits 0, all 6 checks PASS.

Run the build, tests, design validator, and profile fitter self-test before and after changes.

## Completed phases and remaining work

### Phase 5 — UI pages
`src/App.tsx`, `src/ui/RigScene3D.tsx` and `src/ui/styles.css` implement Overview, Bench, 3D demo,
Tests, Signal chain, Compare, Sources and BLE. `RigScene3D.tsx` builds the conceptual component
layout with Three.js and OrbitControls: four individually visible cells, two ADS1115s, two INA226s,
three temperature probes, BMS, fuse, charger, relay, divider, DAC, LM358, MOSFET, power resistor,
heat sink/fan and Pi 5. Users can orbit/zoom, select component meshes or the component list, and
inspect simulated readings. Play/pause/scrub controls offer six discharge profiles, an 8-second
load-pulse train, a CC/CV charge cycle and a warm-cell 45 °C charge-cutoff preview. The charge
path, relay indicator, battery heat glow and temperature trace animate with scenario telemetry.
Charge cutoff latches the relay open for the preview. Cell heating parameters remain provisional,
so these are visual model scenarios rather than validated test procedures. The shapes are
illustrative, not production CAD, and the demo needs no physical rig or BLE radio.

The interface follows the system-font, responsive layout, dark-mode, reduced motion and
no-branding rules. Test procedures, parameter provenance and BLE behavior are shown. The Tests
page includes a runnable T7 preview with CSV export. The 3D scene now visualizes more operating
conditions, while the remaining T0–T14 procedures still need scenario-specific orchestration and
validation.

Must follow the Apple HIG rules spelled out in detail in `CLAUDE_CODE_PROMPT.md` (system font
stack, HIG type scale, 8-point grid, grouped inset lists, Apple system colors with dark mode,
segmented controls/switches/sheets, SVG charts with a Swift-Charts feel, spring motion
respecting `prefers-reduced-motion`, no gradients/emoji/glassmorphism/Apple branding). CSS
modules with design tokens — no UI kit, no Tailwind (already decided, don't relitigate).

**Note**: a user turn mid-session asked to confirm the build was "in React JS" — they clarified
they just meant "React is fine, keep TypeScript" (not "drop TypeScript"). Don't rewrite anything
to plain JS; the TS-strict decision stands.

### Phase 6 — CSV compare + figure export
`src/core/compare/compare.ts` parses bench-log CSV, validates timestamps/test IDs, aligns relative
time, interpolates expected values, and calculates bias, RMSE and maximum absolute error. The
Compare page exports residual CSV and labeled SVG figures, and distinguishes model-to-model from
model-to-measurement results. Expected trace files must currently be supplied by the user.

### Phase 7 — Vercel deployment
`vercel.json` configures the Vite build, `dist` output and SPA deep-link rewrite. `README.md`
documents local development, checks, trace comparison and deployment. A production deployment
has not been published: this workspace has no Git repository or linked Vercel project/account.

### Remaining simulator work
- Build scenario-specific orchestration for T0–T6 and T8–T14, preserving the test plan's
  calibration, fitting and held-out validation boundaries.
- Feed T8 OCV data, T9 resistance/pulse data and T12 thermal data into the cell profile, then
  rerun the T7 preview with those measured values and compare against held-out bench data.
- Add measured hardware settings: module MCP4725 address, actual fuse identity/curve, installed
  BMS thresholds and delay, DS18B20 probe lag, and the installed heatsink response for T6 cutoff.
- Connect charging/relay behavior, fuse model, heatsink cutoff and EKF only when their required
  inputs and independent measurement streams are available.
- Consider moving longer runs into a Web Worker; the current interactive preview is intentionally
  limited to 900 seconds.
- Connect the browser UI to physical BLE hardware only after the simulation behavior is finalized.

## Hardware details to resolve when building the rig
The user does not have a physical rig yet and plans to build one after trying this simulation.
Do not block the model-only demo on these details; keep any unverified hardware values marked as
provisional and update them when parts are selected or measured.

From `CLAUDE_CODE_PROMPT.md`'s "Ask me, do not guess" list, still unanswered as of this handoff:
- MCP4725 I2C address as reported by `i2cdetect` (0x60 assumed, some modules are 0x62 — VERIFY).
- The charger's measured open-circuit voltage (test T0a).
- BMS board thresholds if/when T0b is run (currently seller-listing values, VERIFY).
- Which heatsink was actually bought, and whether the 10 Ω 50 W resistor is aluminium-housed or
  ceramic (changes whether it can be bolted to the shared heatsink).
- The cell's internal resistance (no manufacturer figure exists for the bare DMEGC 26E) — stays
  provisional until T9 data arrives.
- Plus the remaining hardware gaps listed above: exact installed fuse, DS18B20 probe-lag time
  constant, BMS balance threshold/UV delay, and heatsink thermal response. INA226 and ADS1115
  timing now have datasheet-based power-on defaults but still need firmware configuration checks.

## BLE and app scope
BLE hardware and a companion app are not required to finish or demonstrate the browser simulation.
The existing BLE page models authentication behavior locally; it does not connect to a radio.
After simulation validation, a real device connection will need a BLE central/client and a platform
that supports the required BLE APIs. A phone app is one option; a browser-based client may work on
supported browser/OS combinations. Decide that transport/platform after the simulation is stable.

## Component research
See `docs/COMPONENT_PARAMETER_RESEARCH.md` for manufacturer sources, exact modeled defaults,
limitations, and component values that remain unresolved. Do not promote replacement-candidate or
provisional values to verified BOM data without checking the installed rig.

## Operational notes for whoever continues this
- A "Fact-Forcing Gate" pre-tool hook is active in this environment: before the *first* Write to
  any given file path in a session, it demands a short justification (callers, API, data schema,
  the user's verbatim instruction) be stated in the response text immediately before the tool
  call, or the write is denied. It does not block edits to already-touched files. If your
  environment doesn't have this hook, ignore this note.
- Work has proceeded in phases, each ending with a full verification run (see "Current
  verification status" above) before reporting back and waiting for a "go ahead" from the user
  before starting the next phase — that cadence seems to be what the user wants; consider
  keeping it rather than batching multiple phases silently.
- Every constant added must carry `source`/`ref` per `Parameter<T>` in
  `src/core/config/provenance.ts` — do not add a bare number to any model file.

