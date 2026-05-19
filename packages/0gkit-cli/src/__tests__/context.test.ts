import { describe, it, expect } from "vitest";
import { resolveContext } from "../context.js";

describe("resolveContext", () => {
  it("defaults to galileo with no flags or env", () => {
    const ctx = resolveContext({}, {});
    expect(ctx.network).toBe("galileo");
    expect(ctx.json).toBe(false);
    expect(ctx.rpcUrl).toBeUndefined();
  });

  it("env overrides preset default, flag overrides env", () => {
    const envOnly = resolveContext({}, { ZEROG_NETWORK: "aristotle" });
    expect(envOnly.network).toBe("aristotle");
    const flagWins = resolveContext(
      { network: "local" },
      { ZEROG_NETWORK: "aristotle" }
    );
    expect(flagWins.network).toBe("local");
  });

  it("resolves rpc, privateKey, json from flags then env", () => {
    const ctx = resolveContext(
      { rpc: "http://x", json: true },
      { ZEROG_PRIVATE_KEY: "abc" }
    );
    expect(ctx.rpcUrl).toBe("http://x");
    expect(ctx.privateKey).toBe("abc");
    expect(ctx.json).toBe(true);
  });

  it("throws ConfigError with hint for an unknown network", () => {
    expect(() => resolveContext({ network: "mainnet" }, {})).toThrowError(
      /Unknown network 'mainnet'/
    );
    try {
      resolveContext({ network: "mainnet" }, {});
    } catch (e) {
      expect((e as { code: string }).code).toBe("CONFIG");
      expect((e as { hint: string }).hint).toContain("aristotle");
    }
  });
});
