import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BOM } from "../core/config/bom";
import type { Parameter } from "../core/config/provenance";
import { runChargeSimulation, type ChargeSimulationSample } from "../core/sim/runCharge";
import { runDischargeSimulation, type DischargeSample } from "../core/sim/runDischarge";

type ComponentId = "pack" | "holder" | "bms" | "charger" | "relay" | "fuse" | "xt60" | "divider" | "adsA" | "adsB" | "inaPack" | "inaLoad" | "dac" | "opAmp" | "breadboard" | "mosfet" | "resistor" | "heatsink" | "fan" | "pi" | "hub" | "adapter" | "probes";
interface ComponentInfo { id: ComponentId; name: string; kind: string; description: string; location: THREE.Vector3; }
type ConditionId = "idle" | "light" | "t7" | "ceiling" | "low-soc" | "warm" | "pulse" | "charge" | "charge-hot" | "runaway" | "runaway-extended";
interface PreviewCondition { title: string; summary: string; mode: "discharge" | "charge"; currentA: number; initialSoc: number; ambientC: number; durationS: number; initialCellTempC?: number; thermalRunawayDemo?: boolean; }
interface PreviewControls { currentA: number; initialSoc: number; ambientC: number; initialCellTempC: number; chargerSetpointV: number; }
const controlsFor = (condition: PreviewCondition): PreviewControls => ({ currentA: condition.currentA, initialSoc: condition.initialSoc, ambientC: condition.ambientC, initialCellTempC: condition.initialCellTempC ?? condition.ambientC, chargerSetpointV: 16.8 });
const CONDITIONS: Record<ConditionId, PreviewCondition> = {
  idle: { title: "No-load baseline", mode: "discharge", currentA: 0, initialSoc: 1, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "Checks the model's open-load voltage and sensor baseline." },
  light: { title: "Light load · 0.4 A", mode: "discharge", currentA: 0.4, initialSoc: 1, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "Shows pack sag and telemetry under a light constant load." },
  t7: { title: "T7 capacity preview · 1.0 A", mode: "discharge", currentA: 1, initialSoc: 1, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "The existing provisional T7-style constant-current discharge preview." },
  ceiling: { title: "Load ceiling · 1.25 A", mode: "discharge", currentA: 1.25, initialSoc: 1, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "Runs at the simulator's configured firmware current limit." },
  "low-soc": { title: "Low starting charge · 25%", mode: "discharge", currentA: 1, initialSoc: 0.25, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "Starts with a partly discharged pack to observe voltage and protection readouts." },
  warm: { title: "Warm ambient discharge · 45 °C", mode: "discharge", currentA: 1, initialSoc: 1, ambientC: 45, durationS: 300, summary: "Repeats the nominal load with a warmer ambient temperature input." },
  pulse: { title: "Load pulse train · 0.4 ↔ 1.25 A", mode: "discharge", currentA: 1.25, initialSoc: 0.8, ambientC: BOM.thermalDesign.ambientC.value, durationS: 300, summary: "Steps the electronic load every 8 seconds to show voltage sag and recovery." },
  charge: { title: "Charge cycle · CC to CV taper", mode: "charge", currentA: 2, initialSoc: 0.65, ambientC: 25, initialCellTempC: 25, durationS: 2400, summary: "Runs the charger model from constant-current charging into a voltage-limited taper." },
  "charge-hot": { title: "Warm-cell charge · 45 °C cutoff", mode: "charge", currentA: 2, initialSoc: 0.65, ambientC: 44, initialCellTempC: 44, durationS: 600, summary: "A warm-start cell heats under charge; the software limit opens the charge relay at 45 °C." },
  runaway: { title: "Cutoff failure · thermal runaway visual", mode: "charge", currentA: 2, initialSoc: 0.65, ambientC: 25, initialCellTempC: 49, durationS: 120, thermalRunawayDemo: true, summary: "A short, explicitly fault-injected sequence raises cell temperature into the visual fire response." },
  "runaway-extended": { title: "Extended thermal runaway · 10 min", mode: "charge", currentA: 2, initialSoc: 0.65, ambientC: 25, initialCellTempC: 49, durationS: 600, thermalRunawayDemo: true, summary: "A 10-minute fault-injected playback shows temperature rise, ignition, smoke and sustained flames alongside the live telemetry." },
};
const FIRE_IGNITION_TEMP_C = 55;
const parameterAt = <T,>(parameter: Parameter<T>, value: T): Parameter<T> => ({ ...parameter, value });
type DischargeRigSample = DischargeSample & { mode: "discharge"; charge_current_a: 0; charge_relay_closed: false; charger_phase: "idle"; charge_cutoff_reason: null; cell_core_temp_c: number };
type RigSample = DischargeRigSample | ChargeSimulationSample;
interface RigSimulationResult { durationS: number; samples: RigSample[]; warnings: string[]; }

