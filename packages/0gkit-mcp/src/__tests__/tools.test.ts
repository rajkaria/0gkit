import { describe, it, expect } from "vitest";
import { makeHandlers, defaultDeps, TOOLS, type McpDeps } from "../tools.js";
import { resolveNetwork } from "../context.js";

function parseResult(r: { content: Array<{ text: string }> }): any {
  return JSON.parse(r.content[0].text);
}

function stubDeps(over: Partial<McpDeps> = {}): McpDeps {
  return {
    createClient: (() => ({}) as any) as McpDeps["createClient"],
    getNetwork: ((n: string) => ({ name: n })) as unknown as McpDeps["getNetwork"],
    faucet: (async () => ({ txHash: "0xfee", latencyMs: 1 })) as any,
    balance: (async () => 1234000000000000000n) as any,
    attachExplorerUrl: ((tx: any) => ({
      ...tx,
      explorerUrl: "https://explorer/" + tx.txHash,
    })) as any,
    makeStorage: () =>
      ({
        upload: async () => ({ root: "0xroot", tx: { txHash: "0xtx" } }),
        download: async () => new TextEncoder().encode("hello"),
        exists: async () => true,
      }) as any,
    makeCompute: () =>
      ({
        inference: async () => ({
          output: "hi there",
          receipt: { txHash: "0xinfer", latencyMs: 42 },
        }),
      }) as any,
    makeDA: () =>
      ({
        publish: async () => ({
          digest: "0xdig",
          daRef: "ref1",
          mode: "local",
          latencyMs: 3,
        }),
        verify: (_p: unknown, d: string) => d === "0xdig",
      }) as any,
    attest: {
      parseEnvelope: ((v: unknown) => v) as any,
      verifyEnvelope: (async (_s: unknown, signer: string) => ({
        ok: signer === "0xgood",
        checks: { digest: true, signer: signer === "0xgood" },
        signer: "0xgood",
      })) as any,
      reportEnvelope: (() => "REPORT") as any,
    },
    env: {},
    ...over,
  };
}

describe("resolveNetwork", () => {
  it("defaults to galileo", () => {
    expect(resolveNetwork(undefined, {})).toBe("galileo");
  });
  it("honors ZEROG_NETWORK", () => {
    expect(resolveNetwork(undefined, { ZEROG_NETWORK: "aristotle" })).toBe("aristotle");
  });
  it("rejects an unknown network", () => {
    expect(() => resolveNetwork("mainnet", {})).toThrow(/Unknown network/);
  });
});

describe("TOOLS catalog", () => {
  it("exposes the nine neutral og_* tools", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "og_attest_verify",
        "og_chain_balance",
        "og_chain_faucet",
        "og_da_publish",
        "og_da_verify",
        "og_infer",
        "og_storage_exists",
        "og_storage_get",
        "og_storage_put",
      ].sort()
    );
  });
  it("never exposes a foundry tool from the neutral catalog", () => {
    expect(TOOLS.some((t) => /foundry|ingot/i.test(t.name))).toBe(false);
  });
});

describe("neutral handlers — happy path", () => {
  const h = makeHandlers(stubDeps({ env: { ZEROG_PRIVATE_KEY: "0xkey" } }));

  it("og_storage_put returns root + explorer tx", async () => {
    const r = parseResult(await h.og_storage_put({ data: "hello" }));
    expect(r).toMatchObject({
      root: "0xroot",
      txHash: "0xtx",
      explorerUrl: "https://explorer/0xtx",
      bytes: 5,
    });
  });
  it("og_storage_get decodes the bytes", async () => {
    const r = parseResult(await h.og_storage_get({ root: "0xroot" }));
    expect(r).toMatchObject({ root: "0xroot", bytes: 5, text: "hello" });
  });
  it("og_storage_exists", async () => {
    expect(parseResult(await h.og_storage_exists({ root: "0xr" })).exists).toBe(true);
  });
  it("og_da_publish + og_da_verify round-trip", async () => {
    const p = parseResult(await h.og_da_publish({ payload: "x" }));
    expect(p).toMatchObject({ digest: "0xdig", mode: "local" });
    const v = parseResult(await h.og_da_verify({ payload: "x", digest: "0xdig" }));
    expect(v).toEqual({ digest: "0xdig", verified: true });
  });
  it("og_chain_faucet", async () => {
    const r = parseResult(await h.og_chain_faucet({ address: "0xabc" }));
    expect(r).toEqual({ address: "0xabc", network: "galileo", txHash: "0xfee" });
  });
  it("og_chain_balance formats wei + zg", async () => {
    const r = parseResult(await h.og_chain_balance({ address: "0xabc" }));
    expect(r).toMatchObject({ wei: "1234000000000000000", zg: "1.234" });
  });
  it("og_infer", async () => {
    const r = parseResult(await h.og_infer({ message: "hey", provider: "0xprov" }));
    expect(r).toMatchObject({ output: "hi there", txHash: "0xinfer" });
  });
});

