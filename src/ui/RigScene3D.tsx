import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BOM } from "../core/config/bom";
import { runDischargeSimulation, type DischargeSample } from "../core/sim/runDischarge";

type ComponentId = "pack" | "bms" | "fuse" | "charger" | "relay" | "divider" | "adsA" | "adsB" | "inaPack" | "inaLoad" | "dac" | "opAmp" | "mosfet" | "resistor" | "heatsink" | "pi" | "probes";

interface ComponentInfo { id: ComponentId; name: string; kind: string; description: string; location: THREE.Vector3; }

const PARTS: ComponentInfo[] = [
  { id: "pack", name: "4S1P cell pack", kind: "Battery · 4 × DMEGC INR18650-26E", description: "Four series cells provide the simulated pack voltage. Cell capacity, open-circuit curve and resistance are provisional literature-profile inputs.", location: new THREE.Vector3(-6.6, 1, 0) },
  { id: "bms", name: "4S BMS board", kind: "Protection board · 40 A listing", description: "Monitors the series pack and can disconnect it on cell over-voltage, under-voltage or over-current. Board thresholds remain provisional until the exact board is identified.", location: new THREE.Vector3(-6.5, .72, -2.6) },
  { id: "fuse", name: "5 A ATO fuse", kind: "Pack protection", description: "Series fuse in the battery path. A Littelfuse 287 replacement candidate is logged as provisional; no fuse-trip behavior is claimed in this discharge demo.", location: new THREE.Vector3(-3.8, .8, 0) },
  { id: "charger", name: "16.8 V charger", kind: "Charger · 2 A listing", description: "The charger and charge relay are shown in the rig layout. The current T7 animation is a discharge run and does not simulate charger behavior.", location: new THREE.Vector3(-6.5, .8, -4.4) },
  { id: "relay", name: "Charge relay", kind: "Charge path control", description: "The Pi controls the relay to enable or isolate charging. It is shown in the physical signal layout; its contact state is not switched during this T7 run.", location: new THREE.Vector3(-1.8, .8, 0) },
  { id: "divider", name: "Cell tap divider ladder", kind: "1 MΩ / 200 kΩ tap network", description: "Scales cumulative cell-tap voltages into the ADC input range. The 3D ladder is conceptual and not a PCB layout.", location: new THREE.Vector3(-3.7, .75, 3.25) },
  { id: "adsA", name: "ADS1115 · address 0x48", kind: "16-bit tap ADC", description: "Samples the first two tap channels. The 128 SPS rate is the datasheet power-on default used as a provisional timing baseline.", location: new THREE.Vector3(-1.2, .75, 3.25) },
  { id: "adsB", name: "ADS1115 · address 0x49", kind: "16-bit tap ADC", description: "Samples the remaining tap channels. Address 0x49 follows the design configuration and must be checked against the module straps when the rig is built.", location: new THREE.Vector3(.95, .75, 3.25) },
  { id: "inaPack", name: "INA226 · pack", kind: "Current and bus voltage", description: "Measures pack current and voltage. One-sample averaging and 1.1 ms conversions are datasheet reset defaults, not verified firmware settings.", location: new THREE.Vector3(-.1, .8, 0) },
  { id: "inaLoad", name: "INA226 · load", kind: "Load current monitor", description: "Measures the electronic-load branch for current feedback and logging. Its simulated reading follows the T7 discharge trace.", location: new THREE.Vector3(3.25, .8, -.9) },
  { id: "dac", name: "MCP4725 DAC", kind: "12-bit setpoint output", description: "Converts the Pi's load-current command into an analog setpoint. The address depends on the part variant and board strap; 0x60 is not confirmed for a physical module.", location: new THREE.Vector3(3.05, .75, 3.25) },
  { id: "opAmp", name: "LM358 control stage", kind: "Gate-drive control", description: "Conditions the DAC signal for the MOSFET load-control loop. The visual wiring is conceptual rather than a circuit-board layout.", location: new THREE.Vector3(5.05, .75, 3.25) },
  { id: "mosfet", name: "IRLZ44N MOSFET", kind: "Electronic-load switch", description: "Regulates the discharge load under analog control and shares the heat sink with the power resistor. Temperature cutoff is not exercised in this preview.", location: new THREE.Vector3(5.8, 1.55, .15) },
  { id: "resistor", name: "10 Ω / 50 W resistor", kind: "Power load", description: "Dissipates the pack energy during discharge. The model animates the electronic-load path; enclosure and mounting details are not represented.", location: new THREE.Vector3(5.8, 1.45, -1.55) },
  { id: "heatsink", name: "Shared fan-cooled heat sink", kind: "MOSFET + resistor cooling", description: "The layout shows the shared heat sink and fan. Installed heat-sink thermal response is unknown and is not part of the current temperature trace.", location: new THREE.Vector3(5.8, .65, -.75) },
  { id: "pi", name: "Raspberry Pi 5", kind: "Edge control and telemetry", description: "Runs sampling, control, protection, logging and the BLE authentication demo. This browser scene animates the model; it does not connect to a Pi or BLE radio.", location: new THREE.Vector3(7.35, .75, 3.15) },
  { id: "probes", name: "3 × DS18B20 probes", kind: "Cell, heat sink and spare", description: "One-wire temperature sensors. The cell probe trace is quantized in the demo; waterproof probe lag and the heat-sink response are not modeled yet.", location: new THREE.Vector3(-4.95, 1.65, 1.05) },
];

