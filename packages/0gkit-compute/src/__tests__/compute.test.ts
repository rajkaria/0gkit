import { describe, it, expect, vi, beforeEach } from "vitest";
import { Compute, __resetDeprecationWarning } from "../compute.js";
import { ConfigError, NetworkError } from "@foundryprotocol/0gkit-core";

function fakeBrokerMod(over: Record<string, unknown> = {}) {
  const inference = {
    acknowledgeProviderSigner: vi.fn().mockResolvedValue(undefined),
    getServiceMetadata: vi
      .fn()
      .mockResolvedValue({ endpoint: "https://prov.example", model: "m1" }),
    getRequestHeaders: vi.fn().mockResolvedValue({ Authorization: "tok" }),
    processResponse: vi.fn().mockResolvedValue({ valid: true, txHash: "0xfee" }),
    listService: vi.fn().mockResolvedValue([{ provider: "0xprov", model: "m1" }]),
    ...over,
  };
  return {
    createZGComputeNetworkBroker: vi.fn().mockResolvedValue({ inference }),
    __inference: inference,
  };
}

const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const baseCfg = {
  brokerKey: ANVIL_KEY,
  provider: "0xprov",
};

describe("Compute", () => {
  beforeEach(() => {
    __resetDeprecationWarning();
  });

  it("accepts { signer } and uses signer.privateKey as the broker key", async () => {
    const mod = fakeBrokerMod();
    const signer = {
      privateKey: ANVIL_KEY,
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      sendTransaction: vi.fn(),
      source: "private-key" as const,
    };
    const c = new Compute({
      signer,
      provider: "0xprov",
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const list = await c.listProviders();
    expect(list).toBeDefined();
  });

  it("emits a deprecation warning once for { brokerKey }, not again on repeat", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = fakeBrokerMod();
    const make = () =>
      new Compute({
        ...baseCfg,
        loadBroker: async () => mod as never,
        loadEthers: async () =>
          ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
      });
    await make().listProviders();
    await make().listProviders();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("brokerKey");
    warnSpy.mockRestore();
  });

  it("accepts a KMS-style signer (no privateKey) and throws ConfigError on getBroker", async () => {
    const kmsSigner = {
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      signMessage: vi.fn(),
      signTypedData: vi.fn(),
      sendTransaction: vi.fn(),
      source: "kms" as const,
    };
    const c = new Compute({ signer: kmsSigner, provider: "0xprov" });
    await expect(c.listProviders()).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("listProviders returns the broker service list", async () => {
    const mod = fakeBrokerMod();
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const list = await c.listProviders();
    expect(list).toEqual([{ provider: "0xprov", model: "m1" }]);
  });

  it("inference calls the provider endpoint and returns output + receipt + raw", async () => {
    const mod = fakeBrokerMod();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const c = new Compute({
      ...baseCfg,
      fetch: fetchMock,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const r = await c.inference({ messages: [{ role: "user", content: "yo" }] });
    expect(r.output).toBe("hi");
    expect(r.receipt.txHash).toBe("0xfee");
    expect(typeof r.receipt.latencyMs).toBe("number");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://prov.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
    expect(r.raw).toBeDefined();
  });

  it("wraps a non-2xx provider response in NetworkError", async () => {
    const c = new Compute({
      ...baseCfg,
      fetch: vi.fn().mockResolvedValue(new Response("no", { status: 502 })),
      loadBroker: async () => fakeBrokerMod() as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(
      c.inference({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("throws ConfigError when neither signer nor brokerKey is provided", async () => {
    const c = new Compute({ provider: "0xprov" });
    await expect(c.listProviders()).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("openai() exposes a chat.completions.create shim", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "shim" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const c = new Compute({
      ...baseCfg,
      fetch: fetchMock,
      loadBroker: async () => fakeBrokerMod() as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const oa = c.openai();
    const res = await oa.chat.completions.create({
      messages: [{ role: "user", content: "hey" }],
    });
    expect(res.choices[0].message.content).toBe("shim");
  });

  it("falls back to @0glabs/0g-serving-broker when the new pkg name is missing", async () => {
    const mod = fakeBrokerMod();
    let triedNew = false;
    const c = new Compute({
      ...baseCfg,
      loadBroker: async (name: string) => {
        if (name === "@0gfoundation/0g-compute-ts-sdk") {
          triedNew = true;
          throw new Error("Cannot find module");
        }
        return mod as never;
      },
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await c.listProviders();
    expect(triedNew).toBe(true);
  });

  it("wraps a fetch-level network error in NetworkError", async () => {
    const c = new Compute({
      ...baseCfg,
      fetch: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      loadBroker: async () => fakeBrokerMod() as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(
      c.inference({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("throws ConfigError when both SDK packages are missing", async () => {
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => {
        throw new Error("Cannot find module");
      },
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(c.listProviders()).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("wraps getServiceMetadata rejection in NetworkError", async () => {
    const mod = fakeBrokerMod({
      getServiceMetadata: vi.fn().mockRejectedValue(new Error("meta down")),
    });
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(
      c.inference({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("wraps getRequestHeaders rejection in NetworkError", async () => {
    const mod = fakeBrokerMod({
      getRequestHeaders: vi.fn().mockRejectedValue(new Error("hdr down")),
    });
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(
      c.inference({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("throws ConfigError when the SDK lacks createZGComputeNetworkBroker", async () => {
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => ({}) as never, // no createZGComputeNetworkBroker
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    await expect(c.listProviders()).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("throws ConfigError when ethers cannot be loaded", async () => {
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => fakeBrokerMod() as never,
      loadEthers: async () => {
        throw new Error("Cannot find module 'ethers'");
      },
    });
    await expect(c.listProviders()).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("inference still returns when processResponse throws (best-effort fee)", async () => {
    const mod = fakeBrokerMod({
      processResponse: vi.fn().mockRejectedValue(new Error("fee oops")),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const c = new Compute({
      ...baseCfg,
      fetch: fetchMock,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const r = await c.inference({ messages: [{ role: "user", content: "x" }] });
    expect(r.output).toBe("ok");
    expect(r.receipt.txHash).toBeUndefined();
  });

  it("raw() returns the underlying broker", async () => {
    const mod = fakeBrokerMod();
    const c = new Compute({
      ...baseCfg,
      loadBroker: async () => mod as never,
      loadEthers: async () =>
        ({ Wallet: class {}, JsonRpcProvider: class {} }) as never,
    });
    const broker = (await c.raw()) as { inference: unknown };
    expect(broker.inference).toBeDefined();
  });
});
