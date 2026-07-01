import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Compute, __resetDeprecationWarning } from "../compute.js";

const ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

const loadEthers = async () =>
  ({ Wallet: class {}, JsonRpcProvider: class {} }) as never;

/** Broker fake whose per-provider endpoint/metadata is derived from the address. */
function fakeBroker(providers: unknown[], over: Record<string, unknown> = {}) {
  const inference = {
    acknowledgeProviderSigner: vi.fn().mockResolvedValue(undefined),
    getServiceMetadata: vi.fn(async (p: string) => ({
      endpoint: `https://${p}.example`,
      model: "m1",
    })),
    getRequestHeaders: vi.fn().mockResolvedValue({ Authorization: "tok" }),
    processResponse: vi.fn().mockResolvedValue({ valid: true, txHash: "0xfee" }),
    listService: vi.fn().mockResolvedValue(providers),
    ...over,
  };
  return {
    createZGComputeNetworkBroker: vi.fn().mockResolvedValue({ inference }),
    __inference: inference,
  };
}

function okResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Compute.inference — per-call provider override (drift #2)", () => {
  it("prefers a per-call `provider` over the constructor `provider`", async () => {
    const mod = fakeBroker([]);
    const fetchMock = vi.fn().mockResolvedValue(okResponse("hi"));
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      provider: "0xCONFIG",
      fetch: fetchMock,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    await c.inference({ provider: "0xOVERRIDE", messages: [{ role: "user", content: "x" }] });
    expect(mod.__inference.getServiceMetadata).toHaveBeenCalledWith("0xOVERRIDE");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://0xOVERRIDE.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("still uses the constructor `provider` when no per-call provider is given", async () => {
    const mod = fakeBroker([]);
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      provider: "0xCONFIG",
      fetch: vi.fn().mockResolvedValue(okResponse("hi")),
      loadBroker: async () => mod as never,
      loadEthers,
    });
    await c.inference({ messages: [{ role: "user", content: "x" }] });
    expect(mod.__inference.getServiceMetadata).toHaveBeenCalledWith("0xCONFIG");
  });
});

describe("Compute.router — real 0G Router endpoint (primary path)", () => {
  it("POSTs to the testnet router with a Bearer key and returns the completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("routed"));
    const c = new Compute({
      network: "galileo",
      routerApiKey: "sk-test",
      fetch: fetchMock,
    });
    const r = await c.router({ model: "llama-3.1-8b", messages: [{ role: "user", content: "hi" }] });
    expect(r.output).toBe("routed");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://router-api-testnet.integratenetwork.work/v1/chat/completions");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("llama-3.1-8b");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("uses the mainnet router URL for network=aristotle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok"));
    const c = new Compute({ network: "aristotle", routerApiKey: "sk", fetch: fetchMock });
    await c.router({ model: "m", messages: [{ role: "user", content: "x" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://router-api.0g.ai/v1/chat/completions");
  });

  it("honours an explicit `routerUrl` override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok"));
    const c = new Compute({ routerApiKey: "sk", routerUrl: "https://my.router/v1", fetch: fetchMock });
    await c.router({ model: "m", messages: [{ role: "user", content: "x" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://my.router/v1/chat/completions");
  });

  it("passes a `sort` routing knob through to the endpoint body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok"));
    const c = new Compute({ routerApiKey: "sk", fetch: fetchMock });
    await c.router({ model: "m", sort: "price", messages: [{ role: "user", content: "x" }] });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.sort).toBe("price");
  });

  it("throws ConfigError when the router endpoint is used without a model", async () => {
    const c = new Compute({ routerApiKey: "sk", fetch: vi.fn() });
    await expect(
      c.router({ messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CONFIG_INVALID_ARGUMENT" });
  });

  it("wraps a non-2xx router response in NetworkError", async () => {
    const c = new Compute({
      routerApiKey: "sk",
      fetch: vi.fn().mockResolvedValue(new Response("no", { status: 401 })),
    });
    await expect(
      c.router({ model: "m", messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });
});

describe("Compute.router — client-side fallback (no ROUTER_API_KEY)", () => {
  beforeEach(() => {
    __resetDeprecationWarning();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("selects by model then retries the next candidate on failure", async () => {
    const providers = [
      { provider: "0xA", model: "m1" },
      { provider: "0xB", model: "m2" },
      { provider: "0xC", model: "m1" },
    ];
    const mod = fakeBroker(providers);
    // order for model m1 = [0xA, 0xC, 0xB]; fail 0xA, succeed 0xC
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("0xA")) throw new Error("ECONNREFUSED");
      if (url.includes("0xC")) return okResponse("from-C");
      return okResponse("from-other");
    });
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      fetch: fetchMock as never,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    const r = await c.router({ model: "m1", messages: [{ role: "user", content: "hi" }] });
    expect(r.output).toBe("from-C");
  });

  it("calls the only provider directly when there is exactly one", async () => {
    const mod = fakeBroker([{ provider: "0xSOLO", model: "m1" }]);
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      fetch: vi.fn().mockResolvedValue(okResponse("solo")) as never,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    const r = await c.router({ model: "m1", messages: [{ role: "user", content: "hi" }] });
    expect(r.output).toBe("solo");
  });

  it("throws a typed NetworkError when zero providers are reachable", async () => {
    const mod = fakeBroker([]);
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    await expect(
      c.router({ model: "m1", messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("warns once that it is routing client-side (set ROUTER_API_KEY to use the 0G Router)", async () => {
    const mod = fakeBroker([{ provider: "0xSOLO", model: "m1" }]);
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      fetch: vi.fn().mockResolvedValue(okResponse("solo")) as never,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    await c.router({ model: "m1", messages: [{ role: "user", content: "hi" }] });
    await c.router({ model: "m1", messages: [{ role: "user", content: "hi" }] });
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>;
    const routingWarns = warn.mock.calls.filter((a) =>
      String(a[0]).includes("ROUTER_API_KEY")
    );
    expect(routingWarns).toHaveLength(1);
  });
});

describe("Compute.direct — explicit-provider alias", () => {
  it("forwards to inference for a given provider (same output)", async () => {
    const mod = fakeBroker([]);
    const c = new Compute({
      brokerKey: ANVIL_KEY,
      fetch: vi.fn().mockResolvedValue(okResponse("direct")) as never,
      loadBroker: async () => mod as never,
      loadEthers,
    });
    const r = await c.direct({ provider: "0xDIRECT", messages: [{ role: "user", content: "x" }] });
    expect(r.output).toBe("direct");
    expect(mod.__inference.getServiceMetadata).toHaveBeenCalledWith("0xDIRECT");
  });
});
