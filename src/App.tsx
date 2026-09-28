import { useMemo, useState } from "react";
import { BOM } from "./core/config/bom";
import { DMEGC_INR18650_26E, isCellProfileProvisional } from "./core/config/cellProfile";
import { isProvisional } from "./core/config/provenance";
import type { Parameter } from "./core/config/provenance";
import { validateDesign } from "./core/config/validateDesign";
import { computeResponse, generateChallenge, initialBleAuthState, verifyResponse, type RegisteredKey } from "./core/firmware/ble";
import { compareTraces, comparisonCsv, comparisonSvg, comparisonType, parseTraceCsv, type Comparison, type Trace, type TraceSource } from "./core/compare/compare";
import { dischargeSimulationCsv, runDischargeSimulation, type DischargeSimulationResult } from "./core/sim/runDischarge";
import "./ui/styles.css";

type Page = "Overview" | "Bench" | "Tests" | "Signal chain" | "Compare" | "Sources" | "BLE";
const pages: Page[] = ["Overview", "Bench", "Tests", "Signal chain", "Compare", "Sources", "BLE"];
const tests = [
  ["T0a", "Charger open-circuit voltage", "DMM on charger output, no battery", "16.8 V (charger spec)"],
  ["T0b", "BMS thresholds", "Adjustable supply + resistor ladder in place of cells", "4.28 ± 0.05 V OV; 2.55 ± 0.08 V UV (listing)"],
  ["T1", "ADC calibration", "Supply at 0.5 / 2.0 / 2.8 V vs DMM", "Residual ≤ 1 mV after 2-point fit"],
  ["T2", "Cell voltages at rest", "Pack rested ≥ 1 h", "≤ 3 mV per cell after calibration"],
  ["T3", "INA226 calibration", "0.2–1.2 A through a reference meter", "Gain error ≤ 0.5 % after trim"],
  ["T4", "Load setpoint", "DAC codes for 0.25 / 0.5 / 1.0 A", "≤ 1 % after trim with INA226 #2"],
  ["T5", "Load ceiling", "Command 1.25 A at pack ≈ 12.5 V", "1.23 A ceiling (derived)"],
  ["T6", "Heatsink characterisation", "Load steps 0.4 / 0.83 / 1.25 A, 20 min each", "Measure Rth; below 80 °C at 0.83 A"],
  ["T7", "Capacity", "1.0 A from 4.20 V to 3.00 V/cell", "Rated 2.50–2.60 Ah at 0.2C to 2.5 V"],
  ["T8", "OCV curve", "0.13 A full discharge, or 10 % steps with 1 h rest", "Produces cell profile input"],
  ["T9", "Pulse test", "1.0 A for 10 s, rest 60 s, every 10 % SOC", "Fit residual ≤ 5 mV"],
  ["T10", "Model validation", "Held-out variable profile ≤ 1.25 A", "Voltage RMSE ≤ 15 mV; surface ± 1.5 °C"],
  ["T11", "Charge", "Charger from 3.3 V/cell, cell probe below 45 °C", "Time and end current within ± 10 %"],
  ["T12", "Cell thermal", "Surface DS18B20 during T7", "RMSE ≤ 1 °C after fitting R_surf"],
  ["T13", "SOC estimation", "T10 profile", "Report RMSE and max error in % SOC"],
  ["T14", "BLE authentication", "Owner, technician, unknown key, replay", "Accept / accept / reject / reject; lockout after 3 failures"],
] as const;
const sourceEntries: Array<{ group: string; name: string } & Parameter<unknown>> = Object.entries(BOM).flatMap(([group, value]) => Object.entries(value).filter(([, item]) => item && typeof item === "object" && "source" in item).map(([name, item]) => ({ group, name, ...(item as Parameter<unknown>) })));

