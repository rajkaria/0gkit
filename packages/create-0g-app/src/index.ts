import { Command, CommanderError } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import {
  applyKit as realApplyKit,
  listKits as realListKits,
  getKit as realGetKit,
} from "@foundryprotocol/0gkit-kits";
import type {
  KitManifest,
  ApplyKitOptions,
  ApplyResult,
} from "@foundryprotocol/0gkit-kits";
import { renderBanner } from "./banner.js";
import { writeEnvExample } from "./env.js";
import { initGitRepo, type InitGitResult } from "./git.js";
import { detectPackageManager, installCommand } from "./pm.js";
import { interactivePrompts, validateProjectName } from "./prompts.js";
import {
  CI_OPTIONS,
  TEMPLATES,
  fetchCi,
  fetchTemplate,
  isValidCiOption,
  isValidTemplateName,
} from "./templates.js";
import type {
  CiOption,
  CreateOptions,
  Network,
  PackageManager,
  TemplateName,
} from "./types.js";

export type { CiOption, CreateOptions, Network, PackageManager, TemplateName };

/**
 * Dependency-injection seam. Tests inject fakes here so the orchestrator can
 * be exercised offline (no giget download, no install, no git on disk).
 * Production runs use the real implementations as defaults.
 */
export interface RunDeps {
  cwd?: string;
  programName?: string;
  programVersion?: string;
  log?: (m: string) => void;
  err?: (m: string) => void;
  fetchTemplate?: (opts: { name: TemplateName; dest: string }) => Promise<void>;
  fetchCi?: (opts: { choice: CiOption; dest: string }) => Promise<void>;
  runInstall?: (opts: {
    packageManager: PackageManager;
    dest: string;
  }) => Promise<void>;
  initGit?: (opts: { dest: string }) => Promise<InitGitResult>;
  prompts?: (seed: Partial<CreateOptions>) => Promise<CreateOptions | null>;
  /** Apply a single kit to the scaffolded project directory. Injected for tests. */
  applyKit?: (opts: ApplyKitOptions) => Promise<ApplyResult>;
  /** List kits compatible with a given base. Injected for tests. */
  listKits?: (opts?: { base?: string }) => KitManifest[];
  /** Look up a kit by name. Injected for tests. */
  getKit?: (name: string) => KitManifest | undefined;
}

const defaultFetchTemplate = (opts: { name: TemplateName; dest: string }) =>
  fetchTemplate(opts);

const defaultFetchCi = (opts: { choice: CiOption; dest: string }) => fetchCi(opts);

const defaultRunInstall = async (opts: {
  packageManager: PackageManager;
  dest: string;
}) => {
  const [bin, ...rest] = installCommand(opts.packageManager);
  await execa(bin, rest, { cwd: opts.dest, stdio: "inherit" });
};

const defaultInitGit = (opts: { dest: string }) => initGitRepo(opts);

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

/**
 * The full `create-0g-app` orchestrator. Returns a process exit code.
 *
 * @param argv full `process.argv`-shaped array (must include node + bin path
 *             at positions 0+1; commander.parse strips them).
 * @param deps injection seam for tests (cwd, log, err, and the side-effectful
 *             template fetcher / installer / git initialiser / prompts).
 */