const CELL_COLORS = ["#54a7ff", "#54a7ff", "#54a7ff", "#54a7ff"];

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 120;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(17, 20, 26, 0.88)"; ctx.beginPath(); ctx.roundRect(8, 8, 624, 104, 22); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = "600 42px system-ui, sans-serif"; ctx.fillStyle = "#f7f8fa"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 320, 60, 590);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.45, .58, 1); return sprite;
}

function useTelemetry(samples: DischargeSample[]) {
  const [index, setIndex] = useState(0); const [playing, setPlaying] = useState(false);
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
  const hostRef = useRef<HTMLDivElement>(null); const telemetryRef = useRef<DischargeSample | null>(null);
  const result = useMemo(() => runDischargeSimulation({ testId: "T7", durationS: BOM.simulation.demoDurationS, initialSoc: BOM.simulation.initialSoc, dischargeCurrentA: BOM.simulation.dischargeCurrentA, ambientC: BOM.thermalDesign.ambientC }), []);
  const playback = useTelemetry(result.samples); const [selected, setSelected] = useState<ComponentId>("pack"); const [sceneError, setSceneError] = useState("");
  const sample = playback.sample; const selectedPart = PARTS.find((part) => part.id === selected)!;
  telemetryRef.current = sample;

  useEffect(() => {
    const onPick = (event: Event) => setSelected((event as CustomEvent<ComponentId>).detail);
    window.addEventListener("rig-component-select", onPick);
    return () => window.removeEventListener("rig-component-select", onPick);
  }, []);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { setSceneError("This browser could not start WebGL. Try a browser with hardware acceleration enabled."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#11151b"); scene.fog = new THREE.Fog("#11151b", 25, 48);
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, .1, 100); camera.position.set(16, 13.5, 18);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, .6, 0); controls.enableDamping = true; controls.dampingFactor = .055; controls.minDistance = 8; controls.maxDistance = 34; controls.maxPolarAngle = Math.PI * .49;
    scene.add(new THREE.HemisphereLight(0xdbeaff, 0x17202d, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(-5, 12, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
    const rim = new THREE.DirectionalLight(0x58a6ff, 2.1); rim.position.set(8, 8, -7); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(18.4, .28, 12.2), new THREE.MeshStandardMaterial({ color: 0x27313e, roughness: .72, metalness: .18 })); floor.position.y = -.2; floor.receiveShadow = true; scene.add(floor);
    const board = new THREE.Mesh(new THREE.BoxGeometry(17.7, .08, 11.5), new THREE.MeshStandardMaterial({ color: 0x17251f, roughness: .88, metalness: .06 })); board.position.y = -.025; board.receiveShadow = true; scene.add(board);
    const grid = new THREE.GridHelper(17.6, 28, 0x385244, 0x30463b); grid.position.set(0, .03, 0); (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .34; scene.add(grid);

    const rayTargets: THREE.Object3D[] = [];
    const mat = (color: THREE.ColorRepresentation, roughness = .55, metalness = .12, emissive?: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(emissive ? { emissive, emissiveIntensity: .18 } : {}) });
    const addMesh = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, scale?: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(position); if (scale) mesh.scale.copy(scale); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.componentId = group.userData.componentId; group.add(mesh); rayTargets.push(mesh); return mesh;
    };
    const makeBoard = (id: ComponentId, center: THREE.Vector3, size: THREE.Vector3, color = 0x187453, title?: string) => {
      const group = new THREE.Group(); group.position.copy(center); group.userData.componentId = id;
      addMesh(group, new THREE.BoxGeometry(size.x, .16, size.z), mat(color, .68, .12), new THREE.Vector3(0, 0, 0));
      const chip = addMesh(group, new THREE.BoxGeometry(size.x * .34, .15, size.z * .34), mat(0x18202a, .36, .34), new THREE.Vector3(0, .16, 0)); chip.userData.componentId = id;
      const pinMat = mat(0xd6b567, .28, .78);
      for (let i = 0; i < 4; i++) { const x = -size.x * .37 + i * size.x * .24; for (const z of [-size.z * .43, size.z * .43]) addMesh(group, new THREE.CylinderGeometry(.035, .035, .3, 8), pinMat, new THREE.Vector3(x, -.13, z)); }
      if (title) { const label = labelSprite(title); label.position.set(0, .75, 0); group.add(label); }
      scene.add(group); return group;
    };

    // Four visible cylindrical cells with holders, terminal caps and serial labels.
    const pack = new THREE.Group(); pack.position.set(-6.6, 1.0, 0); pack.userData.componentId = "pack";
    const cellMat = CELL_COLORS.map((color) => mat(color, .28, .42, 0x123c68));
    for (let i = 0; i < 4; i++) {
      const x = -1.38 + i * .92;
      const cradle = addMesh(pack, new THREE.BoxGeometry(.83, .19, 1.34), mat(0x303b49, .78, .12), new THREE.Vector3(x, -.48, 0)); cradle.userData.componentId = "pack";
      const cell = addMesh(pack, new THREE.CylinderGeometry(.34, .34, 1.48, 32), cellMat[i]!, new THREE.Vector3(x, 0, 0)); cell.rotation.z = Math.PI / 2; cell.userData.componentId = "pack";
      for (const dx of [-.76, .76]) addMesh(pack, new THREE.CylinderGeometry(.12, .12, .06, 20), mat(0xc0c8d1, .2, .82), new THREE.Vector3(x + dx, 0, 0));
      const text = labelSprite(`CELL ${i + 1}  ·  ${(sample.cell_v[i] ?? 4.1).toFixed(2)} V`); text.position.set(x, .56, .48); text.scale.set(1.55, .3, 1); pack.add(text);
    }
    const packLabel = labelSprite("4S1P  ·  DMEGC INR18650-26E"); packLabel.position.set(0, .94, -.2); packLabel.scale.set(2.9, .42, 1); pack.add(packLabel); scene.add(pack);

    // Electronics and protection boards.
    makeBoard("bms", new THREE.Vector3(-6.5, .58, -2.6), new THREE.Vector3(2.35, .18, 1.55), 0x1d704e, "4S BMS  ·  40 A");
    makeBoard("divider", new THREE.Vector3(-3.7, .55, 3.25), new THREE.Vector3(2.65, .16, .88), 0x28734b, "CELL TAP DIVIDERS");
    makeBoard("adsA", new THREE.Vector3(-1.2, .58, 3.25), new THREE.Vector3(1.45, .18, 1.15), 0x176c7e, "ADS1115  ·  0x48");
    makeBoard("adsB", new THREE.Vector3(.95, .58, 3.25), new THREE.Vector3(1.45, .18, 1.15), 0x176c7e, "ADS1115  ·  0x49");
    makeBoard("inaPack", new THREE.Vector3(-.1, .6, 0), new THREE.Vector3(1.55, .18, 1.25), 0x24546a, "INA226  ·  PACK");
    makeBoard("inaLoad", new THREE.Vector3(3.25, .6, -.9), new THREE.Vector3(1.55, .18, 1.25), 0x24546a, "INA226  ·  LOAD");
    makeBoard("dac", new THREE.Vector3(3.05, .58, 3.25), new THREE.Vector3(1.5, .18, 1.2), 0x187453, "MCP4725 DAC");
    makeBoard("opAmp", new THREE.Vector3(5.05, .58, 3.25), new THREE.Vector3(1.7, .18, 1.2), 0x187453, "LM358 CONTROL");
    makeBoard("pi", new THREE.Vector3(7.35, .6, 3.15), new THREE.Vector3(2.05, .2, 1.6), 0x237047, "RASPBERRY PI 5");

    // Pack fuse, charger and relay.
    const fuse = new THREE.Group(); fuse.position.set(-3.8, .78, 0); fuse.userData.componentId = "fuse";
    addMesh(fuse, new THREE.BoxGeometry(1.45, .26, .5), mat(0x29333d, .4, .35), new THREE.Vector3(0, 0, 0));
    const glass = addMesh(fuse, new THREE.CylinderGeometry(.13, .13, .86, 20), mat(0xd9e8f0, .16, .5), new THREE.Vector3(0, .25, 0)); glass.rotation.z = Math.PI / 2; glass.material.transparent = true; glass.material.opacity = .78;
    const fuseLabel = labelSprite("5 A ATO FUSE"); fuseLabel.position.set(0, .76, 0); fuse.add(fuseLabel); scene.add(fuse);
    const charger = new THREE.Group(); charger.position.set(-6.5, .72, -4.4); charger.userData.componentId = "charger";
    addMesh(charger, new THREE.BoxGeometry(2.45, .82, 1.65), mat(0x3c4652, .52, .3), new THREE.Vector3(0, 0, 0));
    addMesh(charger, new THREE.BoxGeometry(.5, .36, .12), mat(0x151a20, .38, .3), new THREE.Vector3(.66, .05, .87));
    const chargerLabel = labelSprite("CHARGER  ·  16.8 V / 2 A"); chargerLabel.position.set(0, .83, 0); chargerLabel.scale.set(2.5, .42, 1); charger.add(chargerLabel); scene.add(charger);
    const relay = new THREE.Group(); relay.position.set(-1.8, .8, 0); relay.userData.componentId = "relay";
    addMesh(relay, new THREE.BoxGeometry(1.12, .78, .98), mat(0x405369, .54, .25), new THREE.Vector3(0, 0, 0));
    addMesh(relay, new THREE.BoxGeometry(.55, .12, .12), mat(0xd5dce4, .26, .68), new THREE.Vector3(0, .43, 0));
    const relayLabel = labelSprite("CHARGE RELAY"); relayLabel.position.set(0, .86, 0); relay.add(relayLabel); scene.add(relay);

    // Shared fan-cooled sink, TO-220 power MOSFET and ceramic load resistor.
    const sink = new THREE.Group(); sink.position.set(5.8, .56, -.76); sink.userData.componentId = "heatsink";
    addMesh(sink, new THREE.BoxGeometry(2.75, .2, 3.0), mat(0x75818d, .28, .82), new THREE.Vector3(0, 0, 0));
    for (let i = -5; i <= 5; i++) addMesh(sink, new THREE.BoxGeometry(.12, .52, 2.65), mat(0x626e7a, .32, .78), new THREE.Vector3(i * .22, .34, 0));
    const fan = new THREE.Group(); fan.position.set(.88, .68, .84); fan.userData.componentId = "heatsink";
    const fanRing = addMesh(fan, new THREE.TorusGeometry(.44, .08, 10, 32), mat(0x293541, .38, .58), new THREE.Vector3(0, 0, 0)); fanRing.rotation.x = Math.PI / 2;
    const hub = addMesh(fan, new THREE.CylinderGeometry(.15, .15, .16, 20), mat(0x414e5c, .36, .55), new THREE.Vector3(0, .04, 0));
    for (let i = 0; i < 5; i++) { const blade = addMesh(fan, new THREE.BoxGeometry(.12, .08, .45), mat(0x536170, .38, .46), new THREE.Vector3(0, .08, -.25)); blade.rotation.y = i * Math.PI * .4; }
    fan.userData.fanGroup = fan; sink.add(fan); void fanRing; void hub; scene.add(sink);
    const resistor = new THREE.Group(); resistor.position.set(5.8, 1.22, -1.55); resistor.userData.componentId = "resistor";
    const resistorBody = addMesh(resistor, new THREE.BoxGeometry(1.95, .58, .85), mat(0xe1e4e7, .68, .1), new THREE.Vector3(0, 0, 0)); resistorBody.userData.componentId = "resistor";
    addMesh(resistor, new THREE.BoxGeometry(1.48, .04, .045), mat(0x647184, .55, .14), new THREE.Vector3(0, .3, 0));
    const resLabel = labelSprite("10 Ω  ·  50 W"); resLabel.position.set(0, .53, 0); resistor.add(resLabel); scene.add(resistor);
    const fet = new THREE.Group(); fet.position.set(5.8, 1.42, .14); fet.userData.componentId = "mosfet";
    addMesh(fet, new THREE.BoxGeometry(.64, .68, .25), mat(0x20272e, .35, .38), new THREE.Vector3(0, .05, 0));
    addMesh(fet, new THREE.BoxGeometry(.88, .12, .46), mat(0x87929e, .25, .8), new THREE.Vector3(0, .42, 0));
    for (let i = -1; i <= 1; i++) addMesh(fet, new THREE.BoxGeometry(.08, .42, .08), mat(0xd1b968, .25, .72), new THREE.Vector3(i * .18, -.48, .03));
    const fetLabel = labelSprite("IRLZ44N MOSFET"); fetLabel.position.set(0, .94, 0); fetLabel.scale.set(2.05, .4, 1); fet.add(fetLabel); scene.add(fet);

    // Three temperature probes: cell, sink, and ambient/spare.
    const probes = new THREE.Group(); probes.position.set(-4.95, 1.5, 1.05); probes.userData.componentId = "probes";
    for (const [i, pos] of [[0, [-.55, 0, 0]], [1, [0, 0, -.3]], [2, [.55, 0, .05]]] as const) {
      const probe = addMesh(probes, new THREE.CylinderGeometry(.12, .12, .36, 18), mat(i === 1 ? 0xffaa45 : 0x68d391, .3, .42, i === 1 ? 0x52200a : 0x123c21), new THREE.Vector3(pos[0], pos[1], pos[2]));
      probe.rotation.z = .36; probe.userData.componentId = "probes";
      const wire = addMesh(probes, new THREE.CylinderGeometry(.025, .025, .65, 8), mat(0x5d6671, .58, .3), new THREE.Vector3(pos[0], -.27, pos[2])); wire.rotation.z = -.28;
    }
    const probeLabel = labelSprite("3 × DS18B20"); probeLabel.position.set(0, .48, .2); probes.add(probeLabel); scene.add(probes);

    const pathCurves: Array<{ curve: THREE.CatmullRomCurve3; color: number; particles: THREE.Mesh[]; speed: number }> = [];
    const addPath = (points: Array<[number, number, number]>, color: number, count: number, speed: number) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .035, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .68 })); scene.add(tube);
      const particles: THREE.Mesh[] = [];
      for (let i = 0; i < count; i++) { const particle = new THREE.Mesh(new THREE.SphereGeometry(.095, 12, 12), new THREE.MeshBasicMaterial({ color, toneMapped: false })); scene.add(particle); particles.push(particle); }
      pathCurves.push({ curve, color, particles, speed });
    };
    addPath([[-7, 1.7, 0], [-4.8, 1.45, 0], [-3.8, 1.25, 0], [-1.8, 1.25, 0], [-.1, 1.25, 0], [1.7, 1.35, -.25], [3.25, 1.3, -.9], [4.7, 1.35, -1.1], [5.8, 1.5, -.9], [5.8, 1.8, .15]], 0xff9f43, 8, .07);
    addPath([[-6.5, 1.9, .25], [-5.5, 2.4, 1.35], [-3.7, 1.45, 3.25], [-1.2, 1.45, 3.25], [.95, 1.45, 3.25], [3.05, 1.45, 3.25], [5.05, 1.45, 3.25], [7.35, 1.45, 3.15]], 0x62b6ff, 7, .055);
    addPath([[7.35, 1.55, 3.15], [6.5, 2.25, 2.0], [5.05, 1.35, 3.25], [3.05, 1.35, 3.25], [4.0, 1.8, 1.65], [5.8, 1.85, .2]], 0x69d6ad, 6, .09);
    addPath([[-5.9, 1.95, .2], [-4.9, 2.5, 1.05], [-2.5, 1.45, 2.2], [1.3, 1.45, 2.6], [7.35, 1.55, 3.15]], 0xa78bfa, 5, .045);
    const chargeRoute = new THREE.CatmullRomCurve3([new THREE.Vector3(-6.5, 1.12, -4.4), new THREE.Vector3(-4.3, 1.08, -3.3), new THREE.Vector3(-1.8, 1.12, -.55), new THREE.Vector3(-4.8, 1.55, -.2), new THREE.Vector3(-6.6, 1.8, 0)]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(chargeRoute, 48, .028, 7, false), new THREE.MeshBasicMaterial({ color: 0x8290a0, transparent: true, opacity: .55 })));

    const clock = new THREE.Clock(); const fanGroup = sink.children.find((child) => child instanceof THREE.Group) as THREE.Group;
    const animate = () => {
      const t = clock.getElapsedTime(); controls.update();
      const live = telemetryRef.current; const loadFactor = Math.max(.2, Math.min(1.6, (live?.ina1_current_a ?? 1) / .8));
      for (const [lineIndex, line] of pathCurves.entries()) {
        const active = lineIndex !== 2 || (live?.dac_code ?? 0) > 0;
        line.particles.forEach((particle, i) => { const u = (t * line.speed * loadFactor + i / line.particles.length) % 1; particle.position.copy(line.curve.getPointAt(u)); particle.visible = active; });
      }
      fanGroup.rotation.y = t * Math.max(.15, (live?.cell_temp_c ?? 25) / 28);
      const hot = (live?.cell_temp_c ?? 25) > 45; fanGroup.children.forEach((child) => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && child.material.emissive) child.material.emissive.set(hot ? 0x4c1307 : 0x101820); });
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
    const resizeObserver = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }); resizeObserver.observe(host);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const onPointer = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(rayTargets, false)[0]?.object; const id = hit?.userData.componentId as ComponentId | undefined; if (id) window.dispatchEvent(new CustomEvent("rig-component-select", { detail: id })); };
    renderer.domElement.addEventListener("pointerdown", onPointer);
    const onSelect = (event: Event) => { const id = (event as CustomEvent<ComponentId>).detail; const part = PARTS.find((item) => item.id === id); if (part) controls.target.copy(part.location); };
    window.addEventListener("rig-component-focus", onSelect);
    setSceneError("");
    return () => { renderer.setAnimationLoop(null); resizeObserver.disconnect(); renderer.domElement.removeEventListener("pointerdown", onPointer); window.removeEventListener("rig-component-focus", onSelect); controls.dispose(); scene.traverse((obj) => { if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) { obj.geometry?.dispose?.(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach((material) => { if (material instanceof THREE.Material) { const map = (material as THREE.SpriteMaterial).map; map?.dispose(); material.dispose(); } }); } }); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  const choose = (id: ComponentId) => { setSelected(id); window.dispatchEvent(new CustomEvent("rig-component-focus", { detail: id })); };
  const start = () => { if (playback.index >= result.samples.length - 1) playback.setIndex(0); playback.setPlaying(true); };
  const packVoltage = sample.cell_v.reduce((sum, voltage) => sum + voltage, 0);
  return <div className="rig-demo">
    <div className="rig-demo-intro"><p>Explore the component-level rig in 3D. Play the provisional T7 model to watch simulated power, sensor and control signals move through the system.</p><span className="badge">Model-only · no rig required</span></div>
    <section className="rig-screen panel">
      <div className="rig-screen-head"><div><strong>4S battery management rig</strong><span>Conceptual component layout · not to scale</span></div><span className="rig-interaction-hint">Drag to orbit · scroll to zoom · select a part</span></div>
      <div className="rig-stage" ref={hostRef} aria-label="Interactive Three.js model of the battery management rig" role="img"><div className="rig-scene-legend"><span><i className="power-key"/>T7 discharge</span><span><i className="sense-key"/>Sensor data</span><span><i className="control-key"/>Load control</span><span><i className="temp-key"/>Temperature</span><span><i className="charge-key"/>Charge route · idle</span></div>{sceneError && <div className="rig-webgl-error">{sceneError}</div>}<div className="rig-stage-caption">PROVISIONAL SIMULATION · 4S1P DMEGC PACK</div></div>
      <div className="rig-telemetry"><div><span>Pack voltage</span><strong>{packVoltage.toFixed(2)} <small>V</small></strong></div><div><span>Discharge current</span><strong>{sample.ina1_current_a.toFixed(2)} <small>A</small></strong></div><div><span>Cell temperature</span><strong>{sample.cell_temp_c.toFixed(1)} <small>°C</small></strong></div><div><span>State of charge</span><strong>{(sample.true_soc * 100).toFixed(1)} <small>%</small></strong></div><div><span>Protection state</span><strong className={sample.bms_state === "normal" ? "rig-state-ok" : "rig-state-trip"}>{sample.software_uv_trip ? "UV cut-off" : sample.bms_state}</strong></div></div>
      <div className="rig-playback"><div className="rig-playback-controls"><button className="button primary" onClick={playback.playing ? () => playback.setPlaying(false) : start}>{playback.playing ? "Pause" : playback.index >= result.samples.length - 1 ? "Replay T7" : "Play T7"}</button><button className="button secondary" onClick={() => { playback.setPlaying(false); playback.setIndex(0); }}>Reset</button><span>Time <strong>{sample.timestamp_s.toFixed(0)} s</strong> / {result.durationS} s</span></div><input aria-label="Simulation time" type="range" min="0" max={result.samples.length - 1} value={playback.index} onChange={(event) => { playback.setPlaying(false); playback.setIndex(Number(event.target.value)); }} /><p>Orange: pack discharge · Blue: tap and sensor data · Green: DAC load control · Purple: temperature telemetry</p></div>
    </section>
    <div className="rig-detail-grid"><section className="panel rig-part-panel"><div className="panel-head"><h2>Components</h2><span>{PARTS.length} selectable component groups · includes all four cells and three probes</span></div><div className="rig-part-list">{PARTS.map((part) => <button key={part.id} className={`rig-part-button ${selected === part.id ? "selected" : ""}`} onClick={() => choose(part.id)}><span>{part.name}</span><small>{part.kind}</small></button>)}</div></section><section className="panel rig-part-detail"><span className="eyebrow">Selected component · {selectedPart.kind}</span><h2>{selectedPart.name}</h2><p>{selectedPart.description}</p><div className="rig-part-readout"><span>Current model reading</span><strong>{readingFor(selected, sample)}</strong></div></section></div>
    <p className="rig-model-note">This is an interactive 3D model, not a CAD drawing. Shapes communicate the rig layout and signal flow; dimensions and board footprints are illustrative. The T7 values remain provisional until compared with the future physical build.</p>
  </div>;
}

