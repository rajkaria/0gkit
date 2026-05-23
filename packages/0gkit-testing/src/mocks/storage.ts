import {
  ZeroGError,
  type DryRunResult,
  type Estimate,
  type Receipt,
} from "@foundryprotocol/0gkit-core";
import { fixtureReceipt } from "../fixtures/receipt.js";

/**
 * Shape-compatible with `StorageEstimate` from `@foundryprotocol/0gkit-storage`.
 * Reproduced locally so `0gkit-testing` doesn't pull in `0gkit-storage`.
 */
export interface MockStorageEstimateBreakdown {
  readonly sizeBytes: number;
  readonly segments: number;
  readonly [k: string]: string | number | bigint | undefined;
}

export interface MockStorageEstimate extends Estimate {
  readonly kind: "storage";
  readonly breakdown: MockStorageEstimateBreakdown;
}

/** Shape-compatible with `UploadResult` from `@foundryprotocol/0gkit-storage`. */
export interface MockUploadResult {
  root: string;
  tx: Receipt;
  raw: unknown;
}

export interface MockStorageOptions {
  /** Override the receipt returned from upload(). */
  txOverride?: Partial<Receipt>;
  /** Per-segment fee (wei). Defaults to 1 gwei (matches `0gkit-storage`'s SP7 placeholder). */
  feeWeiPerSegment?: bigint;
  /** Per-segment gas heuristic. Defaults to 80_000 (matches `0gkit-storage`). */
  gasPerSegment?: bigint;
  /** Segment size in bytes. Defaults to 256 KiB (matches `0gkit-storage`'s SDK chunking). */
  segmentSizeBytes?: number;
}

export interface MockStorageClient {
  estimate(data: Uint8Array): Promise<MockStorageEstimate>;

  upload(data: Uint8Array): Promise<MockUploadResult>;
  upload(
    data: Uint8Array,
    opts: { dryRun: true }
  ): Promise<DryRunResult<MockUploadResult>>;

  download(root: string): Promise<Uint8Array>;
  exists(root: string): Promise<boolean>;
  /** Test inspection — peek the in-memory blob store. */
  __store(): ReadonlyMap<string, Uint8Array>;
}

const DEFAULT_SEGMENT_SIZE_BYTES = 256 * 1024;
const DEFAULT_GAS_PER_SEGMENT = 80_000n;
const DEFAULT_GAS_BASE = 21_000n;
const DEFAULT_FEE_PER_SEGMENT_WEI = 1_000_000_000n;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function buildEstimate(
  sizeBytes: number,
  segmentSizeBytes: number,
  gasPerSegment: bigint,
  feeWeiPerSegment: bigint
): MockStorageEstimate {
  if (sizeBytes < 0) {
    throw new ZeroGError(
      "STORAGE_INVALID_BYTES",
      "sizeBytes must be ≥ 0",
      "Pass a non-negative integer for sizeBytes (the number of bytes you intend to upload)."
    );
  }
  const segments = sizeBytes === 0 ? 0 : Math.ceil(sizeBytes / segmentSizeBytes);
  const gas = DEFAULT_GAS_BASE + BigInt(segments) * gasPerSegment;
  const fee = BigInt(segments) * feeWeiPerSegment;
  return {
    kind: "storage",
    gas,
    fee,
    breakdown: { sizeBytes, segments },
    expectedSeconds: 8,
  };
}

/**
 * In-memory `Storage`-shaped mock that mirrors `Storage` from
 * `@foundryprotocol/0gkit-storage`:
 *
 * - `upload(data)` stores bytes keyed by `sha256(data)` (the "root"), so
 *   `download(root)` round-trips deterministically.
 * - `upload(data, { dryRun: true })` returns a `DryRunResult<UploadResult>`
 *   envelope (per SP7) without mutating the in-memory store.
 * - `estimate(data)` returns a deterministic `StorageEstimate` derived from
 *   segments + per-segment gas/fee placeholders.
 * - `exists(root)`, `download(root)`, and the test-inspection `__store()`
 *   behave as before.
 */
export function mockStorageClient(opts: MockStorageOptions = {}): MockStorageClient {
  const store = new Map<string, Uint8Array>();
  const segmentSizeBytes = opts.segmentSizeBytes ?? DEFAULT_SEGMENT_SIZE_BYTES;
  const gasPerSegment = opts.gasPerSegment ?? DEFAULT_GAS_PER_SEGMENT;
  const feeWeiPerSegment = opts.feeWeiPerSegment ?? DEFAULT_FEE_PER_SEGMENT_WEI;

  async function estimate(data: Uint8Array): Promise<MockStorageEstimate> {
    return buildEstimate(
      data.length,
      segmentSizeBytes,
      gasPerSegment,
      feeWeiPerSegment
    );
  }

  function upload(data: Uint8Array): Promise<MockUploadResult>;
  function upload(
    data: Uint8Array,
    opts: { dryRun: true }
  ): Promise<DryRunResult<MockUploadResult>>;
  async function upload(
    data: Uint8Array,
    uploadOpts?: { dryRun?: boolean }
  ): Promise<MockUploadResult | DryRunResult<MockUploadResult>> {
    const root = await sha256Hex(data);
    if (uploadOpts?.dryRun) {
      const est = await estimate(data);
      const result: MockUploadResult = {
        root,
        tx: { latencyMs: 0 },
        raw: { dryRun: true, mock: true, bytes: data.length },
      };
      return { dryRun: true, estimate: est, result };
    }
    store.set(root, new Uint8Array(data));
    return {
      root,
      tx: fixtureReceipt(opts.txOverride),
      raw: { mock: true, bytes: data.length },
    };
  }

  return {
    estimate,
    upload,
    async download(root) {
      const got = store.get(root);
      if (!got) {
        throw new ZeroGError(
          "STORAGE_ROOT_NOT_FOUND",
          `mockStorageClient: root ${root} not found`,
          "The mock storage client's in-memory map has no blob keyed by this root. Either upload() the data first in this test, or pre-seed the store via __store() before calling download()."
        );
      }
      return new Uint8Array(got);
    },
    async exists(root) {
      return store.has(root);
    },
    __store() {
      return store;
    },
  };
}
