/**
 * Cumulative tap voltage -> per-cell voltage, per docs/HARDWARE_SPEC.md's net list
 * ("cell n = tap n - tap n-1").
 */
export function tapsToCellVoltages(tapVoltagesV: number[]): number[] {
  return tapVoltagesV.map((tap, i) => tap - (i > 0 ? tapVoltagesV[i - 1]! : 0));
}