function Badge({ children = "Provisional" }: { children?: string }) { return <span className="badge">{children}</span>; }
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) { return <section className="panel"><header className="panel-head"><h2>{title}</h2>{action}</header>{children}</section>; }
function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [selectedTest, setSelectedTest] = useState("T0a");
  const validation = useMemo(() => validateDesign(), []);
  const provisionalCount = sourceEntries.filter((entry) => isProvisional(entry)).length;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">4S</span><div><strong>Battery bench</strong><small>Simulation workspace</small></div></div><nav aria-label="Main navigation">{pages.map((item) => <button key={item} className={`nav-item ${page === item ? "active" : ""}`} onClick={() => setPage(item)}><span className="nav-dot" />{item}</button>)}</nav><div className="sidebar-foot"><span className="status-dot" />Design v1 <span className="muted">·</span> 26/26 rules</div></aside>
    <main className="main"><div className="mobile-brand">Battery bench simulation</div><div className="content"><div className="eyebrow">4S1P · DMEGC INR18650-26E · design v1</div><h1>{page}</h1>{page === "Overview" && <Overview validation={validation} provisionalCount={provisionalCount} onNavigate={setPage} />}{page === "Bench" && <Bench />}{page === "Tests" && <Tests selected={selectedTest} setSelected={setSelectedTest} />}{page === "Signal chain" && <SignalChain />}{page === "Compare" && <Compare />}{page === "Sources" && <Sources validation={validation} />}{page === "BLE" && <BleDemo />}</div></main>
    <nav className="tabbar" aria-label="Mobile navigation">{pages.map((item) => <button key={item} className={page === item ? "selected" : ""} onClick={() => setPage(item)}><span>{item === "Overview" ? "⌂" : item === "Bench" ? "▦" : item === "Tests" ? "◷" : item === "Signal chain" ? "⌁" : item === "Compare" ? "⇄" : item === "Sources" ? "≡" : "⌘"}</span>{item}</button>)}</nav>
  </div>;
}

function Overview({ validation, provisionalCount, onNavigate }: { validation: ReturnType<typeof validateDesign>; provisionalCount: number; onNavigate: (page: Page) => void }) {
  return <><div className="intro-row"><p className="lead">A component-level model of the bench rig, with traceable inputs and a clear record of what still needs measurement.</p><Badge>Model workspace</Badge></div><div className="metric-grid"><div className="metric"><span>Design checks</span><strong>{validation.v1.passCount}<small>/{validation.v1.totalCount}</small></strong><em className="good">All v1 checks pass</em></div><div className="metric"><span>Pack topology</span><strong>4S1P</strong><em>4 cells in series</em></div><div className="metric"><span>Cell profile</span><strong>{isCellProfileProvisional(DMEGC_INR18650_26E) ? "Provisional" : "Measured"}</strong><em>Replace with T8 / T9 / T12</em></div><div className="metric"><span>Parameters to review</span><strong>{provisionalCount}</strong><em>Listing, assumed or VERIFY</em></div></div><div className="two-col"><Panel title="Rig at a glance"><div className="list"><Row label="Cell pack" value="4 × DMEGC INR18650-26E" /><Row label="Voltage sensing" value="Divider ladder · 2 × ADS1115" /><Row label="Current sensing" value="2 × INA226" /><Row label="Electronic load" value="MCP4725 · LM358 · IRLZ44N" /><Row label="Temperature" value="3 × DS18B20" /><Row label="Control" value="Raspberry Pi 5 · BLE" /></div></Panel><Panel title="What is ready"><div className="list"><Row label="Design v1" value={`${validation.v1.passCount}/${validation.v1.totalCount} rules pass`} /><Row label="Expected traces" value="End-to-end simulation pending" /><Row label="Bench measurements" value="No CSV uploaded" /><Row label="Cell parameters" value="T8 / T9 / T12 pending" /></div><button className="text-button" onClick={() => onNavigate("Tests")}>Review test plan <span>→</span></button></Panel></div><div className="notice"><span className="notice-icon">i</span><div><strong>Simulation orchestration is not connected yet.</strong><p>The component models are tested individually. End-to-end T0–T14 traces will be available when the simulation loop is implemented.</p></div></div></>;
}
function Row({ label, value, badge }: { label: string; value: React.ReactNode; badge?: boolean }) { return <div className="row"><span>{label}</span><strong>{value}</strong>{badge && <Badge />}</div>; }

