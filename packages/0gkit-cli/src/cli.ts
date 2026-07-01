import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { createClient, getNetwork } from "@foundryprotocol/0gkit-core";
import {
  faucet,
  balance,
  waitForReceipt,
  attachExplorerUrl,
  explorerUrl,
} from "@foundryprotocol/0gkit-chain";
import { Storage, makeStorageEstimate } from "@foundryprotocol/0gkit-storage";
import { Compute, makeComputeEstimate } from "@foundryprotocol/0gkit-compute";
import { DA, estimateBytes as daEstimateBytes } from "@foundryprotocol/0gkit-da";
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
  createTypedContract,
} from "@foundryprotocol/0gkit-contracts";
import { generate as generateContract } from "@foundryprotocol/0gkit-contracts/codegen";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import {
  defaultTraceDir as obsDefaultTraceDir,
  listTraceFiles as obsListTraceFiles,
  readTraceFile as obsReadTraceFile,
  summarizeTrace as obsSummarizeTrace,
} from "@foundryprotocol/0gkit-observability";
import { buildProgram, VERSION as CLI_VERSION, type ProgramDeps } from "./program.js";
import { loadFoundry } from "./foundry-loader.js";
import { defaultRunKitConformance } from "./commands/test.js";
import type { JobsBackendFactory, JobBackendLike } from "./commands/jobs.js";
import type { SuiteDeps } from "@foundryprotocol/0gkit-testing";

/**
 * Optional jobs-backend loader. `@foundryprotocol/0gkit-jobs` is NOT a static
 * dependency of the CLI because it transitively requires the native
 * `better-sqlite3` (compiles for minutes on first install). Devs who never run
 * `0g jobs *` should not pay that cost. Mirror of `loadFoundry()` — computed
 * specifier means dependency-cruiser sees no edge, and `npm i
 * @foundryprotocol/0gkit-cli` does not pull jobs by default.
 */
async function loadJobsBackend(
  kind: "memory" | "sqlite",
  path: string
): Promise<JobBackendLike> {
  const spec = ["@foundryprotocol", "0gkit-jobs", "backends", kind].join("/");
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ spec)) as Record<string, unknown>;
  } catch {
    throw new ConfigError(
      `@foundryprotocol/0gkit-jobs is not installed (needed for "0g jobs ${kind === "memory" ? "status --backend memory" : "status --backend sqlite"}").`,
      "Install it to enable jobs subcommands: `npm i @foundryprotocol/0gkit-jobs` (or `pnpm add @foundryprotocol/0gkit-jobs`). Memory backend has no native deps; sqlite backend will compile better-sqlite3 on install."
    );
  }
  if (kind === "memory") {
    const MemoryBackend = mod.MemoryBackend as new () => JobBackendLike;
    return new MemoryBackend();
  }
  const SqliteBackend = mod.SqliteBackend as new (cfg: {
    path: string;
  }) => JobBackendLike;
  return new SqliteBackend({ path });
}

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

const KNOWN_0GKIT_PACKAGES = [
  "@foundryprotocol/0gkit-core",
  "@foundryprotocol/0gkit-chain",
  "@foundryprotocol/0gkit-storage",
  "@foundryprotocol/0gkit-compute",
  "@foundryprotocol/0gkit-da",
  "@foundryprotocol/0gkit-attestation",
  "@foundryprotocol/0gkit-contracts",
  "@foundryprotocol/0gkit-devnet",
  "@foundryprotocol/0gkit-observability",
] as const;

/**
 * Walk up from a resolved module file URL to the nearest `package.json` whose
 * `name` matches. Works for ESM-only packages whose `exports` field doesn't
 * list `./package.json`, which is most of the `@foundryprotocol/0gkit-*` set.
 */
