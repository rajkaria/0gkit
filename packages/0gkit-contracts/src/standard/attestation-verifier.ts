import type { Address } from "viem";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { createTypedContract, type TypedContract } from "../factory.js";
import type { Network } from "../types.js";
import { KNOWN_ADDRESSES } from "./addresses.js";

/**
 * TEE attestation verifier — accepts a packed attestation envelope (matching
 * the encoding produced by `@foundryprotocol/0gkit-attestation`) and returns
 * a boolean validity flag plus the recovered signer hash. The `submit*`
 * write path archives the attestation on-chain for later replay/audit.
 *
 * Like the provider registry, the canonical deployment address is not yet
 * pinned by 0G — factory throws a clear CONFIG error until it is.
 */
export const AttestationVerifierAbi = [
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [{ name: "envelope", type: "bytes" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "signerHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "verifyTyped",
    stateMutability: "view",
    inputs: [
      { name: "report", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
  {
    type: "function",
    name: "submitAttestation",
    stateMutability: "nonpayable",
    inputs: [{ name: "envelope", type: "bytes" }],
    outputs: [{ name: "attestationId", type: "bytes32" }],
  },
  {
    type: "event",
    name: "AttestationSubmitted",
    inputs: [
      { indexed: true, name: "attestationId", type: "bytes32" },
      { indexed: true, name: "submitter", type: "address" },
      { indexed: false, name: "signerHash", type: "bytes32" },
    ],
  },
] as const;

export interface AttestationVerifierOptions {
  address?: Address;
  network?: Network;
  rpcUrl?: string;
  signer?: Signer;
}

export function attestationVerifier(
  opts: AttestationVerifierOptions = {}
): TypedContract<typeof AttestationVerifierAbi> {
  const network = opts.network ?? "galileo";
  const pinned = KNOWN_ADDRESSES.attestationVerifier[network];
  const address = opts.address ?? pinned;
  if (!address) {
    throw new ConfigError(
      `0G attestation verifier has no pinned address for network='${network}'.`,
      `0G has not yet published the canonical verifier deployment. Pass { address } explicitly, or follow https://docs.0g.ai for the rollout. The ABI shape is stable and available as \`AttestationVerifierAbi\`.`
    );
  }
  return createTypedContract({
    abi: AttestationVerifierAbi,
    address,
    network,
    rpcUrl: opts.rpcUrl,
    signer: opts.signer,
  });
}