function Bench() {
  const components = ["4S1P CELL PACK", "CELL TAP DIVIDER LADDER", "2 × ADS1115", "INA226 #1 · PACK", "INA226 #2 · LOAD", "MCP4725 DAC", "LM358 CONTROL", "IRLZ44N MOSFET", "10 Ω · 50 W LOAD", "4S BMS · 40 A", "5 A ATO FUSE", "CHARGER · 16.8 V / 2 A", "RELAY", "RASPBERRY PI 5", "3 × DS18B20"];
  const [active, setActive] = useState(components[0]!);
  return <><p className="lead">System blocks and signal paths from the design v1 net list. Select a block for its role and known design notes.</p><Panel title="System wiring"><div className="wiring-layout"><div className="wiring"><div className="wire-col">{components.map((c, i) => <button key={c} onClick={() => setActive(c)} className={`part ${active === c ? "chosen" : ""}`}><span className="part-index">{String(i + 1).padStart(2, "0")}</span>{c}</button>)}</div><div className="wire-lines" aria-hidden="true"><span>PACK + / TAP VOLTAGES</span><span>MEASURED CURRENT</span><span>DAC SETPOINT → LOAD</span><span>GPIO / I²C CONTROL</span><span>ONE-WIRE TEMPERATURE</span></div><div className="wire-col muted-blocks">{["CELL VOLTAGE MEASUREMENT", "PACK / LOAD CURRENT", "CONTROLLED DISCHARGE", "CHARGE CONTROL", "EDGE LOGIC + TELEMETRY"].map((c) => <div className="part sink" key={c}>{c}</div>)}</div></div><div className="part-detail"><div className="eyebrow">Selected component</div><h3>{active}</h3><p>{active.includes("CELL") ? "Four series-connected DMEGC INR18650-26E cells form the simulated pack. OCV, resistance and thermal profile inputs remain provisional pending bench tests." : active.includes("ADS") || active.includes("DIVIDER") ? "Cell taps are scaled by the resistor ladder and acquired through the ADS1115 ADCs. Per-channel calibration is part of T1." : active.includes("INA") ? "Shunt voltage and bus voltage are acquired for measured current and power. Current sensing calibration is T3." : active.includes("DS18") ? "Temperature probes monitor the cell surface and shared load heatsink. The heatsink probe drives the 80 °C firmware cut-off." : "Component included in design v1; refer to the hardware specification and validation report for sourced details."}</p><Badge /></div></div></Panel><p className="footnote">Conceptual signal map from docs/HARDWARE_SPEC.md. This is not a physical-layout drawing.</p></>;
}
function Tests({ selected, setSelected }: { selected: string; setSelected: (id: string) => void }) {
  const test = tests.find(([id]) => id === selected)!;
  const [durationS, setDurationS] = useState(BOM.simulation.demoDurationS.value);
  const [currentA, setCurrentA] = useState(BOM.simulation.dischargeCurrentA.value);
  const [simulation, setSimulation] = useState<DischargeSimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState("");
  const runPreview = () => {
    try {
      setSimulationError("");
      if (!Number.isFinite(durationS) || durationS < 1 || durationS > 900) throw new Error("Preview length must be between 1 and 900 seconds.");
      if (!Number.isFinite(currentA) || currentA < 0 || currentA > BOM.load.firmwareCapA.value) throw new Error(`Discharge setpoint must be between 0 and ${BOM.load.firmwareCapA.value} A.`);
      setSimulation(runDischargeSimulation({
        testId: "T7",
        durationS: { ...BOM.simulation.demoDurationS, value: durationS },
        initialSoc: BOM.simulation.initialSoc,
        dischargeCurrentA: currentA === BOM.simulation.dischargeCurrentA.value ? BOM.simulation.dischargeCurrentA : { value: currentA, unit: "A", source: "assumed", ref: "User-selected preview setpoint; not a measured rig setting" },
        ambientC: BOM.thermalDesign.ambientC,
      }));
    } catch (error) { setSimulationError(error instanceof Error ? error.message : "Simulation could not run."); }
  };
  const saveSimulation = () => {
    if (!simulation) return;
    const url = URL.createObjectURL(new Blob([dischargeSimulationCsv(simulation)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "t7-discharge-model-preview.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <><p className="lead">T0–T14 bench procedure reference. Run the connected discharge preview for T7; other tests still need their own scenario-specific orchestration and parameters.</p><Panel title="T7 · discharge model preview" action={<Badge>Provisional cell model</Badge>}><p className="body-copy">Short model preview at the T7 discharge setpoint. This does not replace the full capacity procedure (1 A from full charge to 3.00 V/cell).</p><div className="simulation-controls"><label><span className="field-label">Preview length</span><div className="input-unit"><input type="number" min="1" max="900" step="30" value={durationS} onChange={(event) => setDurationS(Number(event.target.value))} /><span>seconds</span></div></label><label><span className="field-label">Discharge setpoint</span><div className="input-unit"><input type="number" min="0" max="1.25" step="0.05" value={currentA} onChange={(event) => setCurrentA(Number(event.target.value))} /><span>amperes</span></div></label><button className="button primary" onClick={runPreview}>Run simulation</button></div>{simulationError && <div className="notice error-notice"><span className="notice-icon">!</span><div><strong>Simulation could not run</strong><p>{simulationError}</p></div></div>}{simulation && <><div className="simulation-summary"><span>{simulation.sampleCount} samples · {simulation.durationS} s · {simulation.samplePeriodS} s output interval</span><strong>{simulation.profileProvisional ? "Provisional trace · voltage bands shown" : "Trace generated"}</strong></div><DischargePlot result={simulation} /><div className="export-actions"><button className="button secondary" onClick={saveSimulation}>Download model trace CSV</button></div><div className="simulation-warnings"><span className="eyebrow">Model limits</span>{simulation.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div></>}</Panel><div className="two-col tests-layout"><Panel title="Test plan"><div className="test-list">{tests.map(([id, name]) => <button className={`test-item ${id === selected ? "current" : ""}`} key={id} onClick={() => setSelected(id)}><span className="test-id">{id}</span><span>{name}</span><span className="chevron">›</span></button>)}</div></Panel><div><Panel title={`${test[0]} · ${test[1]}`}><div className="detail-section"><span className="eyebrow">Procedure</span><p>{test[2]}</p></div><div className="detail-section"><span className="eyebrow">Expected / acceptance</span><p>{test[3]}</p></div><div className="notice compact"><span className="notice-icon">i</span><div><strong>{selected === "T7" && simulation ? "T7 preview trace available" : "Test-specific trace not generated"}</strong><p>The current simulator runs the discharge model preview. Other test profiles and held-out validation traces remain to be implemented.</p></div></div></Panel><Panel title="Test sequence"><p className="body-copy">T0–T3 calibrate the instruments. T8–T9 parameterise the cell. T10 onward are the model validation and estimation tests. Keep fitting data separate from held-out validation data.</p></Panel></div></div></>;
}

function DischargePlot({ result }: { result: DischargeSimulationResult }) {
  const width = 760, height = 270, left = 54, right = 18, top = 18, bottom = 36;
  const points = result.samples;
  const minV = Math.min(...points.flatMap((p) => p.cell_v_low));
  const maxV = Math.max(...points.flatMap((p) => p.cell_v_high));
  const span = maxV - minV || 1;
  const timeMax = Math.max(points[points.length - 1]?.timestamp_s ?? 1, 1);
  const x = (t: number) => left + (t / timeMax) * (width - left - right);
  const y = (v: number) => top + ((maxV - v) / span) * (height - top - bottom);
  const colors = ["#007aff", "#34a853", "#ff9500", "#af52de"];
  return <div className="simulation-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="T7 model discharge cell voltage with uncertainty bands">{Array.from({ length: 4 }, (_, index) => { const value = minV + (span * index) / 3; const yy = y(value); return <g key={index}><line x1={left} y1={yy} x2={width - right} y2={yy} stroke="var(--chart-grid)" /><text x={left - 8} y={yy + 4} textAnchor="end">{value.toFixed(2)} V</text></g>; })}{points.length > 1 && Array.from({ length: 4 }, (_, cell) => { const upper = points.map((p, index) => `${index ? "L" : "M"}${x(p.timestamp_s)},${y(p.cell_v_high[cell]!)}`).join(" "); const lower = [...points].reverse().map((p) => `L${x(p.timestamp_s)},${y(p.cell_v_low[cell]!)}`).join(" "); const line = points.map((p, index) => `${index ? "L" : "M"}${x(p.timestamp_s)},${y(p.cell_v[cell]!)}`).join(" "); return <g key={cell}><path d={`${upper} ${lower} Z`} fill={colors[cell]} opacity=".12" /><path d={line} fill="none" stroke={colors[cell]} strokeWidth="2" /></g>; })}<text x={width / 2} y={height - 8} textAnchor="middle">Time (s)</text></svg><div className="chart-direct-labels">{["Cell 1", "Cell 2", "Cell 3", "Cell 4"].map((label, i) => <span key={label} style={{ color: colors[i] }}>● {label}</span>)}</div></div>;
}
function SignalChain() {
  const channels = [
    { title: "Cell tap voltage", path: "Cell tap → resistor divider → ADS1115 code → calibrated voltage", signal: "ADS1115 ±4.096 V range", notes: "Input impedance loading is included in the divider model. Per-channel calibration is T1; rest-cell verification is T2.", badge: true },
    { title: "Pack / load current", path: "Shunt voltage → INA226 registers → engineering current", signal: "0.01 Ω module shunt (listing)", notes: "Calibration and conversion settings affect the reported value. T3 calibrates against a reference meter.", badge: true },
    { title: "Cell / heatsink temperature", path: "DS18B20 conversion → temperature reading", signal: "12-bit · 750 ms conversion", notes: "Sensor accuracy is ±0.5 °C in its specified range. Probe lag is not yet characterised.", badge: true },
    { title: "Load setpoint", path: "MCP4725 code → 9.1 kΩ / 1 kΩ divider → LM358 loop → MOSFET", signal: "12-bit DAC · 0.1 Ω sense resistor", notes: "The control path sets a target; pack voltage and load resistance bound the achievable current. Verify via T4–T5.", badge: true },
  ];
  return <><p className="lead">Follow each measurement from the physical signal to the firmware value. Error budgets will populate with the connected end-to-end simulation.</p><div className="chain-list">{channels.map((c) => <Panel key={c.title} title={c.title} action={<Badge />}><div className="chain-flow"><div><span className="eyebrow">Signal path</span><p>{c.path}</p></div><div><span className="eyebrow">Configured range / resolution</span><p>{c.signal}</p></div></div><div className="chain-note">{c.notes}</div><div className="pending">Quantified error budget <span>Pending end-to-end integration</span></div></Panel>)}</div></>;
}
function Compare() {
  const [expectedFile, setExpectedFile] = useState<string>("");
  const [observedFile, setObservedFile] = useState<string>("");
  const [expected, setExpected] = useState<Trace | null>(null);
  const [observed, setObserved] = useState<Trace | null>(null);
  const [expectedName, setExpectedName] = useState("");
  const [observedSource, setObservedSource] = useState<TraceSource>("measurement");
  const [signal, setSignal] = useState("");
  const [error, setError] = useState("");
  const load = async (file: File | undefined, which: "expected" | "observed") => {
    if (!file) return;
    try {
      const trace = parseTraceCsv(await file.text());
      setError("");
      if (which === "expected") { setExpected(trace); setExpectedFile(file.name); setExpectedName(file.name); }
      else { setObserved(trace); setObservedFile(file.name); }
      const other = which === "expected" ? observed : expected;
      const candidates = trace.headers.filter((header) => (!other || other.headers.includes(header)) && trace.rows.some((row) => row.values[header] !== undefined) && (!other || other.rows.some((row) => row.values[header] !== undefined)));
      setSignal((current) => current && candidates.includes(current) ? current : candidates[0] ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this CSV file.");
      if (which === "expected") { setExpected(null); setExpectedFile(""); setExpectedName(""); }
      else { setObserved(null); setObservedFile(""); }
    }
  };
  const signalOptions = expected && observed ? expected.headers.filter((header) => observed.headers.includes(header) && expected.rows.some((row) => row.values[header] !== undefined) && observed.rows.some((row) => row.values[header] !== undefined)) : [];
  let result: Comparison | null = null;
  let compareError = "";
  if (expected && observed && signal && signalOptions.includes(signal)) {
    try { result = compareTraces(expected, observed, signal, "model", observedSource); }
    catch (cause) { compareError = cause instanceof Error ? cause.message : "Could not compare traces."; }
  }
  const download = (name: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const expectedLabel = expectedFile ? `${expectedFile} · ${expected?.rows.length ?? 0} rows` : "Choose the expected trace CSV";
  const observedLabel = observedFile ? `${observedFile} · ${observed?.rows.length ?? 0} rows` : "Choose the comparison trace CSV";
  return <><p className="lead">Compare two bench-log-format CSV traces. Time is aligned from each file’s first sample; expected values are interpolated at comparison sample times.</p><div className="two-col"><Panel title="Expected trace"><label className="dropzone compact-drop"><input type="file" accept=".csv,text/csv" onChange={(event) => void load(event.target.files?.[0], "expected")} /><span className="upload-icon">↑</span><strong>{expectedLabel}</strong><span>Model output CSV, using the bench log column names</span><span className="button secondary">Browse files</span></label><span className="field-label">Expected source</span><div className="fixed-source">Model trace · {expectedName || "CSV not selected"}</div></Panel><Panel title="Comparison trace"><label className="dropzone compact-drop"><input type="file" accept=".csv,text/csv" onChange={(event) => void load(event.target.files?.[0], "observed")} /><span className="upload-icon">↑</span><strong>{observedLabel}</strong><span>Measured bench log or another model CSV</span><span className="button secondary">Browse files</span></label><span className="field-label">Comparison source</span><select className="select-control" value={observedSource} onChange={(event) => setObservedSource(event.target.value as TraceSource)}><option value="measurement">Bench measurement</option><option value="model">Model trace</option></select></Panel></div>{(error || compareError) && <div className="notice error-notice"><span className="notice-icon">!</span><div><strong>Comparison issue</strong><p>{error || compareError}</p></div></div>}{expected && observed && <Panel title="Analysis">{signalOptions.length > 0 ? <><div className="analysis-controls"><label><span className="field-label">Signal</span><select className="select-control" value={signal} onChange={(event) => setSignal(event.target.value)}>{signalOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><span className="comparison-label">Result type <strong>{result ? comparisonType(result) : "Unable to compare"}</strong></span></div>{result && <><div className="metric-grid compare-metrics"><div className="metric"><span>Bias</span><strong>{result.bias.toPrecision(5)}<small> {result.unit}</small></strong></div><div className="metric"><span>RMSE</span><strong>{result.rmse.toPrecision(5)}<small> {result.unit}</small></strong></div><div className="metric"><span>Maximum absolute error</span><strong>{result.maxAbsError.toPrecision(5)}<small> {result.unit}</small></strong></div><div className="metric"><span>Aligned samples</span><strong>{result.points.length}</strong></div></div><div className="chart-wrap" dangerouslySetInnerHTML={{ __html: comparisonSvg(result) }} /><div className="export-actions"><button className="button secondary" onClick={() => download("bms-comparison.svg", comparisonSvg(result), "image/svg+xml")}>Download SVG figure</button><button className="button secondary" onClick={() => download("bms-residuals.csv", comparisonCsv(result), "text/csv;charset=utf-8")}>Download results CSV</button></div></>}</> : <p className="body-copy">These CSV files have no shared numeric channels to compare.</p>}</Panel>}</>;
}
function Sources({ validation }: { validation: ReturnType<typeof validateDesign> }) {
  return <><p className="lead">Parameter provenance and design validation. Inputs marked provisional should be replaced or confirmed with bench measurements.</p><Panel title="Design validation"><div className="validation-summary"><div><span>Design v1</span><strong className="good">{validation.v1.passCount}/{validation.v1.totalCount} pass</strong></div><div><span>Original v0</span><strong>{validation.v0.passCount}/{validation.v0.totalCount} pass</strong></div></div><details><summary>View all v1 rules</summary><div className="rule-list">{validation.v1.results.map((r) => <div key={r.name} className="rule-row"><span className={r.ok ? "good" : "bad"}>{r.ok ? "✓" : "×"}</span><div><strong>{r.name}</strong><small>{r.detail}</small></div></div>)}</div></details></Panel><Panel title={`Bill of materials · ${sourceEntries.length} parameters`}><div className="source-list">{sourceEntries.map((entry) => <details className="source-item" key={`${entry.group}.${entry.name}`}><summary><span><strong>{entry.name}</strong><small>{entry.group} · {String(entry.value)} {entry.unit}</small></span><span className="source-meta">{isProvisional(entry) && <Badge />}{entry.source}</span></summary><p>{entry.ref}</p></details>)}</div></Panel><Panel title="Cell profile"><div className="row"><strong>DMEGC INR18650-26E</strong><Badge /></div><p className="body-copy">The OCV curve is adapted from another cell chemistry. Cell resistance and thermal parameters are placeholders. Replace using T8, T9 and T12 measurements before relying on predictive traces.</p></Panel><Panel title="Known limits"><p className="body-copy">The cell profile remains provisional. Several hardware values require physical verification. The simulation currently has no end-to-end orchestrator; design checks and isolated component models are available.</p><a className="text-button" href="/docs/validation_report.md">Open validation report ↗</a></Panel></>;
}
function BleDemo() {
  const [result, setResult] = useState("No authentication attempt yet.");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(() => initialBleAuthState([
    { id: "owner-demo", role: "owner", key: new TextEncoder().encode("owner-demo-key-for-local-simulation") },
    { id: "technician-demo", role: "technician", key: new TextEncoder().encode("technician-demo-key-local-simulation") },
  ] satisfies RegisteredKey[]));
  const attempt = async (id: string, registered = true) => {
    setBusy(true);
    try {
      const challenge = generateChallenge();
      const key = registered ? state.registry.find((entry) => entry.id === id)?.key : new TextEncoder().encode("unknown-demo-key");
      const response = await computeResponse(key ?? new Uint8Array([1]), challenge, id);
      const verified = await verifyResponse(state, id, challenge, response, Date.now());
      setState(verified.state);
      setResult(verified.result.ok ? `Accepted · ${verified.result.role} role · fresh challenge` : `Rejected · ${verified.result.reason?.replaceAll("_", " ")}`);
    } catch { setResult("Web Crypto is unavailable in this browser context."); }
    finally { setBusy(false); }
  };
  const failures = async () => { for (let i = 0; i < 3; i++) await attempt("unknown-demo", false); };
  const replay = async () => {
    setBusy(true);
    try {
      const key = state.registry[0]!.key;
      const capturedChallenge = generateChallenge();
      const capturedResponse = await computeResponse(key, capturedChallenge, "owner-demo");
      const freshChallenge = generateChallenge();
      const checked = await verifyResponse(state, "owner-demo", freshChallenge, capturedResponse, Date.now());
      setState(checked.state);
      setResult(`Rejected · ${checked.result.reason?.replaceAll("_", " ")} (captured response used with a fresh challenge)`);
    } catch { setResult("Web Crypto is unavailable in this browser context."); }
    finally { setBusy(false); }
  };
  return <><p className="lead">Local demonstration of the T14 challenge-response flow and lockout behavior. Demo keys are not production credentials.</p><div className="two-col"><Panel title="Try a scenario"><div className="button-stack"><button className="button primary" disabled={busy} onClick={() => void attempt("owner-demo")}>Authenticate as owner</button><button className="button secondary" disabled={busy} onClick={() => void attempt("technician-demo")}>Authenticate as technician</button><button className="button secondary" disabled={busy} onClick={() => void attempt("unknown-demo", false)}>Try unknown key</button><button className="button secondary" disabled={busy} onClick={() => void replay()}>Replay a captured response</button><button className="button secondary" disabled={busy} onClick={() => void failures()}>Trigger three failures</button></div><div className="auth-result"><span className="eyebrow">Latest result</span><strong>{result}</strong><small>Unknown ID failures: {state.failCounts["unknown-demo"] ?? 0} · Lockout: {Date.now() < (state.lockUntilMs["unknown-demo"] ?? 0) ? "active" : "inactive"}</small></div></Panel><Panel title="Protocol"><div className="list"><Row label="Challenge" value="16 random bytes" /><Row label="Response" value="HMAC-SHA256" /><Row label="Lockout" value="3 failures · 30 seconds" /><Row label="Replay" value="Captured response fails with fresh challenge" /></div><p className="footnote">Local UI demonstration. No BLE radio or external device is contacted.</p></Panel></div></>;
}

export default App;