export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => process.stdout.write(m + "\n"));
  const err = deps.err ?? ((m: string) => process.stderr.write(m + "\n"));
  const cwd = deps.cwd ?? process.cwd();
  const programName = deps.programName ?? "create-0g-app";
  const programVersion = deps.programVersion ?? readPackageVersion();
  const fetchTpl = deps.fetchTemplate ?? defaultFetchTemplate;
  const fetchCiFn = deps.fetchCi ?? defaultFetchCi;
  const runInstall = deps.runInstall ?? defaultRunInstall;
  const initGit = deps.initGit ?? defaultInitGit;
  const prompts = deps.prompts ?? interactivePrompts;
  const applyKitFn = deps.applyKit ?? realApplyKit;
  const listKitsFn = deps.listKits ?? realListKits;
  const getKitFn = deps.getKit ?? realGetKit;

  const program = new Command(programName)
    .exitOverride()
    .version(programVersion)
    .description("Scaffold a 0G app in seconds.")
    .argument("[name]", "Project name (interactive prompt if omitted)")
    .option(
      "-t, --template <name>",
      `Template (${TEMPLATES.map((t) => t.name).join("|")})`
    )
    .option("-n, --network <name>", "Network: local | galileo", "local")
    .option("--package-manager <pm>", "Package manager: pnpm | npm | yarn | bun")
    .option(
      "--ci <provider>",
      `CI workflow files (${CI_OPTIONS.map((c) => c.value).join("|")})`
    )
    .option("--no-install", "Skip dependency install")
    .option("--no-git", "Skip git init")
    .option(
      "--kits <names>",
      "Comma-separated kits to apply (e.g. agent-memory,kit-b)"
    );

  let parsed;
  try {
    parsed = program.parse(argv);
  } catch (e) {
    if (e instanceof CommanderError) {
      // --help / --version exit cleanly (code 0); parse errors are non-zero.
      return e.exitCode ?? 1;
    }
    throw e;
  }

  const args = parsed.args;
  const opts = parsed.opts<{
    template?: string;
    network?: string;
    packageManager?: string;
    ci?: string;
    install: boolean;
    git: boolean;
    kits?: string;
  }>();
  const seedName = args[0] as string | undefined;

  // Parse --kits flag into an array of trimmed, non-empty names.
  const requestedKits: string[] = opts.kits
    ? opts.kits
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  // Validate template flag early so a typo doesn't waste a prompt.
  if (opts.template && !isValidTemplateName(opts.template)) {
    err(
      `Unknown template: ${opts.template}. Valid: ${TEMPLATES.map((t) => t.name).join(
        ", "
      )}`
    );
    return 1;
  }

  // Validate kits early when both --template and --kits are supplied.
  // Must run before any scaffolding or prompts.
  if (requestedKits.length > 0 && opts.template) {
    const compatibleKits = listKitsFn({ base: opts.template });
    const compatibleNames = new Set(compatibleKits.map((k) => k.name));

    for (const kitName of requestedKits) {
      const manifest = getKitFn(kitName);
      if (!manifest) {
        err(
          `Unknown kit: ${kitName}. Valid kits for template "${opts.template}": ${
            compatibleKits.length > 0
              ? compatibleNames.size > 0
                ? [...compatibleNames].join(", ")
                : "(none)"
              : "(none)"
          }`
        );
        return 1;
      }
      if (!compatibleNames.has(kitName)) {
        err(
          `Kit "${kitName}" is not compatible with template "${opts.template}". ` +
            `Compatible kits: ${compatibleKits.length > 0 ? [...compatibleNames].join(", ") : "(none)"}`
        );
        return 1;
      }
    }
  }

  if (opts.network && opts.network !== "local" && opts.network !== "galileo") {
    err(`Unknown network: ${opts.network}. Valid: local, galileo`);
    return 1;
  }

  if (
    opts.packageManager &&
    !["pnpm", "npm", "yarn", "bun"].includes(opts.packageManager)
  ) {
    err(`Unknown package manager: ${opts.packageManager}. Valid: pnpm, npm, yarn, bun`);
    return 1;
  }

  if (opts.ci && !isValidCiOption(opts.ci)) {
    err(
      `Unknown CI provider: ${opts.ci}. Valid: ${CI_OPTIONS.map((c) => c.value).join(", ")}`
    );
    return 1;
  }

  // Non-interactive path: name + template both provided on the command line.
  // Anything else falls into the interactive prompt flow.
  let final: CreateOptions | null;
  if (seedName && opts.template) {
    const v = validateProjectName(seedName);
    if (!v.ok) {
      err(`Invalid name: ${v.reason}`);
      return 1;
    }
    final = {
      name: seedName,
      template: opts.template as TemplateName,
      network: (opts.network as Network | undefined) ?? "local",
      packageManager:
        (opts.packageManager as PackageManager | undefined) ?? detectPackageManager(),
      install: opts.install !== false,
      git: opts.git !== false,
      ci: (opts.ci as CiOption | undefined) ?? "github",
      dest: "",
      example: false,
      kits: requestedKits.length > 0 ? requestedKits : undefined,
    };
  } else {
    if (seedName) {
      const v = validateProjectName(seedName);
      if (!v.ok) {
        err(`Invalid name: ${v.reason}`);
        return 1;
      }
    }
    final = await prompts({
      name: seedName,
      template: opts.template as TemplateName | undefined,
      network: opts.network as Network | undefined,
      packageManager: opts.packageManager as PackageManager | undefined,
      ci: opts.ci as CiOption | undefined,
      install: opts.install,
      git: opts.git,
    });
    if (!final) return 1;
  }

  // Resolve destination. Absolute names land where they say; relative names
  // resolve under `cwd` (test seam).
  const dest = isAbsolute(final.name) ? final.name : resolve(cwd, final.name);
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    err(`Directory ${dest} is not empty.`);
    return 1;
  }
  mkdirSync(dest, { recursive: true });
  final.dest = dest;

  // 1. fetch template
  log(`→ Fetching template ${final.template}`);
  try {
    await fetchTpl({ name: final.template, dest });
  } catch (e) {
    err(`Template fetch failed: ${(e as Error).message}`);
    return 1;
  }

  // 1.5. fetch CI workflow files (skipped when ci=="none")
  if (final.ci !== "none") {
    log(`→ Adding ${final.ci} CI workflow`);
    try {
      await fetchCiFn({ choice: final.ci, dest });
    } catch (e) {
      err(`(warn) CI scaffold failed: ${(e as Error).message}`);
    }
  }

  // 1.6. apply kits
  const kitsToApply = final.kits ?? [];
  for (const kitName of kitsToApply) {
    log(`→ Applying kit: ${kitName}`);
    try {
      const result = await applyKitFn({
        kit: kitName,
        dest,
        base: final.template,
        pm: final.packageManager,
      });
      for (const note of result.notes) {
        log(`  [${kitName}] ${note}`);
      }
    } catch (e) {
      err(`(warn) Kit "${kitName}" apply failed: ${(e as Error).message}`);
    }
  }

  // 2. write .env.example
  writeEnvExample({ network: final.network, dest });

  // 3. install
  if (final.install) {
    log(`→ Installing dependencies with ${final.packageManager}`);
    try {
      await runInstall({ packageManager: final.packageManager, dest });
    } catch (e) {
      err(`(warn) install failed: ${(e as Error).message}`);
    }
  }

  // 4. git init
  if (final.git) {
    log(`→ Initialising git repository`);
    const r = await initGit({ dest });
    if (!r.ok) err(`(warn) git init skipped: ${r.reason}`);
  }

  // 5. banner
  log(
    renderBanner({
      name: final.name,
      packageManager: final.packageManager,
      network: final.network,
      template: final.template,
    })
  );

  return 0;
}
