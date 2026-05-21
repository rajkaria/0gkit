import { describe, it, expect, vi, type Mock } from "vitest";
import { DA } from "../da.js";
import { ConfigError, NetworkError, type Signer } from "@foundryprotocol/0gkit-core";

describe("DA signer symmetry", () => {
  it("accepts { signer } and constructs without throwing; digest() still works", () => {
    const signer: Signer = {
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
      privateKey:
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`,
      signMessage: vi.fn() as unknown as Signer["signMessage"],
      signTypedData: vi.fn() as unknown as Signer["signTypedData"],
      sendTransaction: vi.fn() as unknown as Signer["sendTransaction"],
      source: "private-key",
    };
    const da = new DA({ signer });
    expect(da.signer).toBe(signer);
    expect(da.digest({ hello: "world" })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("DA.digest", () => {
  it("is stable under key reordering and 0x keccak", () => {
    const da = new DA({});
    expect(da.digest({ a: 1, b: 2 })).toBe(da.digest({ b: 2, a: 1 }));
    expect(da.digest({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("hashes raw bytes for a Uint8Array (not the JSON object-view)", async () => {
    const { keccak256, toHex } = await import("viem");
    const da = new DA({});
    const bytes = new Uint8Array([1, 2, 3]);
    expect(da.digest(bytes)).toBe(keccak256(toHex(bytes)));
    // and it must differ from the (buggy) object-view digest
    expect(da.digest(bytes)).not.toBe(da.digest({ 0: 1, 1: 2, 2: 3 }));
  });

  it("digests a string as raw UTF-8 (matches the upstream SDK DA contract)", async () => {
    const { keccak256, toHex } = await import("viem");
    const da = new DA({});
    const expected = keccak256(toHex(new TextEncoder().encode("hello")));
    expect(da.digest("hello")).toBe(expected);
    // and NOT the JSON-quoted form
    const jsonQuoted = keccak256(toHex(new TextEncoder().encode('"hello"')));
    expect(da.digest("hello")).not.toBe(jsonQuoted);
  });

  it("object digest still equals canonical-JSON keccak (on-chain anchor unchanged)", async () => {
    const { keccak256, toHex } = await import("viem");
    const core = await import("@foundryprotocol/0gkit-core");
    const da = new DA({});
    const obj = { b: 2, a: 1 };
    expect(da.digest(obj)).toBe(core.digestJson(obj));
    expect(da.digest(obj)).toBe(
      keccak256(toHex(new TextEncoder().encode(core.canonicalJsonStringify(obj))))
    );
  });
});

describe("DA.publish", () => {
  it("local mode when no encoder configured", async () => {
    const da = new DA({});
    const r = await da.publish({ hello: "world" });
    expect(r.mode).toBe("local");
    expect(r.daRef).toBeUndefined();
    expect(r.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typeof r.latencyMs).toBe("number");
  });

  it("live mode posts to the encoder and returns daRef + raw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ blobId: "blob_42", ref: "0g-da:blob_42" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const da = new DA({ encoderUrl: "https://enc.example", fetch: fetchMock });
    const r = await da.publish({ hello: "world" });
    expect(r.mode).toBe("live");
    expect(r.daRef).toBe("0g-da:blob_42");
    expect(r.blobId).toBe("blob_42");
    expect(r.raw).toEqual({ blobId: "blob_42", ref: "0g-da:blob_42" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://enc.example/blob",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("wraps a non-2xx encoder response in NetworkError", async () => {
    const da = new DA({
      encoderUrl: "https://enc.example",
      fetch: vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    });
    await expect(da.publish({ x: 1 })).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("wraps a thrown fetch error in NetworkError", async () => {
    const da = new DA({
      encoderUrl: "https://enc.example",
      fetch: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    await expect(da.publish({ x: 1 })).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("sends Authorization when apiKey is set, and daRef falls back to blobId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ blobId: "b1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const da = new DA({
      encoderUrl: "https://enc.example",
      apiKey: "secret",
      fetch: fetchMock,
    });
    const r = await da.publish({ a: 1 });
    expect(r.daRef).toBe("b1"); // no `ref` → falls back to blobId
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret"
    );
  });

  it("publish().digest of a Uint8Array equals digest(bytes) (round-trip)", async () => {
    const da = new DA({});
    const bytes = new Uint8Array([9, 8, 7]);
    const r = await da.publish(bytes); // local mode
    expect(r.digest).toBe(da.digest(bytes));
    expect(da.verify(bytes, r.digest)).toBe(true);
  });
});

describe("DA.verify", () => {
  it("returns true when payload matches the expected digest", () => {
    const da = new DA({});
    const d = da.digest({ a: 1 });
    expect(da.verify({ a: 1 }, d)).toBe(true);
    expect(da.verify({ a: 2 }, d)).toBe(false);
  });

  it("throws ConfigError for a malformed expected digest", () => {
    const da = new DA({});
    expect(() => da.verify({ a: 1 }, "deadbeef")).toThrowError(ConfigError);
  });
});
