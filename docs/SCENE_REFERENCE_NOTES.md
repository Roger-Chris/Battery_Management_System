# 3D scene reference notes

The scene reconstruction uses the two supplied images saved in `docs/reference-images/`:

- `ref_bench_layout.png` provides the component placement, wire colour key and approximate footprint scale (one grid square represents 10 mm).
- `ref_ui_frame.png` is a visual reference for the simulation presentation.

The prompt-style `SCENE_PROMPT.md` inside the supplied archive was treated as reference material, not as an independent instruction to implement its separate eight-scenario plan. The browser scene now offers nine previews: six basic discharge conditions, an 8-second 0.4/1.25 A pulsed load, a 65% SOC CC/CV charge cycle, and a warm-cell charging cutoff. The charge cycle uses the existing CC/CV charger, software over-voltage and 45 °C charge-temperature limits, cell equivalent-circuit and two-node thermal models, DS18B20 quantization, and relay command. The warm-cell case starts at 44 °C ambient/cell temperature and reaches the modeled 45 °C limit before playback ends. Cutoff stays latched for the remainder of that preview. Charge heating and cutoff are illustrative because cell resistance and thermal response remain provisional placeholders pending T9/T12 measurement. These are visual previews, not complete or validated test procedures; fuse transients, heatsink cut-off and EKF correction remain unmodeled. Sensor-fault and BLE cases are not represented by the supplied bench-layout image or this simulator path.

The scene uses the explicit dimensions listed in the supplied notes for the 18650 cells, holder, breadboard, Raspberry Pi, heatsink resistor and Pi board where available. Other module footprints and placements are estimates read from the top-down drawing. No phone photos, exact module measurements or bench measurements were included, so surface artwork, connector details and estimated dimensions remain illustrative. Replace those estimates when the parts are available for measurement.

Scene scale is 1 world unit per 10 mm. The top-down image is mapped using its approximate 30-pixel grid spacing; this reproduces the overall layout but does not establish surveyed coordinates or electrical pin locations. The wire routes follow the drawn colour-coded paths and remain a visual reconstruction, not an authoritative manufacturing netlist.

