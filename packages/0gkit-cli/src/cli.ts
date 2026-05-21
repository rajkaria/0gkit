import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { CommanderError } from "commander";
import { createClient, getNetwork } from "@foundryprotocol/0gkit-core";
import {
  faucet,
  balance,
  waitForReceipt,
  attachExplorerUrl,
  explorerUrl,
} from "@foundryprotocol/0gkit-chain";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { DA } from "@foundryprotocol/0gkit-da";
import {
  parseEnvelope,
  verifyEnvelope,
  reportEnvelope,
} from "@foundryprotocol/0gkit-attestation";
import {
  startDevnet,
  stopDevnet,
  isRunning,
  readState,
  clearState,
} from "@foundryprotocol/0gkit-devnet";
import {
  standardContractsMeta,
  KNOWN_ADDRESSES,
} from "@foundryprotocol/0gkit-contracts";
import { generate as generateContract } from "@foundryprotocol/0gkit-contracts/codegen";
import { buildProgram, type ProgramDeps } from "./program.js";
import { loadFoundry } from "./foundry-loader.js";

type NetworkKey = "aristotle" | "galileo" | "local";

function resolveAddressForNetwork(
  contractName: string,
  network: NetworkKey
): `0x${string}` | null {
  if (contractName === "multicall3") return KNOWN_ADDRESSES.multicall3[network];
  if (contractName === "registry") return KNOWN_ADDRESSES.registry[network];
  if (contractName === "attestationVerifier")
    return KNOWN_ADDRESSES.attestationVerifier[network];
  return null;
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

const deps: ProgramDeps = {
  createClient,
  getNetwork,
  faucet,
  balance,
  waitForReceipt,
  attachExplorerUrl,
  explorerUrl,
  makeStorage: (cfg) => new Storage(cfg),
  makeCompute: (cfg) => new Compute(cfg),
  makeDA: (cfg) => new DA(cfg),
  attest: { parseEnvelope, verifyEnvelope, reportEnvelope },
  devnet: { startDevnet, stopDevnet, isRunning, readState, clearState },
  loadFoundry,
  contracts: {
    generate: (o) => generateContract(o),
    listStandard: (network) =>
      Object.values(standardContractsMeta).map((c) => ({
        name: c.name,
        address: resolveAddressForNetwork(c.name, network as NetworkKey),
        description: c.description,
      })),
    getStandard: (name, network) => {
      const meta = standardContractsMeta[name];
      if (!meta) return null;
      return {
        name: meta.name,
        address: resolveAddressForNetwork(name, network as NetworkKey),
        description: meta.description,
        methods: meta.methods,
        events: meta.events,
      };
    },
  },
  fs: {
    readFile: (p) => readFile(p).then((b) => new Uint8Array(b)),
    writeFile: (p, d) => writeFile(p, d),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => undefined),
    readdir: (p) => readdir(p),
    exists: (p) =>
      access(p).then(
        () => true,
        () => false
      ),
  },
  readStdin,
  fetch: globalThis.fetch,
  cwd: () => process.cwd(),
  env: process.env as Record<string, string | undefined>,
  isTTY: process.stdout.isTTY === true,
  noColor: process.env.NO_COLOR != null,
  write: (line) => process.stdout.write(line + "\n"),
};

try {
  await buildProgram(deps).parseAsync(process.argv);
} catch (err) {
  if (err instanceof CommanderError) {
    // commander already printed help/error text; just exit with its code
    process.exit(err.exitCode);
  }
  throw err;
}