describe("neutral handlers — error mapping", () => {
  it("og_storage_put without a key → ConfigError with hint", async () => {
    const h = makeHandlers(stubDeps());
    const res = await h.og_storage_put({ data: "x" });
    expect(res.isError).toBe(true);
    const body = parseResult(res);
    expect(body.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(body.hint).toMatch(/ZEROG_PRIVATE_KEY/);
  });
  it("og_storage_put rejects unsupported network 'local'", async () => {
    const h = makeHandlers(stubDeps({ env: { ZEROG_PRIVATE_KEY: "k" } }));
    const res = await h.og_storage_put({ data: "x", network: "local" });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/does not support/);
  });
  it("og_infer requires a provider", async () => {
    const h = makeHandlers(stubDeps({ env: { ZEROG_BROKER_KEY: "k" } }));
    const res = await h.og_infer({ message: "x" });
    expect(res.isError).toBe(true);
    expect(parseResult(res).hint).toMatch(/ZEROG_PROVIDER/);
  });
  it("og_infer requires a broker key", async () => {
    const h = makeHandlers(stubDeps());
    const res = await h.og_infer({ message: "x", provider: "0xp" });
    expect(parseResult(res).hint).toMatch(/ZEROG_BROKER_KEY/);
  });
  it("zod validation failure surfaces as an error result", async () => {
    const h = makeHandlers(stubDeps());
    const res = await h.og_storage_get({});
    expect(res.isError).toBe(true);
  });
});

describe("og_attest_verify", () => {
  const h = makeHandlers(stubDeps());
  const good = JSON.stringify({
    envelope: { a: 1 },
    digest: "0xd",
    signature: "0xs",
  });

  it("verifies a valid envelope", async () => {
    const r = parseResult(
      await h.og_attest_verify({ signed_envelope: good, signer: "0xgood" })
    );
    expect(r.verified).toBe(true);
    expect(r.checks).toEqual({ digest: true, signer: true });
  });
  it("rejects a wrong signer (never throws)", async () => {
    const res = await h.og_attest_verify({
      signed_envelope: good,
      signer: "0xbad",
    });
    expect(res.isError).toBeUndefined();
    expect(parseResult(res).verified).toBe(false);
  });
  it("rejects malformed JSON", async () => {
    const res = await h.og_attest_verify({
      signed_envelope: "{not json",
      signer: "0xg",
    });
    expect(res.isError).toBe(true);
    expect(parseResult(res).hint).toMatch(/SignedEnvelope/);
  });
  it("rejects a non-SignedEnvelope shape", async () => {
    const res = await h.og_attest_verify({
      signed_envelope: JSON.stringify({ envelope: 1 }),
      signer: "0xg",
    });
    expect(res.isError).toBe(true);
  });
});

describe("defaultDeps", () => {
  it("wires real @foundryprotocol/0gkit-* constructors", () => {
    const d = defaultDeps({ ZEROG_NETWORK: "galileo" });
    expect(typeof d.makeStorage).toBe("function");
    expect(typeof d.makeCompute).toBe("function");
    expect(typeof d.makeDA).toBe("function");
    expect(d.env.ZEROG_NETWORK).toBe("galileo");
    expect(typeof d.attest.verifyEnvelope).toBe("function");
  });
});