// The supplied top-down drawing uses a 10 mm grid. Its grid spacing is about 30 px.
const layoutPoint = (px: number, py: number, height = 0) => new THREE.Vector3((px - 850) / 30, height, (600 - py) / 30);
const mm = (value: number) => value / 10;
const PARTS: ComponentInfo[] = [
  { id: "pack", name: "Four 18650 cells", kind: "4S1P · DMEGC INR18650-26E", description: "Four distinct pink wrapped 18650 cells. The cell profile drives the provisional discharge readings; the wrap colour and form follow the supplied bench layout.", location: layoutPoint(260, 610) },
  { id: "holder", name: "4S cell holder", kind: "ABS holder · estimated 86 × 78 mm", description: "Black four-cell holder with spring contacts and red/black pack leads. Holder dimensions are estimates from the supplied component notes.", location: layoutPoint(260, 610) },
  { id: "bms", name: "4S 40 A BMS", kind: "Blue protection board · size estimated", description: "Protection board with visible MOSFET packages and balance connector. The exact board and protection thresholds still need physical verification.", location: layoutPoint(516, 570) },
  { id: "charger", name: "16.8 V / 2 A charger", kind: "Charger brick · estimated placement", description: "Charger brick shown in the reference layout. Charging behavior is not part of the current T7 discharge playback.", location: layoutPoint(258, 239) },
  { id: "relay", name: "5 V / 10 A relay", kind: "Charge path", description: "Relay sits between the charger and battery charge path. It remains idle in the current discharge scenario.", location: layoutPoint(570, 215) },
  { id: "fuse", name: "5 A ATO fuse holder", kind: "Pack protection", description: "Replaceable ATO fuse holder on the battery positive path. Fuse trip behavior is not simulated.", location: layoutPoint(486, 728) },
  { id: "xt60", name: "XT60 connector", kind: "Pack connector", description: "Pack connector shown beside the fuse holder, following the reference layout.", location: layoutPoint(615, 727) },
  { id: "divider", name: "Cell tap resistor ladder", kind: "1 MΩ / 200 kΩ network", description: "Resistor ladder scales the four cell taps for voltage measurement. The board and resistor locations are illustrative.", location: layoutPoint(735, 775) },
  { id: "adsA", name: "ADS1115 · 0x48", kind: "Cell tap ADC · channels 1–2", description: "First ADC module samples the first two cell taps. Its physical address straps still need checking.", location: layoutPoint(729, 716) },
  { id: "adsB", name: "ADS1115 · 0x49", kind: "Cell tap ADC · channels 3–4", description: "Second ADC module samples the remaining taps. Its physical address straps still need checking.", location: layoutPoint(824, 716) },
  { id: "inaPack", name: "INA226 · pack", kind: "0x40 · pack current and voltage", description: "Pack-side current monitor, including the visible precision shunt. Module dimensions are estimated from the reference drawing.", location: layoutPoint(725, 500) },
  { id: "inaLoad", name: "INA226 · load", kind: "0x41 · load current", description: "Load-side current monitor with a visible shunt. Its simulated current follows the T7 discharge trace.", location: layoutPoint(982, 500) },
  { id: "hub", name: "I²C hub", kind: "Sensor bus junction", description: "Central I²C junction shown in the supplied wiring plan. It represents the bus routing, not an additional confirmed part number.", location: layoutPoint(1080, 290) },
  { id: "pi", name: "Raspberry Pi 5", kind: "85 × 56 mm · active cooler", description: "Edge controller with GPIO header, active cooler, USB and Ethernet ports. The scene does not connect to a physical Pi.", location: layoutPoint(1340, 280) },
  { id: "breadboard", name: "Breadboard", kind: "165 × 55 mm", description: "Solderless breadboard carrying the ADC modules, DAC, op-amp and divider components, with a visible tie-point field.", location: layoutPoint(922, 760) },
  { id: "dac", name: "MCP4725 DAC", kind: "12-bit load command", description: "Converts the Pi's command to an analog setpoint for the electronic-load control loop.", location: layoutPoint(922, 720) },
  { id: "opAmp", name: "LM358 control stage", kind: "Breadboard circuit", description: "The op-amp conditions the DAC signal for the MOSFET gate. The circuit geometry is illustrative.", location: layoutPoint(990, 720) },
  { id: "heatsink", name: "Load heatsink", kind: "Extruded aluminium · dimensions estimated", description: "Shared cooling plate beneath the load MOSFET and power resistor. Its thermal response is not characterized yet.", location: layoutPoint(1360, 695) },
  { id: "fan", name: "12 V cooling fan", kind: "Fan · animated with scene time", description: "Fan is shown beside the heatsink as in the reference layout. It spins during the running demo; airflow is not simulated.", location: layoutPoint(1360, 950) },
  { id: "mosfet", name: "IRLZ44N MOSFET", kind: "TO-220 · electronic load", description: "The MOSFET switches the electronic load and shares the heatsink. Gate-control and cutoff behavior are simplified for this preview.", location: layoutPoint(1290, 655) },
  { id: "resistor", name: "10 Ω / 50 W resistor", kind: "Aluminium-housed · estimated 49 × 28 mm", description: "Gold aluminium-housed power resistor bolted to the heatsink, as shown in the supplied reference. Confirm the actual package on the physical part.", location: layoutPoint(1370, 690) },
  { id: "adapter", name: "12 V adapter", kind: "Fan and control supply", description: "Separate 12 V adapter for the fan and LM358 supply, matching the supplied wiring layout.", location: layoutPoint(1050, 1050) },
  { id: "probes", name: "3 × DS18B20 probes", kind: "Cell · heatsink · ambient", description: "One probe sits on cell 2 under a small Kapton patch, one is on the heatsink, and one hangs free for ambient temperature.", location: layoutPoint(245, 590) },
];

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas"); canvas.width = 720; canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(17, 20, 26, 0.94)"; ctx.beginPath(); ctx.roundRect(8, 8, 704, 112, 22); ctx.fill();
  ctx.strokeStyle = "rgba(90, 160, 255, .8)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = "600 42px system-ui, sans-serif"; ctx.fillStyle = "#f7f8fa"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 360, 64, 670);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(5.6, 1.0, 1); sprite.renderOrder = 20; sprite.visible = false; return sprite;
}

function useTelemetry(samples: RigSample[], resetKey: string) {
  const [index, setIndex] = useState(0); const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); setIndex(0); }, [resetKey]);
  useEffect(() => {
    if (!playing || samples.length < 2) return;
    const timer = window.setInterval(() => setIndex((previous) => {
      if (previous >= samples.length - 1) { window.clearInterval(timer); setPlaying(false); return previous; }
      return previous + 1;
    }), 100);
    return () => window.clearInterval(timer);
  }, [playing, samples.length]);
  return { index, setIndex, playing, setPlaying, sample: samples[Math.min(index, samples.length - 1)]! };
}

