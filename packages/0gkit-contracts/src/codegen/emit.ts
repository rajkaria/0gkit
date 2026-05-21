import { ConfigError } from "@foundryprotocol/0gkit-core";
import { isValidTsIdentifier } from "./format.js";
import type { ParsedContract } from "./parser.js";

const HEADER = `// GENERATED FILE — do not edit by hand.
// Regenerate via \`0g contracts generate --abi <foundry-artifact>.json --out <dir>\`.
// Source: @foundryprotocol/0gkit-contracts codegen.`;

/**
 * Emit a single typed-contract TS file for the given parsed contract.
 *
 * The output is byte-deterministic for the same input — snapshot-tested so
 * future codegen changes are obvious in PRs.
 */
export function emitContract(parsed: ParsedContract): string {
  if (!isValidTsIdentifier(parsed.name)) {
    throw new ConfigError(
      `\`${parsed.name}\` is not a valid TypeScript identifier.`,
      `Pass --name <ValidName> on the CLI to override. The name must match /^[A-Za-z_][A-Za-z0-9_]*$/.`
    );
  }

  const abiLiteral = JSON.stringify(parsed.abi, null, 2);
  const abiConstName = `${parsed.name}Abi`;
  const attachFn = `attach${parsed.name}`;
  const exportObj = parsed.name;

  return `${HEADER}

import type { Address, PublicClient, WalletClient } from "viem";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { createTypedContract } from "@foundryprotocol/0gkit-contracts";

export const ${abiConstName} = ${abiLiteral} as const;

export type ${parsed.name}Abi = typeof ${abiConstName};

export interface ${parsed.name}AttachOptions {
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

export function ${attachFn}(opts: ${parsed.name}AttachOptions) {
  return createTypedContract({ abi: ${abiConstName}, ...opts });
}

export const ${exportObj} = {
  abi: ${abiConstName},
  attach: ${attachFn},
} as const;
`;
}
