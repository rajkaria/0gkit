import { describe, it, expect, vi, beforeEach } from "vitest";
import { Storage, __resetDeprecationWarning } from "../storage.js";
import { ConfigError, NetworkError } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";

function fakeSdk(opts: {
  uploadResult?: unknown;
  uploadErr?: Error | null;
  blob?: Blob | null;
  blobErr?: Error | null;
  root?: string;
}) {
  return {
    MemData: class {
      constructor(public data: number[]) {}
      async merkleTree() {
        return [{ rootHash: () => opts.root ?? "0xroot" }, null] as const;
      }
    },
    Indexer: class {
      constructor(public url: string) {}
      async upload() {
        return [
          opts.uploadResult ?? { txHash: "0xtx", rootHash: "0xroot", txSeq: 1 },
          opts.uploadErr ?? null,
        ] as const;
      }
      async downloadToBlob() {
        return [
          opts.blob === null
            ? null
            : (opts.blob ?? new Blob([new Uint8Array([1, 2, 3])])),
          opts.blobErr ?? null,
        ] as const;
      }
      async peekHeader() {
        return [opts.blob === null ? null : {}, opts.blobErr ?? null] as const;
      }
    },
  };
}

const cfg = (over: Record<string, unknown> = {}) => ({
  network: "galileo" as const,
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  ...over,
});

const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("Storage", () => {
  beforeEach(() => {
    __resetDeprecationWarning();
  });

  it("resolves the galileo indexer default", () => {
    const s = new Storage(cfg());
    expect(s.indexerUrl).toBe("https://indexer-storage-testnet.0g.ai");
  });

  it("upload returns root + receipt + raw", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    const r = await s.upload(new Uint8Array([1, 2, 3]));
    expect(r.root).toBe("0xroot");
    expect(r.tx.txHash).toBe("0xtx");
    expect(typeof r.tx.latencyMs).toBe("number");
    expect(r.raw).toEqual({ txHash: "0xtx", rootHash: "0xroot", txSeq: 1 });
  });

  it("upload discriminates the multi-root union shape", async () => {
    const s = new Storage(
      cfg({
        loadSdk: async () =>
          fakeSdk({
            uploadResult: {
              txHashes: ["0xtxA"],
              rootHashes: ["0xrootA"],
              txSeqs: [7],
            },
          }),
      })
    );
    const r = await s.upload(new Uint8Array([9]));
    expect(r.root).toBe("0xrootA");
    expect(r.tx.txHash).toBe("0xtxA");
  });

  it("wraps an SDK upload error in NetworkError", async () => {
    const s = new Storage(
      cfg({ loadSdk: async () => fakeSdk({ uploadErr: new Error("indexer down") }) })
    );
    await expect(s.upload(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CHAIN_RPC_UNREACHABLE",
    });
  });

  it("download returns bytes", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    const bytes = await s.download("0xroot");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("computeRoot hashes without uploading", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({ root: "0xabc" }) }));
    expect(await s.computeRoot(new Uint8Array([1]))).toBe("0xabc");
  });

  it("exists is true when the header is retrievable", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    expect(await s.exists("0xroot")).toBe(true);
  });

  it("throws ConfigError when no privateKey is given for upload", async () => {
    const s = new Storage({ network: "galileo", loadSdk: async () => fakeSdk({}) });
    await expect(s.upload(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("ConfigError (with install hint) when the SDK cannot be loaded", async () => {
    const s = new Storage(
      cfg({
        loadSdk: async () => {
          throw new Error("Cannot find module");
        },
      })
    );
    await expect(s.upload(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("exists is false when the header is absent", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({ blob: null }) }));
    expect(await s.exists("0xmissing")).toBe(false);
  });

  it("download wraps an empty blob in NetworkError", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({ blob: null }) }));
    await expect(s.download("0xroot")).rejects.toMatchObject({
      code: "CHAIN_RPC_UNREACHABLE",
    });
  });

  it("upload throws NetworkError on an unrecognized result shape", async () => {
    const s = new Storage(
      cfg({
        loadSdk: async () =>
          fakeSdk({ uploadResult: { rootHashes: [], txHashes: [] } }),
      })
    );
    await expect(s.upload(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CHAIN_RPC_UNREACHABLE",
    });
  });

  it("uses the aristotle indexer by default", () => {
    const s = new Storage({
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      loadSdk: async () => fakeSdk({}),
    });
    expect(s.indexerUrl).toBe("https://indexer-storage.0g.network");
  });

  it("raw() returns the loaded SDK module", async () => {
    const s = new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    const sdk = (await s.raw()) as { MemData: unknown; Indexer: unknown };
    expect(sdk.MemData).toBeDefined();
    expect(sdk.Indexer).toBeDefined();
  });

  it("accepts a Signer via { signer } and can upload", async () => {
    const signer = await fromPrivateKey(TEST_PK);
    const s = new Storage({
      network: "galileo",
      signer,
      loadSdk: async () => fakeSdk({}),
    });
    const r = await s.upload(new Uint8Array([1]));
    expect(r.root).toBe("0xroot");
    expect(r.tx.txHash).toBe("0xtx");
  });

  it("warns once on { privateKey } (deprecation) and not again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("deprecated");
    warn.mockRestore();
  });

  it("throws ConfigError for KMS-backed Signer (no privateKey) on write", async () => {
    // Simulate a KMS signer that has no privateKey
    const kmsSigner = {
      address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      source: "kms" as const,
      privateKey: undefined,
      signMessage: async () => "0xsig" as `0x${string}`,
      signTypedData: async () => "0xsig" as `0x${string}`,
      sendTransaction: async () => "0xtx" as `0x${string}`,
    };
    const s = new Storage({
      network: "galileo",
      signer: kmsSigner,
      loadSdk: async () => fakeSdk({}),
    });
    await expect(s.upload(new Uint8Array([1]))).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });
});
