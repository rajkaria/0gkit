import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { runStorageFlow, type UploadResult } from "../storage-flow.js";
import type {
  DryRunResult,
  Estimate,
  Receipt,
} from "@foundryprotocol/0gkit-core";

const FAKE_ESTIMATE: Estimate = {
  kind: "storage",
  gas: 80000n,
  fee: 1_000_000_000n,
  breakdown: { sizeBytes: 0, segments: 0 },
};

const FAKE_ESTIMATE_FMT = (_e: Estimate) => "estimate: (fake)";

function sha256Hex(bytes: Uint8Array): string {
  return "0x" + createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function fakeStorage() {
  const store = new Map<string, Uint8Array>();

  async function upload(data: Uint8Array): Promise<UploadResult>;
  async function upload(
    data: Uint8Array,
    opts: { dryRun: true }
  ): Promise<DryRunResult<UploadResult>>;
  async function upload(
    data: Uint8Array,
    opts?: { dryRun?: boolean }
  ): Promise<UploadResult | DryRunResult<UploadResult>> {
    const root = sha256Hex(data);
    if (opts?.dryRun) {
      return {
        dryRun: true,
        estimate: FAKE_ESTIMATE,
        result: { root, tx: { latencyMs: 0 } as Receipt, raw: { dryRun: true } },
      };
    }
    store.set(root, new Uint8Array(data));
    return {
      root,
      tx: { txHash: "0xdeadbeef", latencyMs: 42 } as Receipt,
      raw: { mock: true },
    };
  }

  return {
    storage: {
      upload,
      download: async (root: string) => {
        const got = store.get(root);
        if (!got) throw new Error(`not found: ${root}`);
        return new Uint8Array(got);
      },
      exists: async (root: string) => store.has(root),
    },
    store,
  };
}

describe("runStorageFlow", () => {
  it("uploads when the root is new", async () => {
    const { storage } = fakeStorage();
    const result = await runStorageFlow(
      { bytes: new Uint8Array([1, 2, 3]), label: "fixture.bin" },
      { storage, log: () => undefined, formatEstimate: FAKE_ESTIMATE_FMT }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dedup).toBe(false);
    expect(result.root).toMatch(/^0x[0-9a-f]+$/);
    expect(result.txHash).toBe("0xdeadbeef");
    expect(result.latencyMs).toBe(42);
  });

  it("returns dedup=true when the predicted root already exists upstream", async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const { storage } = fakeStorage();
    await storage.upload(bytes);

    const result = await runStorageFlow(
      { bytes, label: "fixture.bin" },
      { storage, log: () => undefined, formatEstimate: FAKE_ESTIMATE_FMT }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dedup).toBe(true);
    expect(result.txHash).toBe("");
    expect(result.latencyMs).toBe(0);
  });

  it("reports a failure if the downloaded bytes do not match", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { storage, store } = fakeStorage();
    const originalUpload = storage.upload;
    storage.upload = (async (
      data: Uint8Array,
      opts?: { dryRun?: boolean }
    ) => {
      const res = await (opts?.dryRun
        ? originalUpload(data, { dryRun: true })
        : originalUpload(data));
      if (!opts?.dryRun) {
        const live = res as UploadResult;
        store.set(live.root, new Uint8Array([0xff]));
      }
      return res;
    }) as typeof storage.upload;

    const result = await runStorageFlow(
      { bytes, label: "fixture.bin" },
      { storage, log: () => undefined, formatEstimate: FAKE_ESTIMATE_FMT }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/did not match/);
  });

  it("invokes formatEstimate on the dry-run estimate", async () => {
    const { storage } = fakeStorage();
    const fmt = vi.fn(() => "fmt-out");
    await runStorageFlow(
      { bytes: new Uint8Array([1, 2]), label: "fixture.bin" },
      { storage, log: () => undefined, formatEstimate: fmt }
    );
    expect(fmt).toHaveBeenCalledTimes(1);
  });

  it("logs the predicted root before broadcasting", async () => {
    const { storage } = fakeStorage();
    const lines: string[] = [];
    const result = await runStorageFlow(
      { bytes: new Uint8Array([1]), label: "fixture.bin" },
      { storage, log: (m) => lines.push(m), formatEstimate: FAKE_ESTIMATE_FMT }
    );
    expect(result.ok).toBe(true);
    expect(lines.some((l) => l.includes("predicted root"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Uploading"))).toBe(true);
  });

  it("propagates the read-byte count via the initial log line", async () => {
    const { storage } = fakeStorage();
    const lines: string[] = [];
    await runStorageFlow(
      { bytes: new Uint8Array([1, 2, 3, 4, 5]), label: "five.bin" },
      { storage, log: (m) => lines.push(m), formatEstimate: FAKE_ESTIMATE_FMT }
    );
    expect(lines[0]).toBe("Read 5 bytes from five.bin");
  });
});
