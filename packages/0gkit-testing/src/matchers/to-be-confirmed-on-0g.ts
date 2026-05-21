import { expect } from "vitest";

const HEX_HASH = /^0x[0-9a-f]{64}$/i;

interface MatchResult {
  pass: boolean;
  message: () => string;
}

export function toBeConfirmedOn0G(received: unknown): MatchResult {
  if (!received || typeof received !== "object") {
    return {
      pass: false,
      message: () =>
        `Expected a 0G Receipt object, received ${typeof received}. ` +
        `A Receipt has at minimum { txHash, blockNumber, latencyMs }.`,
    };
  }
  const r = received as {
    txHash?: unknown;
    blockNumber?: unknown;
    latencyMs?: unknown;
  };
  if (typeof r.txHash !== "string" || !HEX_HASH.test(r.txHash)) {
    return {
      pass: false,
      message: () =>
        `Expected receipt.txHash to be a 32-byte hex string (^0x[0-9a-f]{64}$), got ${String(
          r.txHash
        )}. ` +
        `Did you forget to \`await\` the write call? Mocked receipts use 0x${"ab".repeat(32)}.`,
    };
  }
  if (typeof r.blockNumber !== "bigint" || r.blockNumber <= 0n) {
    return {
      pass: false,
      message: () =>
        `Expected receipt.blockNumber to be a positive bigint, got ${typeof r.blockNumber} ${String(
          r.blockNumber
        )}.`,
    };
  }
  if (typeof r.latencyMs !== "number" || r.latencyMs < 0) {
    return {
      pass: false,
      message: () =>
        `Expected receipt.latencyMs to be a non-negative number, got ${typeof r.latencyMs} ${String(
          r.latencyMs
        )}.`,
    };
  }
  return {
    pass: true,
    message: () =>
      `Expected receipt NOT to be a confirmed 0G receipt, but it was (txHash=${r.txHash}, block=${r.blockNumber}).`,
  };
}

expect.extend({ toBeConfirmedOn0G });
