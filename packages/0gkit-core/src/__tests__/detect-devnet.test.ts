import { describe, expect, it, vi } from "vitest";
import { detectLocalDevnet } from "../index.js";
import { local } from "../networks.js";

describe("detectLocalDevnet", () => {
  it("returns true when local RPC responds with the local preset chainId", async () => {
    const fakeClient = { getChainId: vi.fn().mockResolvedValue(local.chainId) };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(true);
  });

  it("returns false when the chainId doesn't match", async () => {
    const fakeClient = { getChainId: vi.fn().mockResolvedValue(99n) };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(false);
  });

  it("returns false when the probe throws (RPC unreachable)", async () => {
    const fakeClient = {
      getChainId: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(false);
  });

  it("times out after the requested deadline and returns false", async () => {
    const slow = {
      getChainId: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(local.chainId!), 5000)
        ),
    };
    const start = Date.now();
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => slow,
      timeoutMs: 100,
    });
    expect(ok).toBe(false);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
