/**
 * BLE HMAC-SHA256 challenge-response authentication with lockout, per test T14 (owner,
 * technician, unknown key, replay, lockout — docs/TEST_PLAN_EXPECTED_VS_MEASURED.md). Ported
 * from the challenge/response/lockout pattern in
 * reference/v2-scooter-sim/src/ui.js (`hmac`, the connect handler, `fails`/`lockUntil`), with
 * the UI/BLE-transport parts stripped out — this module is pure crypto + state, framework-free
 * per CLAUDE.md. Uses the Web Crypto API (`crypto.subtle`), available in both the browser and
 * Node 19+.
 */
export type Role = "owner" | "technician";

export interface RegisteredKey {
  id: string;
  role: Role;
  key: Uint8Array;
}

export interface BleAuthState {
  registry: RegisteredKey[];
  failCounts: Record<string, number>;
  lockUntilMs: Record<string, number>;
}

export interface AuthResult {
  ok: boolean;
  role?: Role;
  reason?: "locked_out" | "unknown_id" | "signature_mismatch";
}

export const MAX_FAILURES = 3;
export const LOCKOUT_MS = 30_000;
export const CHALLENGE_BYTES = 16;

export function initialBleAuthState(registry: RegisteredKey[]): BleAuthState {
  return { registry, failCounts: {}, lockUntilMs: {} };
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const cryptoKey = await subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function generateChallenge(randomBytes: (n: number) => Uint8Array = defaultRandomBytes): Uint8Array {
  return randomBytes(CHALLENGE_BYTES);
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Device-side: compute the HMAC response to a challenge for a claimed id. */
export async function computeResponse(deviceKey: Uint8Array, challenge: Uint8Array, claimedId: string): Promise<Uint8Array> {
  return hmacSha256(deviceKey, concatBytes(challenge, new TextEncoder().encode(claimedId)));
}

/** Node-side: verify a claimed id's response against the registry, applying lockout. */
export async function verifyResponse(
  state: BleAuthState,
  claimedId: string,
  challenge: Uint8Array,
  response: Uint8Array,
  nowMs: number,
): Promise<{ state: BleAuthState; result: AuthResult }> {
  const lockedUntilMs = state.lockUntilMs[claimedId] ?? 0;
  if (nowMs < lockedUntilMs) {
    return { state, result: { ok: false, reason: "locked_out" } };
  }

  const entry = state.registry.find((r) => r.id === claimedId);
  if (!entry) {
    return recordFailure(state, claimedId, nowMs, "unknown_id");
  }

  const expected = await hmacSha256(entry.key, concatBytes(challenge, new TextEncoder().encode(claimedId)));
  if (constantTimeEqual(expected, response)) {
    const failCounts = { ...state.failCounts, [claimedId]: 0 };
    return { state: { ...state, failCounts }, result: { ok: true, role: entry.role } };
  }

  return recordFailure(state, claimedId, nowMs, "signature_mismatch");
}

function recordFailure(
  state: BleAuthState,
  claimedId: string,
  nowMs: number,
  reason: "unknown_id" | "signature_mismatch",
): { state: BleAuthState; result: AuthResult } {
  const count = (state.failCounts[claimedId] ?? 0) + 1;
  const failCounts = { ...state.failCounts, [claimedId]: count };
  const lockUntilMs = { ...state.lockUntilMs };
  if (count >= MAX_FAILURES) {
    lockUntilMs[claimedId] = nowMs + LOCKOUT_MS;
    failCounts[claimedId] = 0;
  }
  return { state: { ...state, failCounts, lockUntilMs }, result: { ok: false, reason } };
}
