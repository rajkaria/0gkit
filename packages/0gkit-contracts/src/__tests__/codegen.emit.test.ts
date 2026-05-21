import { describe, it, expect } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { emitContract } from "../codegen/emit.js";
import { isValidTsIdentifier, indent } from "../codegen/format.js";

describe("isValidTsIdentifier", () => {
  it("accepts plain identifiers", () => {
    expect(isValidTsIdentifier("Greeter")).toBe(true);
    expect(isValidTsIdentifier("MyContract_v2")).toBe(true);
  });

  it("rejects empty / digit-leading / special-char names", () => {
    expect(isValidTsIdentifier("")).toBe(false);
    expect(isValidTsIdentifier("2Cool")).toBe(false);
    expect(isValidTsIdentifier("My-Contract")).toBe(false);
    expect(isValidTsIdentifier("My.Contract")).toBe(false);
  });
});

describe("indent", () => {
  it("indents each line by level × 2 spaces", () => {
    expect(indent("a\nb", 2)).toBe("    a\n    b");
  });
  it("leaves blank lines blank", () => {
    expect(indent("a\n\nb", 1)).toBe("  a\n\n  b");
  });
});

const PARSED = {
  name: "Greeter",
  abi: [
    {
      type: "function" as const,
      name: "greet",
      stateMutability: "view" as const,
      inputs: [],
      outputs: [{ type: "string" }],
    },
    {
      type: "event" as const,
      name: "GreetingSet",
      inputs: [{ indexed: false, name: "g", type: "string" }],
    },
  ],
};

describe("emitContract", () => {
  it("emits a deterministic TS source", () => {
    const a = emitContract(PARSED);
    const b = emitContract(PARSED);
    expect(a).toBe(b);
  });

  it("includes the expected exports", () => {
    const src = emitContract(PARSED);
    expect(src).toContain("export const GreeterAbi = ");
    expect(src).toContain("export function attachGreeter(");
    expect(src).toContain("export const Greeter = {");
    expect(src).toContain("// GENERATED FILE");
  });

  it("matches the snapshot for a representative contract", () => {
    expect(emitContract(PARSED)).toMatchInlineSnapshot(`
      "// GENERATED FILE — do not edit by hand.
      // Regenerate via \`0g contracts generate --abi <foundry-artifact>.json --out <dir>\`.
      // Source: @foundryprotocol/0gkit-contracts codegen.

      import type { Address, PublicClient, WalletClient } from "viem";
      import type { Signer } from "@foundryprotocol/0gkit-core";
      import { createTypedContract } from "@foundryprotocol/0gkit-contracts";

      export const GreeterAbi = [
        {
          "type": "function",
          "name": "greet",
          "stateMutability": "view",
          "inputs": [],
          "outputs": [
            {
              "type": "string"
            }
          ]
        },
        {
          "type": "event",
          "name": "GreetingSet",
          "inputs": [
            {
              "indexed": false,
              "name": "g",
              "type": "string"
            }
          ]
        }
      ] as const;

      export type GreeterAbi = typeof GreeterAbi;

      export interface GreeterAttachOptions {
        /** Deployed contract address. */
        address: Address;
        /** Network preset (defaults to galileo). */
        network?: "aristotle" | "galileo" | "local";
        /** Override the network's RPC URL. */
        rpcUrl?: string;
        /** Signer enables \`.write.*\` and is required for state-changing calls. */
        signer?: Signer;
        /** Pre-built viem public client (advanced; usually omit). */
        publicClient?: PublicClient;
        /** Pre-built viem wallet client (advanced; usually omit). */
        walletClient?: WalletClient;
      }

      export function attachGreeter(opts: GreeterAttachOptions) {
        return createTypedContract({ abi: GreeterAbi, ...opts });
      }

      export const Greeter = {
        abi: GreeterAbi,
        attach: attachGreeter,
      } as const;
      "
    `);
  });

  it("throws ConfigError when the contract name is not a valid TS identifier", () => {
    expect(() => emitContract({ name: "2Bad", abi: [] })).toThrow(ConfigError);
  });
});
