import { describe, it, expect } from "vitest";
import { createClient, buildChain } from "../client.js";
import { networks } from "../networks.js";
import { ConfigError } from "../errors.js";

const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("createClient", () => {
  it("builds a public client on aristotle (chain id 16661)", () => {
    const c = createClient({ network: "aristotle" });
    expect(c.public.chain?.id).toBe(16661);
    expect(c.wallet).toBeUndefined();
    expect(c.network.name).toBe("aristotle");
  });

  it("builds a wallet client when a private key is given", () => {
    const c = createClient({ network: "local", privateKey: TEST_PK });
    expect(c.wallet).toBeDefined();
    expect(c.wallet?.account?.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("honors an rpcUrl override", () => {
    const c = createClient({ network: "local", rpcUrl: "http://127.0.0.1:9999" });
    expect(c.public.chain?.id).toBe(31337);
    expect(c.public.chain?.rpcUrls.default.http[0]).toBe("http://127.0.0.1:9999");
  });

  it("throws ConfigError when the preset has no rpcUrl/chainId and none is passed", () => {
    expect(() =>
      buildChain({ ...networks.galileo, rpcUrl: undefined, chainId: undefined })
    ).toThrowError(ConfigError);
  });

  it("throws ConfigError for a malformed private key", () => {
    expect(() => createClient({ network: "local", privateKey: "0x1234" })).toThrowError(
      ConfigError
    );
  });
});
