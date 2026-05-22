/**
 * Per-primitive attribute extractors. Each entry has a `pre` mapper (run on
 * call entry, sees the args) and a `post` mapper (run on success, sees the
 * resolved result). Errors are handled centrally in `wrap.ts`.
 *
 * The shapes here match the real public surfaces in `packages/0gkit-*` as
 * verified during SP11. If a primitive's return shape changes, fix the
 * mapper, don't fabricate.
 */
import { ATTR } from "./attributes.js";
import type { AttrFn } from "./wrap.js";

const network: AttrFn = (_args, _res, instance: unknown) => ({
  [ATTR.NETWORK]: (instance as { network?: string })?.network ?? "unknown",
});

function asUint8(v: unknown): Uint8Array | undefined {
  if (v instanceof Uint8Array) return v;
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function maybeBigintString(v: unknown): string | undefined {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

export const STORAGE_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  upload: {
    pre: (args, _r, inst) => {
      const opts = args[1] as { dryRun?: boolean } | undefined;
      return {
        ...network([], undefined, inst),
        [ATTR.SIZE_BYTES]: asUint8(args[0])?.length,
        [ATTR.DRY_RUN]: opts?.dryRun ?? false,
      };
    },
    post: (_a, res) => {
      const r = res as
        | {
            root?: string;
            tx?: {
              hash?: string;
              txHash?: string;
              blockNumber?: number;
              latencyMs?: number;
            };
            result?: {
              root?: string;
              tx?: {
                hash?: string;
                txHash?: string;
                blockNumber?: number;
                latencyMs?: number;
              };
            };
          }
        | undefined;
      const root = r?.root ?? r?.result?.root;
      const tx = r?.tx ?? r?.result?.tx;
      const latencyMs = tx?.latencyMs;
      return {
        [ATTR.ROOT]: root,
        [ATTR.TX_HASH]: tx?.txHash ?? tx?.hash,
        [ATTR.BLOCK_NUMBER]: tx?.blockNumber,
        [ATTR.CONFIRM_SECONDS]:
          typeof latencyMs === "number" ? latencyMs / 1000 : undefined,
      };
    },
  },
  download: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.ROOT]: typeof args[0] === "string" ? (args[0] as string) : undefined,
    }),
    post: (_a, res) => ({
      [ATTR.SIZE_BYTES]: asUint8(res)?.length,
    }),
  },
  estimate: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.SIZE_BYTES]: asUint8(args[0])?.length ?? asNumber(args[0]),
      [ATTR.DRY_RUN]: true,
    }),
    post: (_a, res) => {
      const r = res as
        | { segments?: number; gas?: bigint | number; fee?: bigint | number }
        | undefined;
      return {
        [ATTR.SEGMENTS]: r?.segments,
        [ATTR.GAS_NATIVE]: maybeBigintString(r?.gas),
        [ATTR.FEE_NATIVE]: maybeBigintString(r?.fee),
      };
    },
  },
  exists: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.ROOT]: typeof args[0] === "string" ? (args[0] as string) : undefined,
    }),
    post: () => ({}),
  },
};

export const COMPUTE_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  inference: {
    pre: (args, _r, inst) => {
      const a = args[0] as { model?: string } | undefined;
      const opts = args[1] as { dryRun?: boolean } | undefined;
      return {
        ...network([], undefined, inst),
        [ATTR.MODEL]: a?.model,
        [ATTR.DRY_RUN]: opts?.dryRun ?? false,
      };
    },
    post: (_a, res) => {
      const r = res as
        | {
            usage?: { inputTokens?: number; outputTokens?: number };
            result?: { usage?: { inputTokens?: number; outputTokens?: number } };
            receipt?: { txHash?: string };
          }
        | undefined;
      const usage = r?.usage ?? r?.result?.usage;
      return {
        [ATTR.INPUT_TOKENS]: usage?.inputTokens,
        [ATTR.OUTPUT_TOKENS]: usage?.outputTokens,
        [ATTR.TX_HASH]: r?.receipt?.txHash,
      };
    },
  },
  estimate: {
    pre: (args, _r, inst) => {
      const a = args[0] as { model?: string } | undefined;
      return {
        ...network([], undefined, inst),
        [ATTR.MODEL]: a?.model,
        [ATTR.DRY_RUN]: true,
      };
    },
    post: (_a, res) => {
      const r = res as
        | {
            gas?: bigint | number;
            fee?: bigint | number;
            breakdown?: { inputTokens?: number; outputTokensMax?: number };
          }
        | undefined;
      return {
        [ATTR.GAS_NATIVE]: maybeBigintString(r?.gas),
        [ATTR.FEE_NATIVE]: maybeBigintString(r?.fee),
        [ATTR.INPUT_TOKENS]: r?.breakdown?.inputTokens,
        [ATTR.OUTPUT_TOKENS]: r?.breakdown?.outputTokensMax,
      };
    },
  },
};

export const DA_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  publish: {
    pre: (args, _r, inst) => {
      const payload = args[0];
      let size: number | undefined;
      if (payload instanceof Uint8Array) size = payload.length;
      else if (typeof payload === "string") size = payload.length;
      const opts = args[1] as { dryRun?: boolean } | undefined;
      return {
        ...network([], undefined, inst),
        [ATTR.SIZE_BYTES]: size,
        [ATTR.DRY_RUN]: opts?.dryRun ?? false,
      };
    },
    post: (_a, res) => {
      const r = res as
        | {
            gas?: bigint | number;
            fee?: bigint | number;
            digest?: string;
            estimate?: { gas?: bigint | number; fee?: bigint | number };
            result?: { digest?: string };
          }
        | undefined;
      return {
        [ATTR.GAS_NATIVE]: maybeBigintString(r?.gas ?? r?.estimate?.gas),
        [ATTR.FEE_NATIVE]: maybeBigintString(r?.fee ?? r?.estimate?.fee),
        [ATTR.ROOT]: r?.digest ?? r?.result?.digest,
      };
    },
  },
  estimate: {
    pre: (args, _r, inst) => {
      const payload = args[0];
      let size: number | undefined;
      if (payload instanceof Uint8Array) size = payload.length;
      else if (typeof payload === "string") size = payload.length;
      else if (typeof payload === "number") size = payload;
      return {
        ...network([], undefined, inst),
        [ATTR.SIZE_BYTES]: size,
        [ATTR.DRY_RUN]: true,
      };
    },
    post: (_a, res) => {
      const r = res as { gas?: bigint | number; fee?: bigint | number } | undefined;
      return {
        [ATTR.GAS_NATIVE]: maybeBigintString(r?.gas),
        [ATTR.FEE_NATIVE]: maybeBigintString(r?.fee),
      };
    },
  },
};

/**
 * Attestation is currently a set of free functions (`verifyEnvelope`,
 * `signEnvelope`, ...), not a class with a prototype — so prototype-patching
 * doesn't apply. We keep the mapper map here for forward compatibility:
 * if/when 0gkit-attestation introduces an `AttestationClient` class, the
 * `instrument0g({ targets: { attestation: { class, methods } } })` path can
 * use this map without code changes here.
 *
 * See DECISIONS.md D32 for the rationale on not auto-wrapping the free
 * functions (it would require monkey-patching the module export, which is
 * fragile under ESM live bindings).
 */
export const ATTESTATION_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  verifyEnvelope: {
    pre: (_args, _r, inst) => ({ ...network([], undefined, inst) }),
    post: () => ({}),
  },
};
