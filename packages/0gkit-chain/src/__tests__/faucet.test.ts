import { describe, it, expect, vi, afterEach } from "vitest";
import { faucet } from "../faucet.js";
import type { NetworkPreset } from "@foundryprotocol/0gkit-core";

const galileoProgrammatic: NetworkPreset = {
  name: "galileo",
  chainId: 1,
  rpcUrl: "https://rpc.example",
  faucetUrl: "https://faucet.example/api/drip",
  faucetWebUrl: "https://faucet.example",
  testnet: true,
};
const galileoNoApi: NetworkPreset = {
  ...galileoProgrammatic,
  faucetUrl: undefined,
};

afterEach(() => vi.unstubAllGlobals());

describe("faucet", () => {
  it("POSTs to the configured faucet endpoint and returns a Receipt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ txHash: "0xabc" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const r = await faucet(
      galileoProgrammatic,
      "0x1111111111111111111111111111111111111111"
    );
    expect(r.txHash).toBe("0xabc");
    expect(typeof r.latencyMs).toBe("number");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://faucet.example/api/drip",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws ConfigError with the web faucet URL in the hint when no API is configured", async () => {
    await expect(
      faucet(galileoNoApi, "0x1111111111111111111111111111111111111111")
    ).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
      hint: expect.stringContaining("https://faucet.example"),
    });
  });

  it("throws NetworkError when the faucet endpoint errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 }))
    );
    await expect(
      faucet(galileoProgrammatic, "0x1111111111111111111111111111111111111111")
    ).rejects.toMatchObject({ code: "CHAIN_RPC_UNREACHABLE" });
  });

  it("throws NetworkError when fetch itself rejects (e.g. DNS failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      faucet(galileoProgrammatic, "0x1111111111111111111111111111111111111111")
    ).rejects.toMatchObject({
      code: "CHAIN_RPC_UNREACHABLE",
      message: expect.stringContaining("Faucet request failed"),
    });
  });
});
