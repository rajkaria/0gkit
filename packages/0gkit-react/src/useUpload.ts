import { useRef } from "react";
import {
  Storage,
  type StorageConfig,
  type UploadResult,
} from "@foundryprotocol/0gkit-storage";
import { useAsyncAction } from "./internal.js";
import type { AsyncState } from "./types.js";

export interface UseUploadResult extends AsyncState<UploadResult> {
  /** Upload raw bytes to 0G Storage. Resolves the root + receipt. */
  upload: (data: Uint8Array) => Promise<UploadResult>;
  reset: () => void;
}

/**
 * Upload bytes to 0G Storage. `config` is read per-call through a ref, so a
 * component may recompute it each render (e.g. on a network/key change)
 * without the hook going stale.
 */
export function useUpload(config: StorageConfig): UseUploadResult {
  const cfg = useRef(config);
  cfg.current = config;
  const { data, error, loading, run, reset } = useAsyncAction((bytes: Uint8Array) =>
    new Storage(cfg.current).upload(bytes)
  );
  return { data, error, loading, upload: run, reset };
}
