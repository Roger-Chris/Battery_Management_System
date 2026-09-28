# 3D scene reference notes

The scene reconstruction uses the two supplied images saved in `docs/reference-images/`:

- `ref_bench_layout.png` provides the component placement, wire colour key and approximate footprint scale (one grid square represents 10 mm).
- `ref_ui_frame.png` is a visual reference for the simulation presentation.

The prompt-style `SCENE_PROMPT.md` inside the supplied archive was treated as reference material, not as an independent instruction to implement its separate eight-scenario plan. The browser scene currently animates the connected T7 discharge model. Charging, thermal cut-off, sensor-fault and BLE scenarios are not implied by the picture or by the current animation.

The scene uses the explicit dimensions listed in the supplied notes for the 18650 cells, holder, breadboard, Raspberry Pi, heatsink resistor and Pi board where available. Other module footprints and placements are estimates read from the top-down drawing. No phone photos, exact module measurements or bench measurements were included, so surface artwork, connector details and estimated dimensions remain illustrative. Replace those estimates when the parts are available for measurement.

Scene scale is 1 world unit per 10 mm. The top-down image is mapped using its approximate 30-pixel grid spacing; this reproduces the overall layout but does not establish surveyed coordinates or electrical pin locations. The wire routes follow the drawn colour-coded paths and remain a visual reconstruction, not an authoritative manufacturing netlist.

