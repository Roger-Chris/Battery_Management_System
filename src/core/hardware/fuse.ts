/**
 * 5 A ATO fuse: generic I²t melting-integral model. docs/HARDWARE_SPEC.md names the part
 * ("5 A ATO blade fuse, Littelfuse 257 series if available") but the handoff does not include
 * digitized let-through I²t curve points from that datasheet. Per CLAUDE.md ("never invent a
 * datasheet value; ask"), this module does not fabricate a curve constant — the caller must
 * supply the let-through I²t threshold (A²·s) sourced from the Littelfuse 257 datasheet.
 */
export interface FuseState {
  /** Accumulated I²t (A²·s) since the fuse was last replaced/reset. */
  integratedISquaredT: number;
  blown: boolean;
}

export function initialFuseState(): FuseState {
  return { integratedISquaredT: 0, blown: false };
}

/**
 * Advance the fuse's I²t integrator by `dtS` at `currentA`. Blows once the accumulated I²t
 * reaches `letThroughISquaredT` (A²·s) — a value that must come from the Littelfuse 257
 * datasheet's fast-acting curve, not this function.
 */
export function stepFuse(prev: FuseState, currentA: number, dtS: number, letThroughISquaredT: number): FuseState {
  if (prev.blown) return prev;
  const integratedISquaredT = prev.integratedISquaredT + currentA ** 2 * dtS;
  return { integratedISquaredT, blown: integratedISquaredT >= letThroughISquaredT };
}