export default function RigScene3D() {
  const hostRef = useRef<HTMLDivElement>(null); const telemetryRef = useRef<RigSample | null>(null);
  const runawayDemoRef = useRef(false);
  const [conditionId, setConditionId] = useState<ConditionId>("t7");
  const condition = CONDITIONS[conditionId];
  const [draft, setDraft] = useState<PreviewControls>(() => controlsFor(CONDITIONS.t7));
  const [applied, setApplied] = useState<PreviewControls>(() => controlsFor(CONDITIONS.t7));
  const [applyFeedback, setApplyFeedback] = useState(false);
  const [autoPlayExtended, setAutoPlayExtended] = useState(false);
  const resetKey = `${conditionId}:${applied.currentA}:${applied.initialSoc}:${applied.ambientC}:${applied.initialCellTempC}:${applied.chargerSetpointV}`;
  const result = useMemo<RigSimulationResult>(() => {
    const testId = `PREVIEW-${conditionId.toUpperCase()}`;
    if (condition.mode === "charge") return runChargeSimulation({
      testId,
      durationS: condition.durationS,
      initialSoc: applied.initialSoc,
      initialCellTempC: applied.initialCellTempC,
      ambientC: applied.ambientC,
      requestedCurrentA: applied.currentA,
      chargerSetpointV: applied.chargerSetpointV,
      thermalRunawayDemo: condition.thermalRunawayDemo,
    });
    const discharge = runDischargeSimulation({
      testId,
      durationS: parameterAt(BOM.simulation.demoDurationS, condition.durationS),
      initialSoc: parameterAt(BOM.simulation.initialSoc, applied.initialSoc),
      dischargeCurrentA: parameterAt(BOM.simulation.dischargeCurrentA, applied.currentA),
      ambientC: parameterAt(BOM.thermalDesign.ambientC, applied.ambientC),
      initialCellTempC: parameterAt(BOM.thermalDesign.ambientC, applied.initialCellTempC),
      currentProfile: conditionId === "pulse" ? (timeS) => Math.floor(timeS / 8) % 2 === 0 ? applied.currentA * 0.32 : applied.currentA : undefined,
    });
    return {
      ...discharge,
      samples: discharge.samples.map((sample): DischargeRigSample => ({
        ...sample, mode: "discharge", charge_current_a: 0, charge_relay_closed: false,
        charger_phase: "idle", charge_cutoff_reason: null, cell_core_temp_c: sample.cell_core_temp_c,
      })),
    };
  }, [conditionId, condition, applied]);
  const playback = useTelemetry(result.samples, resetKey); const [sceneError, setSceneError] = useState("");
  const sample = playback.sample;
  telemetryRef.current = sample;
  runawayDemoRef.current = Boolean(condition.thermalRunawayDemo);
  useEffect(() => {
    if (!autoPlayExtended) return;
    playback.setIndex(0);
    playback.setPlaying(true);
    setAutoPlayExtended(false);
  }, [autoPlayExtended, playback.setIndex, playback.setPlaying]);

  const launchExtendedDemo = () => {
    const nextId: ConditionId = "runaway-extended";
    const defaults = controlsFor(CONDITIONS[nextId]);
    playback.setPlaying(false);
    setConditionId(nextId);
    setDraft(defaults);
    setApplied(defaults);
    setAutoPlayExtended(true);
  };

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" }); }
    catch { setSceneError("This browser could not start WebGL. Try a browser with hardware acceleration enabled."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#17191c"); scene.fog = new THREE.Fog("#17191c", 84, 155);
    const target = layoutPoint(825, 625, 0);
    const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, .1, 250);
    const cameraDirection = new THREE.Vector3(.52, .94, .64).normalize();
    const fitCamera = () => {
      const aspect = Math.max(host.clientWidth / Math.max(host.clientHeight, 1), .5);
      const vertical = 35 * Math.PI / 180, horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
      const projectedWidth = 55 * .82 + 35 * .57;
      const projectedDepth = 34;
      const distance = Math.max(projectedWidth / (2 * Math.tan(horizontal / 2)), projectedDepth / (2 * Math.tan(vertical / 2))) * 1.12;
      camera.position.copy(target).addScaledVector(cameraDirection, distance); camera.lookAt(target); camera.updateProjectionMatrix();
    };
    fitCamera();
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = .075; controls.minDistance = 31; controls.maxDistance = 112; controls.maxPolarAngle = Math.PI * .48;
    scene.add(new THREE.HemisphereLight(0xe6edff, 0x29241f, 2.0));
    const key = new THREE.DirectionalLight(0xfff4df, 3.1); key.position.set(-24, 42, 32); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -38; key.shadow.camera.right = 38; key.shadow.camera.top = 30; key.shadow.camera.bottom = -30; key.shadow.bias = -.00025; scene.add(key);
    const fill = new THREE.DirectionalLight(0xb4d6ff, 1.5); fill.position.set(36, 24, -24); scene.add(fill);
    const rim = new THREE.PointLight(0xffaa69, 22, 52); rim.position.set(14, 12, -8); scene.add(rim);

    const mat = (color: THREE.ColorRepresentation, roughness = .62, metalness = .05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const materials = {
      bench: mat(0x40372f, .9), tile: mat(0xd9d5cc, .88), tileEdge: mat(0x8f8b83, .8), holder: mat(0x17191d, .66), pink: mat(0xd981a4, .38), pinkEdge: mat(0xb65377, .55), steel: mat(0xb8bec5, .25, .84), gold: mat(0xd1ae57, .32, .7), green: mat(0x1c7b50, .58, .18), blue: mat(0x2167ae, .52, .18), purple: mat(0x69459b, .5, .16), white: mat(0xe8e5dd, .76), black: mat(0x171b20, .35, .25), chip: mat(0x222830, .32, .36), cableRed: mat(0xc83930, .5), cableBlack: mat(0x171a1e, .48), wireBlue: mat(0x3182e8, .48), wireYellow: mat(0xe7b83c, .48), wireOrange: mat(0xe5822e, .48), wireGreen: mat(0x29975b, .48), wirePurple: mat(0x8e56b8, .48), wireGray: mat(0x91959b, .5), fan: mat(0x242a30, .46, .2), resistor: mat(0xcaa448, .38, .35), wood: mat(0x74553c, .84), probe: mat(0xa6b0b8, .34, .7), resistorBody: mat(0xd2bd93, .48, .14), pcbBlack: mat(0x20252c, .32, .25), led: mat(0x53d68a, .23, .08), red: mat(0xc6443c, .55), blueStripe: mat(0x466ca7, .55),
    };
    const clickable: THREE.Object3D[] = []; const groups = new Map<ComponentId, THREE.Group>(); const labels = new Map<ComponentId, THREE.Sprite>();
    const cellWraps: THREE.MeshStandardMaterial[] = [];
    const box = (parent: THREE.Object3D, id: ComponentId | undefined, size: [number, number, number], pos: [number, number, number], material: THREE.Material, pick = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
      if (id) mesh.userData.componentId = id; parent.add(mesh); if (id && pick) clickable.push(mesh); return mesh;
    };
    const cyl = (parent: THREE.Object3D, id: ComponentId | undefined, rTop: number, rBottom: number, depth: number, pos: [number, number, number], material: THREE.Material, radial = 16, pick = true) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, depth, radial), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
      if (id) mesh.userData.componentId = id; parent.add(mesh); if (id && pick) clickable.push(mesh); return mesh;
    };
    const partGroup = (id: ComponentId, px: number, py: number, label: string, labelY = 2.2) => {
      const group = new THREE.Group(); group.position.copy(layoutPoint(px, py)); group.userData.componentId = id; scene.add(group); groups.set(id, group);
      const tag = labelSprite(label); tag.position.set(0, labelY, 0); group.add(tag); labels.set(id, tag); return group;
    };
    const board = (id: ComponentId, px: number, py: number, wMm: number, dMm: number, color: THREE.Material, label: string, chipCount = 1) => {
      const group = partGroup(id, px, py, label, 1.45); box(group, id, [mm(wMm), .16, mm(dMm)], [0, .18, 0], color);
      for (let n = 0; n < chipCount; n++) {
        const x = (n - (chipCount - 1) / 2) * Math.min(mm(wMm) * .31, 1.1);
        box(group, id, [Math.min(mm(wMm) * .25, .74), .14, Math.min(mm(dMm) * .3, .65)], [x, .33, 0], materials.chip);
      }
      const pinCount = Math.min(Math.floor(wMm / 2.54), 16); const pinMat = materials.gold;
      for (let n = 0; n < pinCount; n++) {
        const x = -mm(wMm) * .43 + (pinCount > 1 ? n * (mm(wMm) * .86) / (pinCount - 1) : 0);
        for (const z of [-mm(dMm) * .44, mm(dMm) * .44]) cyl(group, id, .035, .035, .23, [x, .01, z], pinMat, 6);
      }
      return group;
    };
    const tileCenter = layoutPoint(371, 697);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(54, .28, 34), materials.wood); bench.position.copy(target); bench.position.y = -.36; bench.receiveShadow = true; bench.castShadow = true; scene.add(bench);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(20, .18, 20), materials.tile); tile.position.copy(tileCenter); tile.position.y = -.12; tile.receiveShadow = true; tile.castShadow = true; scene.add(tile);
    for (const dx of [-9.8, 9.8]) { const seam = new THREE.Mesh(new THREE.BoxGeometry(.035, .012, 19.8), materials.tileEdge); seam.position.set(tileCenter.x + dx, -.02, tileCenter.z); scene.add(seam); }
    for (const dz of [-9.8, 9.8]) { const seam = new THREE.Mesh(new THREE.BoxGeometry(19.8, .012, .035), materials.tileEdge); seam.position.set(tileCenter.x, -.02, tileCenter.z + dz); scene.add(seam); }

    // 4S1P pack: holder and four individually wrapped cells at 18650 proportions.
    const holder = partGroup("holder", 260, 610, "4S1P · ABS CELL HOLDER", 4.15);
    box(holder, "holder", [8.6, .38, 7.8], [0, .19, 0], materials.holder);
    const holderRim = mat(0x262a2f, .72);
    for (const x of [-4.18, 4.18]) box(holder, "holder", [.22, .4, 7.75], [x, .38, 0], holderRim);
    for (const z of [-3.78, 3.78]) box(holder, "holder", [8.35, .4, .22], [0, .38, z], holderRim);
    const pack = partGroup("pack", 260, 610, "DMEGC INR18650-26E · 4S1P", 5.15);
    const batteryXs = [-2.82, -.94, .94, 2.82];
    batteryXs.forEach((x, index) => {
      const wrap = materials.pink.clone(); cellWraps.push(wrap);
      const cell = cyl(pack, "pack", mm(18.45) / 2, mm(18.45) / 2, mm(65.2), [x, .96, 0], wrap, 32); cell.rotation.x = Math.PI / 2;
      for (const z of [-mm(65.2) / 2, mm(65.2) / 2]) {
        const ring = cyl(pack, "pack", mm(18.45) / 2 + .015, mm(18.45) / 2 + .015, .06, [x, .96, z], materials.pinkEdge, 32); ring.rotation.x = Math.PI / 2;
        const cap = cyl(pack, "pack", mm(15.5) / 2, mm(15.5) / 2, .035, [x, .96, z + (z > 0 ? .035 : -.035)], materials.steel, 24); cap.rotation.x = Math.PI / 2;
      }
      const button = cyl(pack, "pack", .23, .23, .10, [x, 1.02, 3.32], materials.steel, 20); button.rotation.x = Math.PI / 2;
      const cradle = box(holder, "holder", [1.74, .14, 6.8], [x, .49, 0], holderRim, false); cradle.receiveShadow = true;
      for (const end of [-1, 1]) {
        const spring = cyl(holder, "holder", .16, .2, .18, [x, .62, end * 3.52], materials.steel, 12, false); spring.rotation.x = Math.PI / 2;
      }
      void index;
    });
    // Cell 2 probe and Kapton patch.
    const patch = box(pack, undefined, [.58, .035, .7], [-.94, 1.91, .22], mat(0xd8b76c, .72), false); patch.rotation.y = -.13;
    const cellProbe = partGroup("probes", 245, 590, "DS18B20 #1 · CELL 2", 3.05);
    cyl(cellProbe, "probes", .18, .18, .62, [0, 1.92, .22], materials.probe, 20); box(cellProbe, "probes", [.14, .08, 1.1], [0, 1.85, -.35], materials.wireGray, false);

    // Blue protection board, MOSFET bank and five-wire balance connector.
    const bms = board("bms", 516, 570, 60, 45, materials.blue, "4S BMS · 40 A LISTING", 2);
    for (let n = 0; n < 4; n++) box(bms, "bms", [.72, .1, .62], [-1.7 + n * 1.12, .34, .65], materials.pcbBlack);
    box(bms, "bms", [1.4, .2, .55], [0, .34, -1.5], materials.white);
    box(bms, "bms", [2.0, .3, .38], [1.55, .43, -1.55], materials.white);
    for (let n = 0; n < 5; n++) cyl(bms, "bms", .045, .045, .45, [.83 + n * .36, .28, -1.45], materials.gold, 8);

    // Charger brick, relay, fuse holder and XT60 pack connector.
    const charger = partGroup("charger", 258, 239, "16.8 V · 2 A CHARGER", 4.0);
    box(charger, "charger", [12, 1.85, 5.8], [0, .92, 0], materials.black);
    box(charger, "charger", [2.8, .5, .45], [2.8, 1.05, 2.92], materials.steel, false);
    const relay = board("relay", 570, 215, 50, 26, materials.blue, "5 V · 10 A RELAY", 1);
    box(relay, "relay", [2.0, .28, 1.4], [-.7, .44, 0], materials.chip);
    const relayLedMat = new THREE.MeshStandardMaterial({ color: 0x68717b, emissive: 0x17191c, emissiveIntensity: .3, roughness: .25 });
    const relayLed = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10), relayLedMat); relayLed.position.set(1.55, .5, .2); relay.add(relayLed);
    const heatGlow = new THREE.Color(0xf15a24);
    const fireGroup = new THREE.Group(); fireGroup.position.copy(pack.position); fireGroup.visible = false; scene.add(fireGroup);
    const flameMaterials = [0xff3b0a, 0xff7612, 0xffc52e].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.38 + (i % 3) * .09, 1.45 + (i % 4) * .28, 8), flameMaterials[i % flameMaterials.length]!);
      flame.position.set(-3.1 + (i % 5) * 1.5, 2.35 + (i % 3) * .18, (i % 2 ? 1 : -1) * (1.05 + (i % 3) * .42)); fireGroup.add(flame); flames.push(flame);
    }
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x4a4140, transparent: true, opacity: .28, depthWrite: false });
    const smoke: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(.28 + (i % 3) * .12, 8, 7), smokeMaterial.clone());
      puff.userData.phase = i / 7; puff.position.set(-2.5 + (i % 4) * 1.35, 3.0, (i % 2 ? .8 : -.8)); fireGroup.add(puff); smoke.push(puff);
    }
    const fireLight = new THREE.PointLight(0xff551a, 0, 18, 2); fireLight.position.copy(pack.position).add(new THREE.Vector3(0, 3.6, 0)); scene.add(fireLight);
    const fuse = partGroup("fuse", 486, 728, "5 A ATO FUSE", 2.0);
    box(fuse, "fuse", [3.5, .5, 1.25], [0, .25, 0], materials.black);
    box(fuse, "fuse", [1.5, .3, .82], [0, .62, 0], materials.red);
    box(fuse, "fuse", [.65, .12, .54], [0, .84, 0], materials.gold);
    const xt60 = partGroup("xt60", 615, 727, "XT60 PACK CONNECTOR", 1.75);
    const xt = cyl(xt60, "xt60", .67, .72, 1.55, [0, .38, 0], materials.gold, 6); xt.rotation.x = Math.PI / 2;
    box(xt60, "xt60", [1.25, .15, .28], [0, .72, .72], materials.cableRed);

    // Two shunt-monitor modules, with their metal 2512 shunts visible.
    const inaPack = board("inaPack", 725, 500, 25, 20, materials.purple, "INA226 · PACK · 0x40", 1);
    box(inaPack, "inaPack", [.82, .11, .38], [.56, .43, 0], materials.steel); box(inaPack, "inaPack", [.18, .025, .42], [.56, .5, 0], materials.gold);
    const inaLoad = board("inaLoad", 982, 500, 25, 20, materials.purple, "INA226 · LOAD · 0x41", 1);
    box(inaLoad, "inaLoad", [.82, .11, .38], [.56, .43, 0], materials.steel); box(inaLoad, "inaLoad", [.18, .025, .42], [.56, .5, 0], materials.gold);

    // Full-size 165 × 55 mm breadboard with a low-cost instanced tie-point field.
    const breadboard = partGroup("breadboard", 922, 760, "165 × 55 mm BREADBOARD", 2.0);
    box(breadboard, "breadboard", [16.5, .34, 5.5], [0, .17, 0], materials.white);
    for (const z of [-2.25, -1.95, 1.95, 2.25]) box(breadboard, "breadboard", [15.6, .025, .035], [0, .35, z], z < 0 ? materials.red : materials.blueStripe, false);
    const holeGeometry = new THREE.CylinderGeometry(.038, .038, .025, 7); const holeMesh = new THREE.InstancedMesh(holeGeometry, mat(0x85847f, .84), 854); const dummy = new THREE.Object3D(); let hole = 0;
    for (const centerZ of [-.95, .95]) for (let col = 0; col < 61; col++) for (let row = 0; row < 5; row++) {
      dummy.position.set(-7.5 + col * .25, .36, centerZ - .5 + row * .25); dummy.updateMatrix(); holeMesh.setMatrixAt(hole++, dummy.matrix);
    }
    for (const z of [-2.05, -2.32, 2.05, 2.32]) for (let col = 0; col < 61; col++) {
      dummy.position.set(-7.5 + col * .25, .36, z); dummy.updateMatrix(); holeMesh.setMatrixAt(hole++, dummy.matrix);
    }
    holeMesh.count = hole; holeMesh.castShadow = false; holeMesh.receiveShadow = true; breadboard.add(holeMesh);
    const divider = board("divider", 735, 775, 36, 13, materials.white, "1 MΩ / 200 kΩ TAP LADDER", 0);
    for (let n = 0; n < 4; n++) {
      const z = -.55 + n * .36;
      const axial = cyl(divider, "divider", .12, .12, 1.0, [-1.05 + n * .67, .47, z], materials.resistorBody, 12); axial.rotation.z = Math.PI / 2;
      for (let band = -1; band <= 1; band++) { const color = band === 0 ? (n % 2 ? materials.red : materials.pinkEdge) : materials.gold; const stripe = cyl(divider, "divider", .125, .125, .075, [-1.05 + n * .67 + band * .18, .47, z], color, 12); stripe.rotation.z = Math.PI / 2; }
    }
    board("adsA", 729, 716, 28, 18, materials.blue, "ADS1115 · 0x48", 1);
    board("adsB", 824, 716, 28, 18, materials.blue, "ADS1115 · 0x49", 1);
    board("dac", 922, 720, 24, 16, materials.green, "MCP4725 DAC", 1);
    const opAmp = board("opAmp", 990, 720, 30, 18, materials.green, "LM358 · CONTROL", 1);
    box(opAmp, "opAmp", [1.2, .14, .5], [0, .38, .65], materials.chip);
    const breadboardPart = groups.get("breadboard")!;
    // Axial resistors and DIP-8 LM358 on the breadboard.
    for (let n = 0; n < 5; n++) {
      const x = -4.5 + n * 1.28; const resistor = cyl(breadboardPart, "breadboard", .12, .12, .92, [x, .72, .15], materials.resistorBody, 12); resistor.rotation.z = Math.PI / 2;
      const stripeColors = [materials.pinkEdge, materials.black, materials.gold];
      for (let band = 0; band < 3; band++) { const stripe = cyl(breadboardPart, "breadboard", .125, .125, .075, [x - .21 + band * .2, .72, .15], stripeColors[band]!, 12); stripe.rotation.z = Math.PI / 2; }
    }

    // I²C hub board and a Raspberry Pi 5 scale model with recognizable connectors.
    board("hub", 1080, 290, 30, 20, materials.blue, "I²C HUB", 1);
    const pi = board("pi", 1340, 280, 85, 56, materials.green, "RASPBERRY PI 5 · 85 × 56 mm", 2);
    box(pi, "pi", [2.2, .18, 2.2], [-1.1, .39, .6], materials.chip);
    cyl(pi, "pi", .73, .73, .17, [-1.1, .51, .6], materials.fan, 32);
    for (let pin = 0; pin < 20; pin++) cyl(pi, "pi", .035, .035, .42, [-3.55 + pin * .25, .28, -2.0], materials.gold, 6);
    for (let port = 0; port < 4; port++) box(pi, "pi", [1.12, .63, .72], [2.5, .46, -1.55 + port * 1.05], port < 2 ? materials.steel : materials.black);
    box(pi, "pi", [1.45, .6, .95], [-3.0, .45, 1.7], materials.black);

    // Separate 12 V supply, extruded heatsink, TO-220 MOSFET, power resistor and fan.
    const adapter = partGroup("adapter", 1050, 1050, "12 V ADAPTER", 3.1);
    box(adapter, "adapter", [7.0, 1.25, 3.2], [0, .62, 0], materials.black);
    box(adapter, "adapter", [1.2, .25, .65], [2.8, .65, 0], materials.steel, false);
    const sink = partGroup("heatsink", 1360, 695, "LOAD HEATSINK · ALUMINIUM", 3.1);
    box(sink, "heatsink", [8.0, .48, 8.7], [0, .24, 0], mat(0x87919a, .32, .82));
    for (let n = -6; n <= 6; n++) box(sink, "heatsink", [.26, 1.05, 8.1], [n * .57, .96, 0], mat(0x68737d, .35, .76));
    const mosfet = partGroup("mosfet", 1290, 655, "IRLZ44N · TO-220", 2.7);
    box(mosfet, "mosfet", [1.0, 1.5, .42], [0, 1.62, 0], materials.pcbBlack);
    box(mosfet, "mosfet", [1.25, .12, .95], [0, 1.95, -.07], materials.steel);
    cyl(mosfet, "mosfet", .12, .12, .22, [0, 2.03, -.07], materials.black, 20);
    for (let pin = -1; pin <= 1; pin++) box(mosfet, "mosfet", [.09, .64, .09], [pin * .22, 1.12, .18], materials.gold);
    const resistor = partGroup("resistor", 1370, 690, "10 Ω · 50 W POWER RESISTOR", 2.8);
    box(resistor, "resistor", [4.9, 1.5, 2.8], [0, 1.42, 0], materials.resistor);
    box(resistor, "resistor", [4.1, .05, .12], [0, 2.2, -.35], materials.gold);
    for (const x of [-1.8, 1.8]) { cyl(resistor, "resistor", .15, .15, .18, [x, 2.2, .85], materials.steel, 16); }
    const fan = partGroup("fan", 1360, 950, "12 V FAN", 2.8);
    const fanRing = new THREE.Mesh(new THREE.TorusGeometry(1.82, .16, 12, 48), materials.fan); fanRing.rotation.x = Math.PI / 2; fanRing.position.set(0, .62, 0); fanRing.castShadow = true; fan.add(fanRing);
    cyl(fan, "fan", .42, .42, .35, [0, .72, 0], materials.steel, 24);
    const fanBlades = new THREE.Group(); fanBlades.position.set(0, .72, 0); fan.add(fanBlades); fan.userData.fanBlades = fanBlades;
    for (let blade = 0; blade < 7; blade++) { const vane = box(fanBlades, "fan", [.46, .13, 1.35], [0, .03, -1.05], materials.fan, false); vane.rotation.y = blade * Math.PI * 2 / 7; }
    for (const x of [-1.55, 1.55]) for (const z of [-1.55, 1.55]) cyl(fan, "fan", .12, .12, .2, [x, .5, z], materials.steel, 12);

    // Three separate stainless DS18B20 probes and fine grey lead paths.
    const probes = groups.get("probes")!;
    const sinkProbe = cyl(sink, "probes", .18, .18, 1.55, [-3.55, 1.25, 1.15], materials.probe, 20); sinkProbe.rotation.x = Math.PI / 2;
    const ambient = new THREE.Group(); ambient.position.copy(layoutPoint(645, 1042)); ambient.userData.componentId = "probes"; scene.add(ambient);
    cyl(ambient, "probes", .18, .18, 5.0, [0, .18, 0], materials.probe, 20);
    const spare = cyl(probes, "probes", .15, .15, 2.3, [1.2, .38, -.4], materials.probe, 16); spare.rotation.x = Math.PI / 2;

    const curves: Array<{ curve: THREE.CatmullRomCurve3; particles: THREE.Mesh[]; speed: number; active: () => boolean }> = [];
    const makeRoute = (coords: Array<[number, number, number]>, material: THREE.Material, color: number, radius: number, count = 0, speed = .06, active: () => boolean = () => true, dashed = false) => {
      const points = coords.map(([x, y, h]) => layoutPoint(x, y, h));
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", .35);
      if (dashed) {
        const steps = 96; const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(radius * 1.45, 6, 5), material, Math.ceil(steps / 4)); const o = new THREE.Object3D(); let n = 0;
        for (let s = 0; s < steps; s += 4) { o.position.copy(curve.getPoint(s / (steps - 1))); o.updateMatrix(); dots.setMatrixAt(n++, o.matrix); }
        dots.count = n; scene.add(dots);
      } else { const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, radius, 7, false), material); wire.castShadow = true; wire.receiveShadow = true; scene.add(wire); }
      const particles: THREE.Mesh[] = [];
      for (let n = 0; n < count; n++) { const particle = new THREE.Mesh(new THREE.SphereGeometry(radius * 2.25, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false })); scene.add(particle); particles.push(particle); }
      if (count) curves.push({ curve, particles, speed, active });
    };
    const wire = (c: Array<[number, number, number]>, m: THREE.Material, r = .075) => makeRoute(c, m, 0xeeeeee, r);
    // Heavy pack leads and series path. Curves terminate at the drawn part terminals.
    wire([[370, 516, 1.7], [370, 466, 1.65], [486, 466, 1.48], [486, 695, 1.42]], materials.cableRed, .12);
    makeRoute([[486, 715, 1.42], [690, 715, 1.3], [690, 482, 1.3], [725, 482, 1.3], [830, 482, 1.25], [945, 482, 1.2], [982, 482, 1.16], [1215, 482, 1.1], [1215, 600, 1.05], [1330, 614, 1.02]], materials.cableRed, 0xff9f43, .12, 8, .07);
    wire([[370, 704, 1.1], [370, 892, .85], [645, 892, .75], [645, 894, .7], [1238, 894, .8], [1238, 790, .95], [1325, 790, 1.0]], materials.cableBlack, .12);
    wire([[725, 520, 1.15], [725, 560, 1.12], [982, 560, 1.1], [982, 520, 1.08]], materials.cableBlack, .105);
    // Cell tap bundle from pack to the BMS and divider/ADC chain.
    const tapYs = [520, 540, 560, 580];
    tapYs.forEach((_, i) => wire([[210 + i * 28, 512, 1.42], [210 + i * 28, 410 + i * 14, 1.25], [660 + i * 7, 410 + i * 14, 1.15], [660 + i * 7, 555, 1.05]], materials.wireOrange, .045));
    wire([[660, 576, 1.1], [676, 576, 1.08], [676, 760, 1.02], [735, 760, 1.0]], materials.wireOrange, .055);
    wire([[735, 760, 1.0], [735, 650, 1.05], [729, 650, 1.03], [729, 716, 1.02]], materials.wireOrange, .05);
    wire([[735, 760, 1.0], [824, 760, 1.05], [824, 716, 1.02]], materials.wireOrange, .05);
    // I²C, control, relay and sensor wiring routed across the same component layout.
    makeRoute([[1340, 305, 1.6], [1310, 380, 1.55], [1080, 380, 1.5], [1080, 310, 1.45], [920, 310, 1.42], [920, 620, 1.4], [729, 650, 1.35]], materials.wireBlue, 0x62b6ff, .055, 5, .055);
    wire([[1310, 305, 1.48], [1280, 392, 1.42], [1098, 392, 1.4], [1098, 320, 1.38], [944, 320, 1.36], [944, 628, 1.32], [824, 650, 1.3]], materials.wireYellow, .05);
    makeRoute([[1340, 324, 1.55], [1320, 410, 1.5], [1118, 410, 1.45], [1118, 650, 1.4], [990, 650, 1.35], [990, 720, 1.32], [1290, 650, 1.3]], materials.wireGreen, 0x69d6ad, .065, 5, .09);
    makeRoute([[1340, 284, 1.65], [1210, 380, 1.6], [615, 380, 1.52], [570, 300, 1.5], [570, 228, 1.45]], materials.wirePurple, 0xa78bfa, .05, 4, .045);
    wire([[245, 590, 2.05], [400, 430, 1.85], [1340, 430, 1.8], [1340, 290, 1.7]], materials.wireGray, .045);
    wire([[1360, 695, 2.05], [1450, 585, 1.9], [1450, 400, 1.82], [1340, 400, 1.75]], materials.wireGray, .045);
    wire([[645, 1042, 2.1], [645, 930, 1.92], [1340, 930, 1.85], [1340, 400, 1.75]], materials.wireGray, .045);
    wire([[1050, 1038, 1.35], [1050, 916, 1.3], [1360, 916, 1.3], [1360, 950, 1.25]], materials.wireOrange, .075);
    wire([[1050, 1038, 1.32], [982, 916, 1.28], [982, 740, 1.24], [990, 720, 1.22]], materials.wireOrange, .06);
    // The charger path is drawn grey; animated charge particles appear only while its relay is closed.
    wire([[258, 270, 1.25], [450, 270, 1.22], [570, 270, 1.18], [570, 228, 1.15], [615, 228, 1.12], [615, 510, 1.1], [370, 510, 1.05]], materials.wireGray, .075);
    makeRoute([[258, 270, 1.3], [450, 270, 1.25], [570, 270, 1.22], [570, 228, 1.2], [615, 228, 1.18], [615, 510, 1.14], [370, 510, 1.1]], materials.wirePurple, 0xffcf70, .08, 8, .12, () => telemetryRef.current?.charge_relay_closed ?? false);

    // Idle tie-point and component callout dots, plus selected-part labels.
    labels.get("pack")!.visible = true;
    const clock = new THREE.Clock();
    const animate = () => {
      const time = clock.getElapsedTime(); controls.update(); const live = telemetryRef.current;
      const load = Math.max(.25, Math.min(1.6, Math.abs(live?.ina1_current_a ?? 0) / .8));
      for (const path of curves) path.particles.forEach((particle, index) => {
        const u = (time * path.speed * load + index / path.particles.length) % 1; particle.position.copy(path.curve.getPointAt(u)); particle.visible = path.active();
      });
      const fanPart = groups.get("fan")?.userData.fanBlades as THREE.Group | undefined;
      if (fanPart) fanPart.rotation.y = time * Math.max(.1, (live?.cell_temp_c ?? 25) / 20);
      const temperature = live?.cell_temp_c ?? 25;
      const heat = THREE.MathUtils.clamp((temperature - 38) / 7, 0, 1);
      cellWraps.forEach((material) => { material.emissive.copy(heatGlow).multiplyScalar(heat); material.emissiveIntensity = .72 * heat; });
      relayLedMat.color.set(live?.charge_relay_closed ? 0x62e69a : live?.charge_cutoff_reason ? 0xff554a : 0x68717b);
      relayLedMat.emissive.set(live?.charge_relay_closed ? 0x1c8c55 : live?.charge_cutoff_reason ? 0xb92722 : 0x17191c);
      const hot = temperature > 45;
      const criticalFault = Boolean(runawayDemoRef.current && live?.mode === "charge" && live.cell_core_temp_c >= FIRE_IGNITION_TEMP_C);
      fireGroup.visible = criticalFault; fireLight.intensity = criticalFault ? 6.2 + Math.sin(time * 19) * 2.0 : 0;
      flames.forEach((flame, index) => { const flicker = .82 + (Math.sin(time * (12 + index) + index * 2.1) + 1) * .18; flame.visible = criticalFault; flame.scale.set(flicker, flicker * (.86 + Math.sin(time * 15 + index) * .13), flicker); flame.rotation.y = Math.sin(time * 8 + index) * .24; });
      smoke.forEach((puff) => { const phase = (time * .22 + (puff.userData.phase as number)) % 1; puff.visible = criticalFault; puff.position.y = 2.9 + phase * 3.4; puff.position.x = -1.6 + Math.sin(time * 1.2 + (puff.userData.phase as number) * 7) * 2.5; (puff.material as THREE.MeshBasicMaterial).opacity = criticalFault ? .3 * (1 - phase) : 0; });
      const resistorBody = groups.get("resistor")?.children.find((child) => child.type === "Mesh") as THREE.Mesh | undefined;
      if (resistorBody?.material instanceof THREE.MeshStandardMaterial) resistorBody.material.emissive.set(hot ? 0x64240d : 0x000000);
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
    const resizeObserver = new ResizeObserver(() => { const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return; camera.aspect = width / height; fitCamera(); renderer.setSize(width, height); }); resizeObserver.observe(host);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let down: [number, number] | undefined;
    const onDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const onUp = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) { down = undefined; return; }
      down = undefined; const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      const id = raycaster.intersectObjects(clickable, false).find((hit) => hit.object.userData.componentId)?.object.userData.componentId as ComponentId | undefined;
      if (id) window.dispatchEvent(new CustomEvent("rig-component-select", { detail: id }));
    };
    renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp);
    const onFocus = (event: Event) => {
      const id = (event as CustomEvent<ComponentId>).detail; labels.forEach((label) => { label.visible = false; }); const activeLabel = labels.get(id); if (activeLabel) activeLabel.visible = true;
      const part = groups.get(id);
      if (part) { const viewDirection = camera.position.clone().sub(controls.target).normalize(); controls.target.copy(part.position); camera.position.copy(part.position).addScaledVector(viewDirection, 31); controls.update(); }
    };
    window.addEventListener("rig-component-focus", onFocus);
    const onResetView = () => { controls.target.copy(target); fitCamera(); controls.update(); labels.forEach((label) => { label.visible = false; }); labels.get("pack")!.visible = true; };
    window.addEventListener("rig-reset-view", onResetView);
    const highlightInitial = window.setTimeout(() => { labels.forEach((label) => { label.visible = false; }); labels.get("pack")!.visible = true; }, 20);
    setSceneError("");
    return () => {
      window.clearTimeout(highlightInitial); renderer.setAnimationLoop(null); resizeObserver.disconnect(); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp); window.removeEventListener("rig-component-focus", onFocus); window.removeEventListener("rig-reset-view", onResetView); controls.dispose();
      scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.InstancedMesh) { object.geometry?.dispose?.(); const material = object.material; (Array.isArray(material) ? material : [material]).forEach((item) => { if (item instanceof THREE.Material) { (item as THREE.SpriteMaterial).map?.dispose(); item.dispose(); } }); } }); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  const start = () => { if (playback.index >= result.samples.length - 1) playback.setIndex(0); playback.setPlaying(true); };
  const packVoltage = sample.cell_v.reduce((sum, voltage) => sum + voltage, 0);
  const currentLabel = sample.mode === "charge" ? "Charge current" : "Discharge current";
  const currentValue = sample.mode === "charge" ? sample.charge_current_a : sample.ina1_current_a;
  const operatingStatus = condition.thermalRunawayDemo && sample.cell_core_temp_c >= FIRE_IGNITION_TEMP_C ? "CRITICAL · THERMAL RUNAWAY" : sample.mode === "charge"
    ? sample.charge_cutoff_reason ? `Cut off · ${sample.charge_cutoff_reason}` : sample.charge_relay_closed ? `Charging · ${sample.charger_phase.toUpperCase()}` : "Charger idle"
    : sample.software_uv_trip ? "UV cut-off" : sample.bms_state;
  const statusTripped = Boolean(sample.charge_cutoff_reason) || sample.software_uv_trip || sample.bms_state !== "normal" || (condition.thermalRunawayDemo === true && sample.cell_core_temp_c >= FIRE_IGNITION_TEMP_C);
  const criticalRunaway = Boolean(condition.thermalRunawayDemo && sample.cell_core_temp_c >= FIRE_IGNITION_TEMP_C);
  const applySettings = () => { playback.setPlaying(false); setApplied(draft); setApplyFeedback(true); window.setTimeout(() => setApplyFeedback(false), 1100); };
  return <div className="rig-demo">
    <div className="rig-demo-intro"><p>A scale-based 3D reconstruction from the supplied bench layout. Choose a case to watch charging, temperature, protection and load signals move through the rig.</p><div className="rig-demo-actions"><span className="badge">Model-only · no rig required</span><button className="button primary rig-extended-button" onClick={launchExtendedDemo}>▶ Run extended demo</button></div></div>
    <section className="rig-condition panel" aria-label="Simulation conditions">
      <label htmlFor="rig-condition-select">Preview condition</label>
      <select id="rig-condition-select" value={conditionId} onChange={(event) => { const nextId = event.target.value as ConditionId; const defaults = controlsFor(CONDITIONS[nextId]); setConditionId(nextId); setDraft(defaults); setApplied(defaults); }}>
        {Object.entries(CONDITIONS).map(([id, item]) => <option key={id} value={id}>{item.title}</option>)}
      </select>
      <div className="rig-condition-info"><strong>{condition.mode === "charge" ? `${applied.currentA.toFixed(1)} A charge · ${applied.chargerSetpointV.toFixed(1)} V target · ${applied.initialCellTempC.toFixed(0)} °C cell start` : `${applied.currentA.toFixed(2)} A load · ${(applied.initialSoc * 100).toFixed(0)}% SOC · ${applied.initialCellTempC.toFixed(0)} °C cell start`}</strong><span>{condition.summary} · Ambient {applied.ambientC.toFixed(0)} °C. Model parameters are provisional.</span></div>
    </section>
    <section className="panel rig-input-panel" aria-label="Simulation input controls">
      <div className="rig-input-heading"><div><h2>Simulation inputs</h2><p>Adjust the scenario, then apply to regenerate the trace.</p></div><button className={`button primary rig-apply-button ${applyFeedback ? "is-applied" : ""}`} aria-live="polite" onClick={applySettings}>{applyFeedback ? "✓ Trace updated" : "Apply & run"}</button></div>
      <div className="rig-input-grid">
        <RangeControl label={condition.mode === "charge" ? "Charge current" : conditionId === "pulse" ? "Pulse peak current" : "Load current"} value={draft.currentA} min={0} max={condition.mode === "charge" ? 2 : 1.25} step={0.05} unit="A" onChange={(currentA) => setDraft((value) => ({ ...value, currentA }))} />
        <RangeControl label="Starting state of charge" value={draft.initialSoc * 100} min={10} max={100} step={1} unit="%" onChange={(value) => setDraft((current) => ({ ...current, initialSoc: value / 100 }))} />
        <RangeControl label="Starting cell temperature" value={draft.initialCellTempC} min={5} max={49} step={1} unit="°C" onChange={(initialCellTempC) => setDraft((value) => ({ ...value, initialCellTempC }))} />
        <RangeControl label="Ambient temperature" value={draft.ambientC} min={5} max={45} step={1} unit="°C" onChange={(ambientC) => setDraft((value) => ({ ...value, ambientC }))} />
        {condition.mode === "charge" && <RangeControl label="Charger voltage limit" value={draft.chargerSetpointV} min={15} max={16.8} step={0.1} unit="V" onChange={(chargerSetpointV) => setDraft((value) => ({ ...value, chargerSetpointV }))} />}
      </div>
    </section>
    <section className="rig-screen panel">
      <div className="rig-screen-head"><div><strong>4S battery management rig</strong><span>Bench-layout reconstruction · 10 mm scene grid · estimated sizes marked</span></div><div className="rig-screen-actions"><span className="rig-interaction-hint">Drag to orbit · scroll to zoom · select a part</span><button className="rig-view-reset" onClick={() => window.dispatchEvent(new Event("rig-reset-view"))}>Reset view</button></div></div>
      <div className={`rig-stage ${criticalRunaway ? "rig-stage-burning" : ""}`} ref={hostRef} aria-label="Interactive Three.js reconstruction of the battery management rig" role="img"><div className="rig-scene-legend"><span><i className="power-key"/>{sample.mode === "charge" ? "Charge power" : "Pack current"}</span><span><i className="sense-key"/>I²C data</span><span><i className="control-key"/>Load control</span><span><i className="temp-key"/>Cell heat</span><span className={sample.charge_relay_closed ? "charge-path-active" : sample.charge_cutoff_reason ? "charge-path-cutoff" : ""}><i className="charge-key"/>Charge route · {sample.charge_relay_closed ? "active" : sample.charge_cutoff_reason ? "cut off" : "idle"}</span></div>{sceneError && <div className="rig-webgl-error">{sceneError}</div>}{criticalRunaway && <div className="rig-critical-overlay" role="alert"><strong>CRITICAL HEAT · THERMAL RUNAWAY</strong><span>Cutoff failure scenario · illustrative fire effect</span></div>}<div className="rig-stage-caption">{criticalRunaway ? "FAULT INJECTED · THERMAL RUNAWAY" : sample.charge_cutoff_reason ? "CHARGE CUTOFF · RELAY OPEN" : sample.mode === "charge" ? `CHARGING · ${sample.charger_phase.toUpperCase()} PHASE` : "4S1P · DMEGC INR18650-26E · PROVISIONAL MODEL"}</div></div>
      <div className="rig-telemetry"><div><span>Pack voltage</span><strong>{packVoltage.toFixed(2)} <small>V</small></strong></div><div><span>{currentLabel}</span><strong>{currentValue.toFixed(2)} <small>A</small></strong></div><div><span>Cell temperature</span><strong>{sample.cell_temp_c.toFixed(1)} <small>°C</small></strong></div><div><span>State of charge</span><strong>{(sample.true_soc * 100).toFixed(1)} <small>%</small></strong></div><div><span>Charger / protection</span><strong className={statusTripped ? "rig-state-trip" : "rig-state-ok"}>{operatingStatus}</strong></div></div>
      <div className="rig-playback"><div className="rig-playback-controls"><button className="button primary" onClick={playback.playing ? () => playback.setPlaying(false) : start}>{playback.playing ? "Pause" : playback.index >= result.samples.length - 1 ? "Replay preview" : "Play preview"}</button><button className="button secondary" onClick={() => { playback.setPlaying(false); playback.setIndex(0); }}>Reset</button><span>Time <strong>{sample.timestamp_s.toFixed(0)} s</strong> / {result.durationS} s</span></div><input aria-label="Simulation time" type="range" min="0" max={result.samples.length - 1} value={playback.index} onChange={(event) => { playback.setPlaying(false); playback.setIndex(Number(event.target.value)); }} /><p>Red: pack current · Blue/yellow: I²C bus · Green: load control · Purple: relay · Grey: temperature leads</p></div>
    </section>
    <div className="rig-graphs"><TelemetryChart title="Pack voltage" unit="V" samples={result.samples} activeIndex={playback.index} series={[{ name: "Pack", color: "#64a9ff", values: result.samples.map((item) => item.cell_v.reduce((sum, v) => sum + v, 0)) }]} reference={condition.mode === "charge" ? { value: applied.chargerSetpointV, label: "Charge limit" } : undefined} /><TelemetryChart title="Cell voltages" unit="V" samples={result.samples} activeIndex={playback.index} series={[0, 1, 2, 3].map((cell) => ({ name: `Cell ${cell + 1}`, color: ["#64a9ff", "#64d7ad", "#ffb454", "#c49aff"][cell]!, values: result.samples.map((item) => item.cell_v[cell]!) }))} /><TelemetryChart title="Cell tap voltages" unit="V" samples={result.samples} activeIndex={playback.index} series={[0, 1, 2, 3].map((tap) => ({ name: `Tap ${tap + 1}`, color: ["#64a9ff", "#64d7ad", "#ffb454", "#c49aff"][tap]!, values: result.samples.map((item) => item.tap_v[tap]!) }))} /><TelemetryChart title="Current" unit="A" samples={result.samples} activeIndex={playback.index} series={[{ name: "Pack sensor", color: "#ff995d", values: result.samples.map((item) => item.mode === "charge" ? item.charge_current_a : item.ina1_current_a) }, { name: "Load sensor", color: "#64d7ad", values: result.samples.map((item) => item.mode === "charge" ? 0 : item.ina2_current_a) }, { name: "Command", color: "#64a9ff", values: result.samples.map((item) => item.mode === "charge" ? applied.currentA : item.requested_current_a) }]} /><TelemetryChart title="Cell temperature" unit="°C" samples={result.samples} activeIndex={playback.index} series={[{ name: "Surface", color: "#ff995d", values: result.samples.map((item) => item.cell_temp_c) }, { name: "Core", color: "#ffce72", values: result.samples.map((item) => item.cell_core_temp_c) }, { name: "Ambient", color: "#64a9ff", values: result.samples.map((item) => item.ambient_c) }]} reference={condition.mode === "charge" ? { value: 45, label: "Cutoff" } : undefined} /><TelemetryChart title="State of charge" unit="%" samples={result.samples} activeIndex={playback.index} series={[{ name: "Cell model", color: "#64d7ad", values: result.samples.map((item) => item.true_soc * 100) }, { name: "Coulomb count", color: "#64a9ff", values: result.samples.map((item) => item.coulomb_soc * 100) }]} /></div>
    <p className="rig-model-note">The charge and thermal cases use provisional cell resistance and heat-transfer values. The demo latches the relay open when the modeled 45 °C charge limit or cell over-voltage is reached. This is a visualization of software protection behavior, not a safety test or validated charger model.</p>
  </div>;
}

