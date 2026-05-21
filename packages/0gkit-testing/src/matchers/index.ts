// Side-effect imports: each matcher file calls `expect.extend(...)` at the
// top level. `import "@foundryprotocol/0gkit-testing/matchers"` registers
// all four matchers in one line.
//
// The type-only import below pulls in vitest's `Assertion` interface — both
// at runtime (no-op, types only) AND in the emitted .d.ts (preserved by tsc).
// Without it, tsup strips the bare `import "vitest"` and the dist .d.ts'
// `declare module "vitest"` block looks like a full module *definition* to
// downstream tsc, shadowing vitest's real `describe` / `it` / `expect`.
import type { Assertion as _VitestAssertion } from "vitest";
import "./to-be-confirmed-on-0g.js";
import "./to-have-root-matching.js";
import "./to-be-valid-attestation.js";
import "./to-be-zero-g-error.js";

// Keep the unused type-import alive in the dist .d.ts.
export type _zeroG_vitest_marker = _VitestAssertion<unknown>;

interface ZeroGMatchers<R = unknown> {
  /** Asserts the received value looks like a confirmed 0G `Receipt`. */
  toBeConfirmedOn0G(): R;
  /** Asserts the received string is a hex root matching `pattern` (after the 0x-32-bytes shape check). */
  toHaveRootMatching(pattern: RegExp | string): R;
  /**
   * Asserts the received envelope's digest is intact and the signature
   * recovers. Pass `expectedSigner` to bind the assertion to a known signer.
   */
  toBeValidAttestation(expectedSigner?: string): Promise<R>;
  /** Asserts the received error is a `ZeroGError` with the given code. */
  toBeZeroGError(code: "CONFIG" | "NETWORK" | "CHAIN" | "ATTESTATION"): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<T> extends ZeroGMatchers<void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends ZeroGMatchers<void> {}
}
