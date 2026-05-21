import type { Abi } from "viem";
import { ConfigError } from "@foundryprotocol/0gkit-core";

/**
 * The relevant subset of a Foundry build artifact (`forge build` output at
 * `out/<Contract>.sol/<Contract>.json`). We ignore bytecode/metadata/AST —
 * codegen only needs the ABI and (optionally) the contract name.
 */
export interface FoundryArtifact {
  abi: Abi;
  contractName?: string;
}

export interface ParsedContract {
  /** Resolved contract name — used as the generated TS identifier. */
  name: string;
  abi: Abi;
}

function hasArrayAbi(value: unknown): value is { abi: Abi } {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as { abi?: unknown }).abi)
  );
}

/**
 * Parse a Foundry artifact JSON string into a `ParsedContract`.
 *
 * - `hintName` overrides the artifact's `contractName` (used when the artifact
 *   was bundled without one, or when the user wants a different TS name).
 * - Throws `ZeroGError('CONFIG', ...)` for malformed JSON, missing ABI, missing
 *   name, or ABIs containing function overloads (which we don't support in v0).
 */
export function parseFoundryArtifact(json: string, hintName?: string): ParsedContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const e = err as Error;
    throw new ConfigError(
      `Foundry artifact is not valid JSON: ${e.message}`,
      `Inspect the file you passed to --abi. If it came from \`forge build\`, the path looks like out/<Contract>.sol/<Contract>.json.`
    );
  }
  if (!hasArrayAbi(parsed)) {
    throw new ConfigError(
      "Foundry artifact is missing a top-level `.abi` array.",
      "Run `forge build` and pass the JSON at out/<Contract>.sol/<Contract>.json. Hardhat artifacts are not yet supported; extract the abi key manually as a workaround."
    );
  }
  const artifact = parsed as FoundryArtifact;
  const name = hintName ?? artifact.contractName;
  if (!name) {
    throw new ConfigError(
      "Could not resolve a contract name.",
      "Pass --name <ContractName> on the CLI, or use an artifact that includes a `contractName` field."
    );
  }
  // Detect duplicate function names (overloads). Solidity allows overloads but
  // the v0 codegen emits one TS method per ABI function entry, so a JS-side
  // collision is fatal — surface it now with a clear remedy rather than at
  // runtime as `undefined is not a function`.
  const fnNames: string[] = [];
  for (const item of artifact.abi) {
    if (item.type === "function" && typeof item.name === "string") {
      fnNames.push(item.name);
    }
  }
  const dupes = fnNames.filter((n, i) => fnNames.indexOf(n) !== i);
  if (dupes.length > 0) {
    const unique = Array.from(new Set(dupes)).sort().join(", ");
    throw new ConfigError(
      `ABI contains overloaded function names (${unique}) — overloads are not supported in 0gkit-contracts v0.`,
      "Rename one of the Solidity overloads, or call `createTypedContract` directly with a hand-narrowed ABI subset."
    );
  }
  return { name, abi: artifact.abi };
}
