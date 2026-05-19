import { useRef } from "react";
import {
  Compute,
  type ChatMessage,
  type ComputeConfig,
  type InferenceResult,
} from "@foundryprotocol/0gkit-compute";
import { useAsyncAction } from "./internal.js";
import type { AsyncState } from "./types.js";

export interface InferenceArgs {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
}

export interface UseInferenceResult extends AsyncState<InferenceResult> {
  /** Run a chat completion against a 0G compute provider. */
  infer: (args: InferenceArgs) => Promise<InferenceResult>;
  reset: () => void;
}

/** Run inference against a 0G compute provider. */
export function useInference(config: ComputeConfig): UseInferenceResult {
  const cfg = useRef(config);
  cfg.current = config;
  const { data, error, loading, run, reset } = useAsyncAction((args: InferenceArgs) =>
    new Compute(cfg.current).inference(args)
  );
  return { data, error, loading, infer: run, reset };
}
