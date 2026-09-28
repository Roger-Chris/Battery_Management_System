/**
 * Charge control: drives the charge-enable relay (hardware/relay.ts) and clamps the
 * requested charge current, from the protection layer's decision.
 */
import { relay, type Relay } from "../hardware/relay";
import { clampChargeCurrentA } from "../hardware/charger";
import { CHARGE_CURRENT_CAP_A } from "./protection";

export function chargeRelayCommand(chargeAllowed: boolean): Relay {
  return relay(chargeAllowed);
}

export function commandedChargeCurrentA(chargeAllowed: boolean, requestedA: number): number {
  if (!chargeAllowed) return 0;
  return clampChargeCurrentA(requestedA, CHARGE_CURRENT_CAP_A);
}