function readingFor(id: ComponentId, sample: DischargeSample): string {
  const packV = sample.cell_v.reduce((sum, voltage) => sum + voltage, 0);
  switch (id) {
    case "pack": return `${packV.toFixed(2)} V · ${(sample.true_soc * 100).toFixed(1)}% SOC`;
    case "bms": return sample.bms_state === "normal" ? "Monitoring · no BMS trip" : `Protection state · ${sample.bms_state}`;
    case "fuse": return "In series · trip behavior not simulated";
    case "charger": return "Idle · discharge scenario";
    case "relay": return "Charge path · not switching in T7";
    case "divider": return `Four tap channels · ${sample.tap_v[3].toFixed(2)} V highest tap`;
    case "adsA": return `CH0 ${sample.adc_codes[0]} · CH1 ${sample.adc_codes[1]} counts`;
    case "adsB": return `CH0 ${sample.adc_codes[2]} · CH1 ${sample.adc_codes[3]} counts`;
    case "inaPack": return `${sample.ina1_current_a.toFixed(3)} A · ${sample.ina1_bus_v.toFixed(2)} V`;
    case "inaLoad": return `${sample.ina2_current_a.toFixed(3)} A · ${sample.ina2_bus_v.toFixed(2)} V`;
    case "dac": return `Code ${sample.dac_code} · ${sample.requested_current_a.toFixed(2)} A requested`;
    case "opAmp": return "Load control active · analog response simplified";
    case "mosfet": return sample.ina1_current_a > 0 ? "Conducting · load active" : "Off · load disconnected";
    case "resistor": return `Dissipating ≈ ${(packV * sample.ina1_current_a).toFixed(1)} W · idealized`;
    case "heatsink": return "Cooling layout shown · thermal transient omitted";
    case "pi": return `T7 telemetry · ${sample.timestamp_s.toFixed(0)} s`;
    case "probes": return `${sample.cell_temp_c.toFixed(1)} °C cell · ${sample.ambient_c.toFixed(1)} °C ambient`;
  }
}

