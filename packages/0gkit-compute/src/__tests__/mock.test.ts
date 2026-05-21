import { describe, it, expect } from "vitest";
import { mockComputeClient } from "@foundryprotocol/0gkit-testing";

describe("@foundryprotocol/0gkit-testing — mockComputeClient (Compute surface)", () => {
  it("returns a deterministic assistant response and tx receipt", async () => {
    const c = mockComputeClient();
    const r = await c.chat([
      { role: "system", content: "noop" },
      { role: "user", content: "ping" },
    ]);
    expect(r.role).toBe("assistant");
    expect(r.content).toBe("echo: ping");
    expect(r.tx.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("supports a custom responder for richer scenarios", async () => {
    const c = mockComputeClient({ responder: () => "stubbed" });
    const r = await c.chat([{ role: "user", content: "x" }]);
    expect(r.content).toBe("stubbed");
  });
});
