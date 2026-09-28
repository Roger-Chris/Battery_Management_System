# 3D scene reference notes

The scene reconstruction uses the two supplied images saved in `docs/reference-images/`:

- `ref_bench_layout.png` provides the component placement, wire colour key and approximate footprint scale (one grid square represents 10 mm).
- `ref_ui_frame.png` is a visual reference for the simulation presentation.

The prompt-style `SCENE_PROMPT.md` inside the supplied archive was treated as reference material, not as an independent instruction to implement its separate eight-scenario plan. The browser scene offers six connected discharge-model presets: no-load baseline, 0.4 A light load, nominal 1.0 A T7-style load, 1.25 A current limit, 25% starting SOC, and 45 °C ambient. Each one varies only constant discharge current, starting SOC, or ambient temperature in the existing model. They are useful visual previews, not six independently validated test procedures. Charging/relay control, fuse transients, heatsink cut-off and EKF correction remain unmodeled; sensor-fault and BLE scenarios are not represented by the supplied bench-layout image or this discharge model.

The scene uses the explicit dimensions listed in the supplied notes for the 18650 cells, holder, breadboard, Raspberry Pi, heatsink resistor and Pi board where available. Other module footprints and placements are estimates read from the top-down drawing. No phone photos, exact module measurements or bench measurements were included, so surface artwork, connector details and estimated dimensions remain illustrative. Replace those estimates when the parts are available for measurement.

Scene scale is 1 world unit per 10 mm. The top-down image is mapped using its approximate 30-pixel grid spacing; this reproduces the overall layout but does not establish surveyed coordinates or electrical pin locations. The wire routes follow the drawn colour-coded paths and remain a visual reconstruction, not an authoritative manufacturing netlist.

