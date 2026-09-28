/**
 * 4S 16.8 V 2 A charger, modelled as an ideal CC-CV source: a voltage setpoint with a
 * current limit. The taper in constant-voltage phase emerges from combining this with the
 * pack's Thevenin-equivalent resistance (Phase 3 cell model) rather than a fabricated taper
 * curve. Setpoint 16.8 V and max current 2.0 A are the charger's own spec
 * (docs/HARDWARE_SPEC.md BOM #B); the acceptance band is test T0a's measured range.
 */
export const CHARGER_SETPOINT_V = 16.8;
export const CHARGER_MAX_CURRENT_A = 2.0;
/** Test T0a acceptance band for the charger's measured open-circuit voltage. */
export const CHARGER_OCV_ACCEPTANCE_V: [number, number] = [16.6, 17.0];

export function isChargerOcvAcceptable(measuredOcvV: number): boolean {
  return measuredOcvV >= CHARGER_OCV_ACCEPTANCE_V[0] && measuredOcvV <= CHARGER_OCV_ACCEPTANCE_V[1];
}

/** True once the pack voltage reaches the charger's CV setpoint (transition from CC to CV). */
export function isConstantVoltagePhase(packVoltageV: number, setpointV: number = CHARGER_SETPOINT_V): boolean {
  return packVoltageV >= setpointV;
}

/** Clamp a requested charge current to the charger's maximum output current. */
export function clampChargeCurrentA(requestedA: number, maxA: number = CHARGER_MAX_CURRENT_A): number {
  return Math.min(Math.max(requestedA, 0), maxA);
}
