import { ConfigError } from "@foundryprotocol/0gkit-core";
import { storageSuite } from "./storage.js";
import { computeSuite } from "./compute.js";
import { daSuite } from "./da.js";
import { walletSuite } from "./wallet.js";

export const SUITE_NAMES = ["storage", "compute", "da", "wallet"] as const;
export type SuiteName = (typeof SUITE_NAMES)[number];

export interface SuiteResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Injected factories for conformance suites.
 *
 * Note on real mock shapes (adapted from plan):
 * - DA.verify is async and takes (digest, bytes) — not (bytes, digest).
 * - Compute.inference returns { output, receipt, raw }.
 * - testWallet returns a Signer with signMessage(message) — recovery uses
 *   recoverMessageAddress from viem.
 */
export interface SuiteDeps {
  makeStorage: () => {
    upload: (b: Uint8Array) => Promise<{ root: string }>;
    download: (r: string) => Promise<Uint8Array>;
  };
  makeCompute: () => {
    inference: (a: {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
    }) => Promise<{ output: string }>;
  };
  makeDA: () => {
    publish: (b: Uint8Array) => Promise<{ digest: string }>;
    /** Real mock signature: (digest, bytes) */
    verify: (d: string, b: Uint8Array) => Promise<boolean>;
  };
  /** Returns a Signer: { address, signMessage(message) } */
  testWallet: () => {
    address: `0x${string}`;
    signMessage: (message: string) => Promise<`0x${string}`>;
  };
}

const RUNNERS: Record<SuiteName, (d: SuiteDeps) => Promise<SuiteResult>> = {
  storage: storageSuite,
  compute: computeSuite,
  da: daSuite,
  wallet: walletSuite,
};

export async function runConformance(opts: {
  suites?: SuiteName[];
  deps: SuiteDeps;
}): Promise<SuiteResult[]> {
  const suites = opts.suites ?? [...SUITE_NAMES];
  for (const s of suites) {
    if (!(s in RUNNERS))
      throw new ConfigError(
        `Unknown test suite '${s}'.`,
        `Use a comma list of: ${SUITE_NAMES.join(", ")}.`
      );
  }
  return Promise.all(suites.map((s) => RUNNERS[s](opts.deps)));
}
