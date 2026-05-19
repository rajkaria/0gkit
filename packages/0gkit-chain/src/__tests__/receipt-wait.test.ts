import { describe, it, expect, vi } from "vitest";
import { waitForReceipt } from "../receipt-wait.js";
import type { NetworkPreset } from "@foundryprotocol/0gkit-core";

const net: NetworkPreset = {
  name: "aristotle",
  chainId: 16661,
  rpcUrl: "https://evmrpc.0g.ai",
  explorer: "https://explorer.example",
  testnet: false,
};

describe("waitForReceipt", () => {
  it("returns a Receipt with txHash, blockNumber, explorerUrl, latencyMs", async () => {
    const client = {
      network: net,
      public: {
        waitForTransactionReceipt: vi
          .fn()
          .mockResolvedValue({ transactionHash: "0xabc", blockNumber: 42n }),
      },
    } as any;

    const r = await waitForReceipt(client, "0xabc");
    expect(r.txHash).toBe("0xabc");
    expect(r.blockNumber).toBe(42n);
    expect(r.explorerUrl).toBe("https://explorer.example/tx/0xabc");
    expect(typeof r.latencyMs).toBe("number");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("omits explorerUrl when the network has no explorer", async () => {
    const client = {
      network: { ...net, explorer: undefined },
      public: {
        waitForTransactionReceipt: vi
          .fn()
          .mockResolvedValue({ transactionHash: "0xabc", blockNumber: 1n }),
      },
    } as any;
    const r = await waitForReceipt(client, "0xabc");
    expect(r.explorerUrl).toBeUndefined();
  });

  it("wraps failures in a ChainError", async () => {
    const client = {
      network: net,
      public: {
        waitForTransactionReceipt: vi.fn().mockRejectedValue(new Error("reverted")),
      },
    } as any;
    await expect(waitForReceipt(client, "0xabc")).rejects.toMatchObject({
      code: "CHAIN",
    });
  });
});
