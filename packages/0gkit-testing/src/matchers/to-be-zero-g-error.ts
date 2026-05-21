import { expect } from "vitest";
import { ZeroGError } from "@foundryprotocol/0gkit-core";

interface MatchResult {
  pass: boolean;
  message: () => string;
}

const VALID_CODES = new Set(["CONFIG", "NETWORK", "CHAIN", "ATTESTATION"]);

export function toBeZeroGError(received: unknown, code: string): MatchResult {
  if (!VALID_CODES.has(code)) {
    return {
      pass: false,
      message: () =>
        `toBeZeroGError: '${code}' is not a known ZeroGError code. ` +
        `Use one of: ${Array.from(VALID_CODES).join(", ")}.`,
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
