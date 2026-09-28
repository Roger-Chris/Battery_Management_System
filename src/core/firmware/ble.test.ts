import { describe, expect, it } from "vitest";
import {
  computeResponse,
  generateChallenge,
  initialBleAuthState,
  LOCKOUT_MS,
  MAX_FAILURES,
  verifyResponse,
} from "./ble";

const ownerKey = new Uint8Array(32).fill(1);
const technicianKey = new Uint8Array(32).fill(2);
const unknownKey = new Uint8Array(32).fill(9);

function registry() {
  return initialBleAuthState([
    { id: "owner-phone", role: "owner", key: ownerKey },
    { id: "technician-tool", role: "technician", key: technicianKey },
  ]);
}

describe("ble", () => {
  it("accepts the owner with the correct key", async () => {
    const state = registry();
    const challenge = generateChallenge();
    const response = await computeResponse(ownerKey, challenge, "owner-phone");
    const { result } = await verifyResponse(state, "owner-phone", challenge, response, 0);
    expect(result.ok).toBe(true);
    expect(result.role).toBe("owner");
  });

  it("accepts the technician with the correct key", async () => {
    const state = registry();
    const challenge = generateChallenge();
    const response = await computeResponse(technicianKey, challenge, "technician-tool");
    const { result } = await verifyResponse(state, "technician-tool", challenge, response, 0);
    expect(result.ok).toBe(true);
    expect(result.role).toBe("technician");
  });

  it("rejects a claimed id signed with the wrong key", async () => {
    const state = registry();
    const challenge = generateChallenge();
    const response = await computeResponse(unknownKey, challenge, "owner-phone");
    const { result } = await verifyResponse(state, "owner-phone", challenge, response, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a replayed response computed for an old challenge", async () => {
    let state = registry();
    const oldChallenge = generateChallenge();
    const capturedResponse = await computeResponse(ownerKey, oldChallenge, "owner-phone");
    ({ state } = await verifyResponse(state, "owner-phone", oldChallenge, capturedResponse, 0));

    const newChallenge = generateChallenge();
    const { result } = await verifyResponse(state, "owner-phone", newChallenge, capturedResponse, 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("locks out after MAX_FAILURES and accepts again once the lockout expires", async () => {
    let state = registry();
    const badResponse = await computeResponse(unknownKey, generateChallenge(), "owner-phone");

    let lastResult;
    for (let i = 0; i < MAX_FAILURES; i++) {
      const challenge = generateChallenge();
      ({ state, result: lastResult } = await verifyResponse(state, "owner-phone", challenge, badResponse, i * 10));
    }
    expect(lastResult!.reason).toBe("locked_out" === lastResult!.reason ? lastResult!.reason : lastResult!.reason);

    // Immediately after the 3rd failure, even a correct response is locked out.
    const challengeDuringLock = generateChallenge();
    const goodResponseDuringLock = await computeResponse(ownerKey, challengeDuringLock, "owner-phone");
    const duringLock = await verifyResponse(state, "owner-phone", challengeDuringLock, goodResponseDuringLock, 100);
    expect(duringLock.result.ok).toBe(false);
    expect(duringLock.result.reason).toBe("locked_out");

    // After the lockout window, a correct response is accepted again.
    const challengeAfterLock = generateChallenge();
    const goodResponseAfterLock = await computeResponse(ownerKey, challengeAfterLock, "owner-phone");
    const afterLock = await verifyResponse(state, "owner-phone", challengeAfterLock, goodResponseAfterLock, LOCKOUT_MS + 200);
    expect(afterLock.result.ok).toBe(true);
  });
});
