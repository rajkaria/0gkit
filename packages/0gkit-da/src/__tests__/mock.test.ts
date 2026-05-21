import { describe, it, expect } from "vitest";
import { mockDAClient } from "@foundryprotocol/0gkit-testing";

describe("@foundryprotocol/0gkit-testing — mockDAClient (DA surface)", () => {
  it("publishes then verifies the same bytes", async () => {
    const d = mockDAClient();
    const bytes = new TextEncoder().encode("payload");
    const { digest } = await d.publish(bytes);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await d.verify(digest, bytes)).toBe(true);
  });

  it("catches tampered bytes (the whole point of DA)", async () => {
    const d = mockDAClient();
    const original = new TextEncoder().encode("trusted");
    const { digest } = await d.publish(original);
    const tampered = new TextEncoder().encode("trusted!");
    expect(await d.verify(digest, tampered)).toBe(false);
  });
});
