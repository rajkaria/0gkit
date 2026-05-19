import { describe, it, expect } from "vitest";
import { explorerUrl, attachExplorerUrl } from "../explorer.js";
import type { NetworkPreset } from "@foundryprotocol/0gkit-core";
import { ConfigError } from "@foundryprotocol/0gkit-core";

const withExplorer: NetworkPreset = {
  name: "aristotle",
  chainId: 16661,
  rpcUrl: "https://evmrpc.0g.ai",
  explorer: "https://explorer.example",
  testnet: false,
};
const noExplorer: NetworkPreset = { ...withExplorer, explorer: undefined };

describe("explorerUrl", () => {
  it("builds a tx URL", () => {
    expect(explorerUrl(withExplorer, { tx: "0xabc" })).toBe(
      "https://explorer.example/tx/0xabc"
    );
  });

  it("builds an address URL", () => {
    expect(explorerUrl(withExplorer, { address: "0xdef" })).toBe(
      "https://explorer.example/address/0xdef"
    );
  });

  it("strips a trailing slash on the explorer base", () => {
    expect(
      explorerUrl(
        { ...withExplorer, explorer: "https://explorer.example/" },
        { tx: "0x1" }
      )
    ).toBe("https://explorer.example/tx/0x1");
    expect(
      explorerUrl(
        { ...withExplorer, explorer: "https://explorer.example///" },
        { tx: "0x1" }
      )
    ).toBe("https://explorer.example/tx/0x1");
  });

  it("throws ConfigError when the network has no explorer", () => {
    expect(() => explorerUrl(noExplorer, { tx: "0xabc" })).toThrowError(ConfigError);
  });

  it("attachExplorerUrl adds explorerUrl when the network has an explorer", () => {
    const r = attachExplorerUrl({ latencyMs: 1, txHash: "0xabc" }, withExplorer);
    expect(r.explorerUrl).toBe("https://explorer.example/tx/0xabc");
  });

  it("attachExplorerUrl is a no-op when the network has no explorer", () => {
    const r = attachExplorerUrl({ latencyMs: 1, txHash: "0xabc" }, noExplorer);
    expect(r.explorerUrl).toBeUndefined();
  });

  it("attachExplorerUrl is a no-op (no throw) when the receipt has no txHash", () => {
    const r = attachExplorerUrl({ latencyMs: 1 }, withExplorer);
    expect(r.explorerUrl).toBeUndefined();
  });
});
