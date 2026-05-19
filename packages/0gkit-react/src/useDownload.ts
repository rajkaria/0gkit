import { useRef } from "react";
import { Storage, type StorageConfig } from "@foundryprotocol/0gkit-storage";
import { useAsyncAction } from "./internal.js";
import type { AsyncState } from "./types.js";

export interface UseDownloadResult extends AsyncState<Uint8Array> {
  /** Download the bytes behind a 0G Storage root hash. */
  download: (root: string) => Promise<Uint8Array>;
  reset: () => void;
}

/** Download bytes from 0G Storage by root hash. */
export function useDownload(config: StorageConfig): UseDownloadResult {
  const cfg = useRef(config);
  cfg.current = config;
  const { data, error, loading, run, reset } = useAsyncAction((root: string) =>
    new Storage(cfg.current).download(root)
  );
  return { data, error, loading, download: run, reset };
}
