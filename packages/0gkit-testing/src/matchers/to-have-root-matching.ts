import { expect } from "vitest";

const HEX_ROOT = /^0x[0-9a-f]{64}$/i;

interface MatchResult {
  pass: boolean;
  message: () => string;
}

export function toHaveRootMatching(
  received: unknown,
  pattern: RegExp | string
): MatchResult {
  if (typeof received !== "string") {
    return {
      pass: false,
      message: () =>
        `Expected a root string, got ${typeof received}. ` +
        `Roots are hex strings of the form 0x[64-char hex].`,
    };
  }
  if (!HEX_ROOT.test(received)) {
    return {
      pass: false,
      message: () =>
        `Expected a 32-byte hex root (^0x[0-9a-f]{64}$), got '${received}'. ` +
        `Mocked storage roots are sha256(bytes) prefixed with 0x.`,
    };
  }
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (!re.test(received)) {
    return {
      pass: false,
      message: () => `Expected root '${received}' to match ${re}, but it did not.`,
    };
  }
  return {
    pass: true,
    message: () => `Expected root '${received}' NOT to match ${re}, but it did.`,
  };
}

expect.extend({ toHaveRootMatching });
