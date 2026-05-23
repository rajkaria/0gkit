import type { DryRunResult, Estimate, Receipt } from "@foundryprotocol/0gkit-core";
import { fixtureReceipt } from "../fixtures/receipt.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Shape-compatible with `ComputeEstimate` from `@foundryprotocol/0gkit-compute`.
 * Reproduced locally so `0gkit-testing` doesn't pull in `0gkit-compute`.
 */
export interface MockComputeEstimateBreakdown {
  readonly inputTokens: number;
  readonly outputTokensMax: number;
  readonly model: string;
  readonly [k: string]: string | number | bigint | undefined;
}

export interface MockComputeEstimate extends Estimate {
  readonly kind: "compute";
  readonly breakdown: MockComputeEstimateBreakdown;
}

/** Shape-compatible with `InferenceResult` from `@foundryprotocol/0gkit-compute`. */
export interface MockInferenceResult {
  output: string;
  receipt: Receipt;
  raw: unknown;
}

export interface MockComputeOptions {
  /** Override the default echo responder. */
  responder?: (messages: ChatMessage[]) => string;
  /** Override the receipt returned from inference(). */
  receiptOverride?: Partial<Receipt>;
  /**
   * Override the per-token fee used by `.estimate()` (wei/token).
   * Defaults to 1 gwei (matches `0gkit-compute`'s SP7 placeholder).
   */
  feeWeiPerToken?: bigint;
  /** Default max output token cap when callers don't supply one. */
  defaultMaxOutputTokens?: number;
}

export interface MockInferenceArgs {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface MockComputeClient {
  estimate(args: {
    messages: ChatMessage[];
    model?: string;
    maxOutputTokens?: number;
  }): Promise<MockComputeEstimate>;

  inference(args: MockInferenceArgs): Promise<MockInferenceResult>;
  inference(
    args: MockInferenceArgs,
    opts: { dryRun: true }
  ): Promise<DryRunResult<MockInferenceResult>>;

  listProviders(): Promise<Array<{ id: string; url: string }>>;
  __callCount(): number;
}

const ECHO_PROVIDERS = [
  { id: "mock-provider-0", url: "http://mock-compute.test/0" },
  { id: "mock-provider-1", url: "http://mock-compute.test/1" },
];

const DEFAULT_FEE_WEI_PER_TOKEN = 1_000_000_000n;
const DEFAULT_MAX_OUTPUT_TOKENS = 512;

function countTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

function buildEstimate(
  args: {
    messages: ChatMessage[];
    model?: string;
    maxOutputTokens?: number;
  },
  feeWeiPerToken: bigint,
  defaultMaxOutputTokens: number
): MockComputeEstimate {
  const inputTokens = args.messages.reduce((acc, m) => acc + countTokens(m.content), 0);
  const outputTokensMax = args.maxOutputTokens ?? defaultMaxOutputTokens;
  const fee = BigInt(inputTokens + outputTokensMax) * feeWeiPerToken;
  return {
    kind: "compute",
    gas: 0n,
    fee,
    breakdown: {
      inputTokens,
      outputTokensMax,
      model: args.model ?? "(mock-default)",
    },
    expectedSeconds: 5,
  };
}

/**
 * In-memory Compute mock that mirrors `Compute` from `@foundryprotocol/0gkit-compute`:
 * - `inference(args)` returns `{ output, receipt, raw }` (SP6 shape; replaces the
 *   pre-SP6 `.chat()` API).
 * - `inference(args, { dryRun: true })` returns a `DryRunResult<InferenceResult>`
 *   envelope without ever invoking the responder (matches SP7 dry-run semantics).
 * - `estimate({ messages, model?, maxOutputTokens? })` returns a deterministic
 *   `ComputeEstimate` derived from `countTokens(content)` and a per-token fee.
 *
 * Default responder echoes the last user message (`echo: <content>`). Pass
 * `opts.responder` to drive richer scenarios. `__callCount()` only counts live
 * inference calls — dry-runs are free.
 */
export function mockComputeClient(opts: MockComputeOptions = {}): MockComputeClient {
  let callCount = 0;
  const respond =
    opts.responder ??
    ((messages: ChatMessage[]): string => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      return `echo: ${lastUser?.content ?? "(no user message)"}`;
    });
  const feeWeiPerToken = opts.feeWeiPerToken ?? DEFAULT_FEE_WEI_PER_TOKEN;
  const defaultMaxOutputTokens =
    opts.defaultMaxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  async function estimate(args: {
    messages: ChatMessage[];
    model?: string;
    maxOutputTokens?: number;
  }): Promise<MockComputeEstimate> {
    return buildEstimate(args, feeWeiPerToken, defaultMaxOutputTokens);
  }

  function inference(args: MockInferenceArgs): Promise<MockInferenceResult>;
  function inference(
    args: MockInferenceArgs,
    opts: { dryRun: true }
  ): Promise<DryRunResult<MockInferenceResult>>;
  async function inference(
    args: MockInferenceArgs,
    inferenceOpts?: { dryRun?: boolean }
  ): Promise<MockInferenceResult | DryRunResult<MockInferenceResult>> {
    if (inferenceOpts?.dryRun) {
      const est = await estimate(args);
      const result: MockInferenceResult = {
        output: "",
        receipt: { latencyMs: 0 },
        raw: { dryRun: true, mock: true },
      };
      return { dryRun: true, estimate: est, result };
    }
    callCount++;
    const output = respond(args.messages);
    return {
      output,
      receipt: fixtureReceipt(opts.receiptOverride),
      raw: { mock: true, callCount },
    };
  }

  return {
    estimate,
    inference,
    async listProviders() {
      return ECHO_PROVIDERS;
    },
    __callCount() {
      return callCount;
    },
  };
}
