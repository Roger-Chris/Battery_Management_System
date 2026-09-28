/**
 * Charge-enable relay (Songle SRD-05VDC-SL-C, docs/HARDWARE_SPEC.md BOM #I): an ideal switch
 * in the charge path. Contact resistance is not given in the handoff, so it defaults to 0
 * (ideal) and is only applied when a caller explicitly supplies a measured value.
 */
export interface Relay {
  closed: boolean;
}

export function relay(closed: boolean): Relay {
  return { closed };
}

/** Voltage delivered downstream of the relay, given the source voltage and the relay state. */
export function relayOutputV(source: Relay, sourceVoltageV: number, contactResistanceOhm = 0, currentA = 0): number {
  if (!source.closed) return 0;
  return sourceVoltageV - currentA * contactResistanceOhm;
}