function findPackageJsonForName(name: string): string | null {
  // `import.meta.resolve` is sync + stable as of Node 20.6 — returns a `file://` URL.
  let entryUrl: string;
  try {
    entryUrl = import.meta.resolve(name);
  } catch {
    return null;
  }
  let dir = dirname(fileURLToPath(entryUrl));
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
        if (pkg.name === name) return candidate;
      } catch {
        // ignore parse failure; keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function readPackageVersions(): Array<{ name: string; version: string }> {
  // The CLI's own version is always known from its package.json (read at module
  // load by program.ts). pnpm workspace symlinks plus restricted `exports`
  // fields mean we can't always resolve the CLI's own package via name lookup.
  const out: Array<{ name: string; version: string }> = [
    { name: "@foundryprotocol/0gkit-cli", version: CLI_VERSION },
  ];
  for (const name of KNOWN_0GKIT_PACKAGES) {
    const pkgPath = findPackageJsonForName(name);
    if (!pkgPath) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
      if (pkg.version) out.push({ name, version: pkg.version });
    } catch {
      // Package not installed or unreadable; skip.
    }
  }
  return out;
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
    estimate: async (opts) => {
      const raw = await readFile(opts.abiPath);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(raw));
      } catch (err) {
        throw new ConfigError(
          `Could not parse ${opts.abiPath} as JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
          `Pass --abi to a Foundry artifact (forge build output) or a raw ABI array JSON file.`
        );
      }
      // Accept either a raw ABI array or a Foundry artifact `{ abi }`.
      const abi = Array.isArray(parsed)
        ? parsed
        : ((parsed as { abi?: unknown[] }).abi ?? []);
      if (!Array.isArray(abi) || abi.length === 0) {
        throw new ConfigError(
          `No ABI found in ${opts.abiPath}.`,
          `The file must be a JSON array (raw ABI) or an object with an 'abi' field (Foundry artifact).`
        );
      }
      const network: NetworkKey =
        opts.network === "aristotle" ||
        opts.network === "galileo" ||
        opts.network === "local"
          ? (opts.network as NetworkKey)
          : "galileo";
      const tc = createTypedContract({
        abi: abi as never,
        address: opts.address,
        network,
        rpcUrl: opts.rpcUrl,
      });
      const fn = tc.estimate[opts.method];
      if (!fn) {
        throw new ConfigError(
          `Method '${opts.method}' is not a non-view function in this ABI.`,
          `Pass --method <writeMethod> where writeMethod is one of: ${Object.keys(tc.estimate).join(", ")}`
        );
      }
      return fn(...opts.args);
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
  jobsBackendFactory: ((kind, path) =>
    loadJobsBackend(kind, path)) satisfies JobsBackendFactory,
  // SP11: pure estimate helpers wired to the published estimate functions —
  // offline, no RPC. Used by `0g cost forecast`.
  storageEstimate: async (bytes) => makeStorageEstimate(bytes),
  computeEstimate: async ({ prompt, model, maxOutputTokens }) =>
    makeComputeEstimate({
      messages: [{ role: "user", content: prompt }],
      model,
      maxOutputTokens,
    }),
  daEstimate: async (bytes) => daEstimateBytes(bytes),
  // SP14 — read-back helpers from @foundryprotocol/0gkit-observability.
  // The trace sink itself is a side-channel inside instrument0g; here we
  // only need the pure file-read helpers, no OTel SDK setup.
  tracesReader: {
    defaultTraceDir: obsDefaultTraceDir,
    listTraceFiles: obsListTraceFiles,
    readTraceFile: obsReadTraceFile,
    summarizeTrace: obsSummarizeTrace,
  },
  readStdin,
  fetch: globalThis.fetch,
  cwd: () => process.cwd(),
  env: process.env as Record<string, string | undefined>,
  isTTY: process.stdout.isTTY === true,
  noColor: process.env.NO_COLOR != null,
  write: (line) => process.stdout.write(line + "\n"),
  argv: process.argv.slice(2),
  writeErr: (line) => process.stderr.write(line + "\n"),
  packageVersions: readPackageVersions,
  now: () => new Date(),
  /**
   * K5-C — builds SuiteDeps for the conformance runner from CLI context.
   *
   * Compute honesty note (D81): the real Compute class is broker-based.
   * `broker.inference.*` requires an ethers Wallet + a registered 0G provider
   * address.  We wrap `Compute.inference()` into the `{ inference }` factory
   * shape SuiteDeps expects, but the live suite will report `ok:false` with a
   * truthful detail if the broker is not configured — never a fake pass.
   */
  conformanceDeps: ({ network, local }): SuiteDeps => {
    const rpcUrl = local ? "http://127.0.0.1:8545" : undefined;
    const privateKey = process.env.ZEROG_PRIVATE_KEY;

    return {
      makeStorage: () => {
        const s = new Storage({ network: network as never, rpcUrl });
        return {
          upload: (b) => s.upload(b),
          download: (r) => s.download(r),
        };
      },
      makeCompute: () => {
        // Compute is broker-based — wraps Compute.inference into SuiteDeps shape.
        // If no private key or broker, the suite will catch and report ok:false.
        //
        // Finding 2 (known deferral): `{ brokerKey }` is deprecated in favour of
        // `{ signer }`.  Building a signer here would require importing
        // @foundryprotocol/0gkit-wallet synchronously at factory-construction time.
        // Deferred until 0gkit-wallet exposes a sync `signerFromKey` helper (post-K1).
        const c = new Compute({
          network: network as never,
          brokerRpc: rpcUrl,
          ...(privateKey ? { brokerKey: privateKey } : {}),
        });
        return {
          inference: (a) => c.inference(a).then((r) => ({ output: r.output })),
        };
      },
      makeDA: () => {
        const d = new DA({ network: network as never });
        return {
          publish: (b) => d.publish(b).then((r) => ({ digest: r.digest })),
          // SuiteDeps signature: (digest, bytes) => Promise<boolean>
          // Real DA.verify signature: (payload, expectedDigest) => boolean (sync)
          verify: (digest, b) => Promise.resolve(d.verify(b, digest)),
        };
      },
      testWallet: () => {
        // Uses a deterministic fixture key (anvil account #0) — safe for
        // testnet/local conformance.  signMessage lazy-imports viem at call time
        // (D39: computed specifier — never statically bundled).
        return {
          address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
          signMessage: async (message: string): Promise<`0x${string}`> => {
            // D39: computed specifier — never statically bundled.
            const viemSpec = "viem/accounts";
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const viemAccounts = await import(/* @vite-ignore */ viemSpec as string);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const account = viemAccounts.privateKeyToAccount(
              "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`
            );
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            return account.signMessage({ message });
          },
        };
      },
    };
  },
  runKitConformance: defaultRunKitConformance,
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
