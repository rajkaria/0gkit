import { describe, it, expectTypeOf } from "vitest";
import type { Signer, SignTypedDataArgs, SignableTx } from "../index.js";

describe("Signer interface (type-only)", () => {
  it("requires address + signMessage + signTypedData + sendTransaction + source", () => {
    // Signer must structurally satisfy this minimum shape.
    // Note: function parameter types are contravariant — the shape uses the
    // same concrete arg types as Signer so the check is directionally correct.
    expectTypeOf<Signer>().toMatchTypeOf<{
      address: `0x${string}`;
      source: string;
      signMessage: (
        bytes: string | Uint8Array | { raw: `0x${string}` | Uint8Array }
      ) => Promise<`0x${string}`>;
      signTypedData: (args: SignTypedDataArgs) => Promise<`0x${string}`>;
      sendTransaction: (tx: SignableTx) => Promise<`0x${string}`>;
    }>();
  });

  it("address is a 0x-prefixed string literal type", () => {
    expectTypeOf<Signer["address"]>().toMatchTypeOf<`0x${string}`>();
  });

  it("source is a union of known provenance tags", () => {
    expectTypeOf<Signer["source"]>().toMatchTypeOf<string>();
  });

  it("privateKey is optional", () => {
    expectTypeOf<Signer["privateKey"]>().toMatchTypeOf<`0x${string}` | undefined>();
  });

  it("SignableTx fields are all optional", () => {
    // Should compile with an empty object (all fields optional)
    const _empty: SignableTx = {};
    expectTypeOf(_empty).toMatchTypeOf<SignableTx>();
  });

  it("SignTypedDataArgs has required domain, types, primaryType, message", () => {
    expectTypeOf<SignTypedDataArgs>().toMatchTypeOf<{
      domain: object;
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, unknown>;
    }>();
  });
});
