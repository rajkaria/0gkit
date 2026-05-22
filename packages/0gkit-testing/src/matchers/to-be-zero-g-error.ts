import { expect } from "vitest";
import { ZeroGError, isErrorCode } from "@foundryprotocol/0gkit-core";

interface MatchResult {
  pass: boolean;
  message: () => string;
}

export function toBeZeroGError(received: unknown, code: string): MatchResult {
  if (!isErrorCode(code)) {
    return {
      pass: false,
      message: () =>
        `toBeZeroGError: '${code}' is not a known ZeroGError code. ` +
        `Use one of the canonical codes from ERROR_CODES (e.g. CONFIG_INVALID_ARGUMENT, CHAIN_RPC_UNREACHABLE).`,
    };
  }
  if (!(received instanceof ZeroGError)) {
    return {
      pass: false,
      message: () =>
        `Expected a ZeroGError instance, got ${
          received instanceof Error
            ? `${received.name}: ${received.message}`
            : String(received)
        }.`,
    };
  }
  if (received.code !== code) {
    return {
      pass: false,
      message: () =>
        `Expected ZeroGError code '${code}', got '${received.code}' (message: ${received.message}).`,
    };
  }
  return {
    pass: true,
    message: () =>
      `Expected error NOT to be ZeroGError(${code}), but it was: ${received.message}`,
  };
}

expect.extend({ toBeZeroGError });
