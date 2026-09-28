import { describe, expect, it } from "vitest";
import { relay, relayOutputV } from "./relay";

describe("relay", () => {
  it("passes the source voltage through when closed", () => {
    expect(relayOutputV(relay(true), 16.8)).toBe(16.8);
  });

  it("blocks the source voltage when open", () => {
    expect(relayOutputV(relay(false), 16.8)).toBe(0);
  });

  it("drops voltage across an explicit contact resistance", () => {
    expect(relayOutputV(relay(true), 16.8, 0.1, 2.0)).toBeCloseTo(16.6, 9);
  });
});
