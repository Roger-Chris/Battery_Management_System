/**
 * OCV(SOC) lookup from the cell profile's own table (data/cell_profiles/*.json), piecewise
 * linear between knots. While that table is provisional (borrowed from a different NMC cell —
 * see the JSON's own `ocv_curve.ref`), dependent traces show an uncertainty band per CLAUDE.md
 * rule 2.
 */
import type { CellProfile } from "../config/cellProfile";
import { isProvisional } from "../config/provenance";

export function ocvFromSoc(socFraction: number, profile: CellProfile): number {
  const { soc, ocv_V } = profile.fields.ocv_curve.value;
  const s = Math.min(1, Math.max(0, socFraction));
  const n = soc.length;
  if (s <= soc[0]!) return ocv_V[0]!;
  if (s >= soc[n - 1]!) return ocv_V[n - 1]!;
  for (let i = 1; i < n; i++) {
    if (s <= soc[i]!) {
      const s0 = soc[i - 1]!;
      const s1 = soc[i]!;
      const v0 = ocv_V[i - 1]!;
      const v1 = ocv_V[i]!;
      const t = (s - s0) / (s1 - s0);
      return v0 + t * (v1 - v0);
    }
  }
  return ocv_V[n - 1]!;
}

/**
 * The profile's `ocv_curve.ref` states: "Replace with T8. Expect tens of mV deviation."
 * Interpreted as a ±30 mV band — derived from that disclosed note, not invented from nothing.
 */
export const OCV_PROVISIONAL_BAND_V = 0.03;

export function ocvUncertaintyBandV(profile: CellProfile): number {
  return isProvisional(profile.fields.ocv_curve) ? OCV_PROVISIONAL_BAND_V : 0;
}

export interface OcvBand {
  nominalV: number;
  lowV: number;
  highV: number;
}

export function ocvWithBand(socFraction: number, profile: CellProfile): OcvBand {
  const nominalV = ocvFromSoc(socFraction, profile);
  const band = ocvUncertaintyBandV(profile);
  return { nominalV, lowV: nominalV - band, highV: nominalV + band };
}
