/**
 * Provenance-typed parameters. CLAUDE.md: "Every constant carries `source` and `ref`.
 * Never invent a datasheet value; ask." No bare numbers belong in model code — every
 * constant that feeds a calculation should be a `Parameter<T>` from this module or `bom.ts`.
 */

export type ProvenanceSource =
  | "datasheet"
  | "listing"
  | "derived"
  | "literature"
  | "measured"
  | "provisional"
  | "assumed";

export interface Parameter<T> {
  value: T;
  unit: string;
  source: ProvenanceSource;
  ref: string;
  /** Set when the handoff explicitly flags this figure VERIFY against the physical part. */
  verify?: boolean;
}

const PROVISIONAL_SOURCES: ReadonlySet<ProvenanceSource> = new Set([
  "listing",
  "provisional",
  "assumed",
]);

/** True when the UI must show the "Provisional" badge for this parameter. */
export function isProvisional(param: Parameter<unknown>): boolean {
  return PROVISIONAL_SOURCES.has(param.source) || param.verify === true;
}