function RangeControl({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  return <label className="rig-range-control"><span><strong>{label}</strong><output>{value.toFixed(unit === "V" || unit === "A" ? 2 : 0)} {unit}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

interface ChartSeries { name: string; color: string; values: number[]; }
function TelemetryChart({ title, unit, samples, activeIndex, series, reference }: { title: string; unit: string; samples: RigSample[]; activeIndex: number; series: ChartSeries[]; reference?: { value: number; label: string } }) {
  const width = 420, height = 152, left = 42, right = 410, top = 18, bottom = 119;
  const values = [...series.flatMap((item) => item.values), ...(reference ? [reference.value] : [])];
  let low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.12, unit === "°C" ? 0.5 : 0.02);
  low -= padding; high += padding;
  if (unit === "%") { low = Math.max(0, low); high = Math.min(100, high); }
  const span = high - low || 1;
  const x = (index: number) => left + (index / Math.max(1, samples.length - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - low) / span) * (bottom - top);
  const active = Math.min(activeIndex, samples.length - 1);
  const tick = (value: number) => unit === "°C" || unit === "%" ? value.toFixed(0) : value.toFixed(2);
  return <section className="rig-chart-panel" aria-label={`${title} graph`}><div className="rig-chart-heading"><h3>{title}</h3><span>{samples[active]?.timestamp_s.toFixed(0) ?? 0} s</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} over time, ${unit}`}>
    {[0, 0.5, 1].map((fraction) => { const value = high - fraction * span; const yy = y(value); return <g key={fraction}><line x1={left} x2={right} y1={yy} y2={yy} className="rig-chart-grid"/><text x={left - 6} y={yy + 4} textAnchor="end" className="rig-chart-axis">{tick(value)}</text></g>; })}
    {reference && <><line x1={left} x2={right} y1={y(reference.value)} y2={y(reference.value)} className="rig-chart-limit"/><text x={right - 3} y={y(reference.value) - 4} textAnchor="end" className="rig-chart-limit-label">{reference.label} {reference.value.toFixed(1)} {unit}</text></>}
    {series.map((item) => { const toPath = (points: number[], offset = 0) => points.map((value, index) => `${index ? "L" : "M"}${x(index + offset).toFixed(1)},${y(value).toFixed(1)}`).join(" "); const current = item.values[active] ?? item.values[0] ?? 0; const progress = item.values.slice(0, active + 1); const forecast = item.values.slice(active); return <g key={item.name}><path d={toPath(item.values)} fill="none" stroke={item.color} strokeWidth="1.2" opacity=".12" vectorEffect="non-scaling-stroke"/><path className="rig-chart-progress" d={toPath(progress)} fill="none" stroke={item.color} strokeWidth="3.4" vectorEffect="non-scaling-stroke"/><path d={toPath(forecast, active)} fill="none" stroke={item.color} strokeWidth="1.2" opacity=".18" vectorEffect="non-scaling-stroke"/><circle className="rig-chart-current" cx={x(active)} cy={y(current)} r="4.2" fill={item.color}/></g>; })}
    <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} className="rig-chart-cursor"/><text x={left} y={height - 6} className="rig-chart-axis">{samples[0]?.timestamp_s.toFixed(0) ?? 0} s</text><text x={right} y={height - 6} textAnchor="end" className="rig-chart-axis">{samples.at(-1)?.timestamp_s.toFixed(0) ?? 0} s</text>
  </svg><div className="rig-chart-legend">{series.map((item) => <span key={item.name}><i style={{ background: item.color }}/>{item.name}: {(item.values[active] ?? 0).toFixed(unit === "°C" || unit === "%" ? 1 : 2)} {unit}</span>)}</div></section>;
}

export function ComponentCatalog() {
  const [selected, setSelected] = useState<ComponentId>("pack");
  const part = PARTS.find((item) => item.id === selected)!;
  return <><p className="lead">Browse the parts reconstructed in the 3D bench layout. Select an item to see its role and design notes.</p><div className="rig-detail-grid"><section className="panel rig-part-panel"><div className="panel-head"><h2>Component list</h2><span>{PARTS.length} items · four cells · three temperature probes</span></div><div className="rig-part-list">{PARTS.map((item) => <button key={item.id} className={`rig-part-button ${selected === item.id ? "selected" : ""}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><span>{item.name}</span><small>{item.kind}</small></button>)}</div></section><section className="panel rig-part-detail"><span className="eyebrow">Selected component · {part.kind}</span><h2>{part.name}</h2><p>{part.description}</p></section></div><p className="rig-model-note">Physical sizes and some part specifications are estimates from the supplied layout. See the Sources page for values that still need verification.</p></>;
}

