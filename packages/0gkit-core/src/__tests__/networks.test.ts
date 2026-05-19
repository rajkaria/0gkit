import { describe, it, expect } from "vitest";
import { networks, getNetwork } from "../networks.js";
import { ConfigError } from "../errors.js";

describe("network presets", () => {
  it("aristotle has the repo-proven chain id and RPC", () => {
    expect(networks.aristotle.chainId).toBe(16661);
    expect(networks.aristotle.rpcUrl).toBe("https://evmrpc.0g.ai");
    expect(networks.aristotle.testnet).toBe(false);
    expect(networks.aristotle.name).toBe("aristotle");
  });

  it("local is the standard Anvil preset", () => {
    expect(networks.local.chainId).toBe(31337);
    expect(networks.local.rpcUrl).toBe("http://127.0.0.1:8545");
    expect(networks.local.testnet).toBe(true);
  });

  it("galileo exists and is flagged testnet", () => {
    expect(networks.galileo.name).toBe("galileo");
    expect(networks.galileo.testnet).toBe(true);
  });

  it("getNetwork returns a known preset", () => {
    expect(getNetwork("aristotle")).toBe(networks.aristotle);
  });

  it("getNetwork throws ConfigError for an unknown name", () => {
    // @ts-expect-error testing the runtime guard
    expect(() => getNetwork("mainnet")).toThrowError(ConfigError);
  });
});
