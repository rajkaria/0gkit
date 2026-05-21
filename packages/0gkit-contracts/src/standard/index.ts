import { erc20, Erc20Abi } from "./erc20.js";
import { erc721, Erc721Abi } from "./erc721.js";
import { multicall3, Multicall3Abi } from "./multicall3.js";
import { registry, RegistryAbi } from "./registry.js";
import { attestationVerifier, AttestationVerifierAbi } from "./attestation-verifier.js";

export { Erc20Abi } from "./erc20.js";
export { Erc721Abi } from "./erc721.js";
export { Multicall3Abi } from "./multicall3.js";
export { RegistryAbi } from "./registry.js";
export { AttestationVerifierAbi } from "./attestation-verifier.js";
export { KNOWN_ADDRESSES } from "./addresses.js";

export interface StandardContractMeta {
  name: string;
  description: string;
  /** The ABI literal (typed `as const`). */
  abi: readonly unknown[];
  /** Address per network (`null` ⇒ caller must pass { address } explicitly). */
  addresses: Record<"aristotle" | "galileo" | "local", `0x${string}` | null>;
  methods: readonly string[];
  events: readonly string[];
}

import { KNOWN_ADDRESSES } from "./addresses.js";

function listMethods(abi: readonly unknown[]): readonly string[] {
  return abi
    .filter((i): i is { type: string; name: string } => {
      const it = i as { type?: string; name?: string };
      return it.type === "function" && typeof it.name === "string";
    })
    .map((fn) => fn.name);
}

function listEvents(abi: readonly unknown[]): readonly string[] {
  return abi
    .filter((i): i is { type: string; name: string } => {
      const it = i as { type?: string; name?: string };
      return it.type === "event" && typeof it.name === "string";
    })
    .map((ev) => ev.name);
}

export const standardContractsMeta: Record<string, StandardContractMeta> = {
  erc20: {
    name: "erc20",
    description:
      "Standard ERC-20 token (transfer, approve, allowance + Transfer/Approval events).",
    abi: Erc20Abi,
    addresses: { aristotle: null, galileo: null, local: null },
    methods: listMethods(Erc20Abi),
    events: listEvents(Erc20Abi),
  },
  erc721: {
    name: "erc721",
    description:
      "Standard ERC-721 NFT (ownerOf, tokenURI, transferFrom + Transfer/Approval/ApprovalForAll events).",
    abi: Erc721Abi,
    addresses: { aristotle: null, galileo: null, local: null },
    methods: listMethods(Erc721Abi),
    events: listEvents(Erc721Abi),
  },
  multicall3: {
    name: "multicall3",
    description:
      "Universal Multicall3 for batched reads/writes. Same address on every EVM chain.",
    abi: Multicall3Abi,
    addresses: KNOWN_ADDRESSES.multicall3,
    methods: listMethods(Multicall3Abi),
    events: listEvents(Multicall3Abi),
  },
  registry: {
    name: "registry",
    description: "0G provider registry — operators, endpoints, stake, active status.",
    abi: RegistryAbi,
    addresses: KNOWN_ADDRESSES.registry,
    methods: listMethods(RegistryAbi),
    events: listEvents(RegistryAbi),
  },
  attestationVerifier: {
    name: "attestationVerifier",
    description:
      "On-chain TEE attestation verifier compatible with @foundryprotocol/0gkit-attestation envelopes.",
    abi: AttestationVerifierAbi,
    addresses: KNOWN_ADDRESSES.attestationVerifier,
    methods: listMethods(AttestationVerifierAbi),
    events: listEvents(AttestationVerifierAbi),
  },
};

export const standardContracts = {
  erc20,
  erc721,
  multicall3,
  registry,
  attestationVerifier,
};
