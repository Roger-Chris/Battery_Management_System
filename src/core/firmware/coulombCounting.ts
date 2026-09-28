/**
 * Firmware-layer coulomb counting: integrates the *measured* (INA226-derived) current, not
 * ground truth, so its drift under a miscalibrated capacity is representative of what the Pi
 * would actually see. Same integral as core/cell/pack.ts's SOC update, applied to measurements.
 */
export function coulombCountStep(
  prevSocFraction: number,
  measuredCurrentA: number,
  dtS: number,
  capacityAh: number,
): number {
  const capacityAs = capacityAh * 3600;
  return prevSocFraction - (measuredCurrentA * dtS) / capacityAs;
}
