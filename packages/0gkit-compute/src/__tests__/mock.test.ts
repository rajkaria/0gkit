import { describe, it, expect } from "vitest";
import { mockComputeClient } from "@foundryprotocol/0gkit-testing";

describe("@foundryprotocol/0gkit-testing — mockComputeClient (Compute surface)", () => {
  it("returns a deterministic inference result", async () => {
    const c = mockComputeClient();
    const r = await c.inference({
      messages: [
        { role: "system", content: "noop" },
        { role: "user", content: "ping" },
      ],
    });
    expect(r.output).toBe("echo: ping");
    expect(r.receipt.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("supports a custom responder for richer scenarios", async () => {
    const c = mockComputeClient({ responder: () => "stubbed" });
    const r = await c.inference({ messages: [{ role: "user", content: "x" }] });
    expect(r.output).toBe("stubbed");
  });
});
