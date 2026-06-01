import { Command } from "commander";
import {
  ZeroGError,
  helpUrlFor,
  buildDefectReport,
  type ErrorCode,
} from "@foundryprotocol/0gkit-core";
import type { createClient, getNetwork } from "@foundryprotocol/0gkit-core";
import type {
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
import type {
  startDevnet,
  stopDevnet,
  isRunning,
  readState,
  clearState,
} from "@foundryprotocol/0gkit-devnet";
import type { Estimate } from "@foundryprotocol/0gkit-core";
import { createOutput, type CommandResult } from "./output.js";
import { resolveContext, type CliContext, type GlobalFlags } from "./context.js";
import type { FoundryPlugin } from "./foundry-loader.js";
import { registerChain } from "./commands/chain.js";
import { registerDev } from "./commands/dev.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerInit } from "./commands/init.js";
import { registerStorage } from "./commands/storage.js";
import { registerDa } from "./commands/da.js";
import { registerAttest } from "./commands/attest.js";
import { registerInfer } from "./commands/infer.js";
import { registerFoundry } from "./commands/foundry.js";
import { registerContracts } from "./commands/contracts.js";
import { registerEstimate } from "./commands/estimate.js";
import { registerJobs, type JobsBackendFactory } from "./commands/jobs.js";
import { registerCost } from "./commands/cost.js";
import { registerTraces } from "./commands/traces.js";
import type {
  TraceFileEntry,
  TraceFileSummary,
  TraceRecord,
} from "@foundryprotocol/0gkit-observability";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  try {
    const packageJsonPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json"
    );
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readPackageVersion();

export interface FsLike {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface ProgramDeps {
  createClient: typeof createClient;
  getNetwork: typeof getNetwork;
  faucet: typeof faucet;
  balance: typeof balance;
  waitForReceipt: typeof waitForReceipt;
  attachExplorerUrl: typeof attachExplorerUrl;
  explorerUrl: typeof explorerUrl;
  makeStorage: (cfg: ConstructorParameters<typeof Storage>[0]) => Storage;
  makeCompute: (cfg: ConstructorParameters<typeof Compute>[0]) => Compute;
  makeDA: (cfg: ConstructorParameters<typeof DA>[0]) => DA;
  attest: {
    parseEnvelope: typeof parseEnvelope;
    verifyEnvelope: typeof verifyEnvelope;
    reportEnvelope: typeof reportEnvelope;
  };
  devnet: {
    startDevnet: typeof startDevnet;
    stopDevnet: typeof stopDevnet;
    isRunning: typeof isRunning;
    readState: typeof readState;
    clearState: typeof clearState;
  };
  loadFoundry: () => Promise<FoundryPlugin | null>;
  contracts: {
    generate: (opts: {
      abiPath: string;
      outDir: string;
      name?: string;
    }) => Promise<{ name: string; outputPath: string; bytesWritten: number }>;
    listStandard: (network: string) => Array<{
      name: string;
      address: `0x${string}` | null;
      description: string;
    }>;
    getStandard: (
      name: string,
      network: string
    ) => {
      name: string;
      address: `0x${string}` | null;
      description: string;
      methods: readonly string[];
      events: readonly string[];
    } | null;
    estimate: (opts: {
      abiPath: string;
      address: `0x${string}`;
      method: string;
      args: unknown[];
      network: string;
      rpcUrl?: string;
    }) => Promise<Estimate>;
  };
  jobsBackendFactory: JobsBackendFactory;
  /**
   * SP11 — pure estimate factories used by `0g cost forecast` (aggregates
   * estimates across ops without dialling RPC). These are intentionally
   * separate from `makeStorage`/`makeCompute`/`makeDA`: the cost command
   * only needs the offline `Estimate` math, not a full primitive instance.
   */
  storageEstimate: (bytes: number) => Promise<Estimate>;
  computeEstimate: (args: {
    prompt: string;
    model?: string;
    maxOutputTokens?: number;
  }) => Promise<Estimate>;
  daEstimate: (bytes: number) => Promise<Estimate>;
  /**
   * SP14 — local trace explorer. The CLI reads JSONL trace mirrors written
   * by `0gkit-observability` when `OGKIT_TRACE_DIR` is set. Wired through
   * `ProgramDeps` so tests can inject fakes without touching the filesystem.
   */
  tracesReader: {
    defaultTraceDir: () => string | null;
    listTraceFiles: (dir: string) => Promise<TraceFileEntry[]>;
    readTraceFile: (path: string) => Promise<TraceRecord[]>;
    summarizeTrace: (id: string, recs: TraceRecord[]) => TraceFileSummary;
  };
  fs: FsLike;
  readStdin: () => Promise<Uint8Array>;
  /** Injected so `0g doctor` reachability probes are testable (no real net). */
  fetch: typeof fetch;
  cwd: () => string;
  env: Record<string, string | undefined>;
  isTTY: boolean;
  noColor: boolean;
  write: (line: string) => void;
  /** Original argv (without bin name) used to render the issue-context CLI line. */
  argv: readonly string[];
  /** Side-channel for the issue-context report. Goes to stderr in production
   *  so it never pollutes `--json` stdout. Tests inject a recorder. */
  writeErr: (line: string) => void;
  /** Resolves installed `@foundryprotocol/0gkit-*` versions for issue-context. */
  packageVersions: () => Array<{ name: string; version: string }>;
  /** Injected for deterministic timestamps in issue-context. */
  now: () => Date;
}

/** Build the resolved context + output sink for one command invocation. */
export function ctxOf(deps: ProgramDeps, cmd: Command) {
  const globals = cmd.optsWithGlobals() as GlobalFlags;
  const context: CliContext = resolveContext(globals, deps.env);
  const out = createOutput({
    json: context.json,
    isTTY: deps.isTTY,
    noColor: deps.noColor,
    write: deps.write,
  });
  return { context, out };
}

/** Run a command body, mapping any ZeroGError to the renderer + exit code 1. */
export async function runCommand(
  deps: ProgramDeps,
  cmd: Command,
  body: (ctx: CliContext) => Promise<CommandResult>
): Promise<void> {
  const { context, out } = ctxOf(deps, cmd);
  try {
    out.success(await body(context));
  } catch (err) {
    let rendered: { code: string; message: string; hint: string; helpUrl: string };
    let stack: string | undefined;
    if (err instanceof ZeroGError) {
      rendered = {
        code: err.code,
        message: err.message,
        hint: err.hint,
        helpUrl: err.helpUrl,
      };
      stack = err.stack;
    } else {
      const e = err as {
        code?: string;
        message?: string;
        hint?: string;
        stack?: string;
      };
      const fallbackCode = "CONFIG_INVALID_ARGUMENT";
      rendered = {
        code: e.code ?? fallbackCode,
        message: e.message ?? String(err),
        hint: e.hint ?? "Unexpected error — re-run with --json for the raw shape.",
        helpUrl: helpUrlFor((e.code as never) ?? fallbackCode),
      };
      stack = e.stack;
    }
    out.failure(rendered);
    if (context.copyIssueContext) {
      const { buildIssueContext } = await import("./issue-context.js");
      const { release } = await import("node:os");
      const md = buildIssueContext({
        error: { ...rendered, stack },
        argv: deps.argv,
        node: process.version,
        os: `${process.platform} ${release()}`,
        packages: deps.packageVersions(),
        now: deps.now(),
      });
      deps.writeErr(md);
    }
    if (context.defectReport) {
      let chainId: number | undefined;
      try {
        chainId = deps.getNetwork(context.network).chainId;
      } catch {
        chainId = undefined;
      }
      const { release } = await import("node:os");
      const md = buildDefectReport({
        error: { ...rendered, code: rendered.code as ErrorCode },
        env: {
          network: context.network,
          chainId,
          runtime: `node ${process.version} / ${process.platform} ${release()}`,
        },
      });
      deps.writeErr(md);
    }
    process.exitCode = 1;
  }
}

export function buildProgram(deps: ProgramDeps): Command {
  const program = new Command();
  program
    .name("0g")
    .description("The neutral 0G command line. Foundry is a separate opt-in plugin.")
    .version(VERSION)
    .option("--network <name>", "aristotle | galileo | local (default: galileo)")
    .option("--rpc <url>", "override the network RPC URL")
    .option("--private-key <hex>", "signer key (or env ZEROG_PRIVATE_KEY)")
    .option("--json", "machine-readable JSON output")
    .option("--foundry", "force-show the optional Foundry plugin namespace")
    .option(
      "--copy-issue-context",
      "on error, print a redacted markdown report to stderr — paste into a new GitHub issue"
    )
    .option(
      "--defect-report",
      "on error, print a QA defect report to stderr in the 0G app-test template (auto-routed + severity-suggested)"
    )
    // Ensure subcommands inherit exit-override so commander throws rather than
    // calling process.exit — required for requiredOption validation in tests.
    .exitOverride();

  registerChain(program, deps);
  registerDev(program, deps);
  registerDoctor(program, deps);
  registerInit(program, deps);
  registerStorage(program, deps);
  registerDa(program, deps);
  registerAttest(program, deps);
  registerInfer(program, deps);
  registerContracts(program, deps);
  registerEstimate(program, deps);
  registerJobs(program, deps);
  registerCost(program, deps);
  registerTraces(program, deps);
  registerFoundry(program, deps);

  return program;
}
