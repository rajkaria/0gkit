import { describe, it, expect, vi } from "vitest";
import { fetchExplorerAbi } from "../explorer.js";

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe("fetchExplorerAbi", () => {
  it("hits the galileo chainscan /open/api getabi endpoint and parses the ABI", async () => {
    const abi = [{ type: "function", name: "balanceOf", inputs: [], outputs: [] }];
    const fetchImpl = vi.fn(async (_url: string) =>
      okJson({ status: "1", message: "OK", result: JSON.stringify(abi) })
    );
    const out = await fetchExplorerAbi("0xAbC", "galileo", {
      fetch: fetchImpl as never,
    });
    // The real API base is /open/api, NOT /api (which serves the SPA HTML).
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain("chainscan-galileo.0g.ai/open/api");
    expect(calledUrl).toContain("module=contract");
    expect(calledUrl).toContain("action=getabi");
    expect(calledUrl).toContain("address=0xAbC");
    expect(out).toEqual(abi);
  });

  it("targets the mainnet explorer for the aristotle network", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      okJson({ status: "1", message: "OK", result: "[]" })
    );
    await fetchExplorerAbi("0xAbC", "aristotle", { fetch: fetchImpl as never });
    expect(fetchImpl.mock.calls[0][0]).toContain("chainscan.0g.ai/open/api");
  });

  it("appends an apikey only when one is provided", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      okJson({ status: "1", message: "OK", result: "[]" })
    );
    await fetchExplorerAbi("0xAbC", "galileo", {
      fetch: fetchImpl as never,
      apiKey: "SECRET123",
    });
    expect(fetchImpl.mock.calls[0][0]).toContain("apikey=SECRET123");

    const noKey = vi.fn(async (_url: string) =>
      okJson({ status: "1", message: "OK", result: "[]" })
    );
    await fetchExplorerAbi("0xAbC", "galileo", { fetch: noKey as never });
    expect(noKey.mock.calls[0][0]).not.toContain("apikey");
  });

  it("throws a typed ConfigError when the contract is not verified", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      okJson({
        status: "0",
        message: "NOTOK",
        result: "Contract source code not verified",
      })
    );
    await expect(
      fetchExplorerAbi("0xAbC", "galileo", { fetch: fetchImpl as never })
    ).rejects.toThrow(/not verified/i);
  });

  it("throws when the network has no explorer (local)", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchExplorerAbi("0xAbC", "local", { fetch: fetchImpl as never })
    ).rejects.toThrow(/explorer/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-ok HTTP status", async () => {
    const fetchImpl = vi.fn(async (_url: string) => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    await expect(
      fetchExplorerAbi("0xAbC", "galileo", { fetch: fetchImpl as never })
    ).rejects.toThrow(/HTTP 503/i);
  });

  it("throws on a malformed ABI payload", async () => {
    const fetchImpl = vi.fn(async (_url: string) =>
      okJson({ status: "1", message: "OK", result: "not-json" })
    );
    await expect(
      fetchExplorerAbi("0xAbC", "galileo", { fetch: fetchImpl as never })
    ).rejects.toThrow(/malformed/i);
  });
});
