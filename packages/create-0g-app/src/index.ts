import { Command, CommanderError } from "commander";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { execa } from "execa";
import { renderBanner } from "./banner.js";
import { writeEnvExample } from "./env.js";
import { initGitRepo } from "./git.js";
import { detectPackageManager, installCommand } from "./pm.js";
import { interactivePrompts, validateProjectName } from "./prompts.js";
import { TEMPLATES, fetchTemplate, isValidTemplateName } from "./templates.js";
import type { CreateOptions, Network, PackageManager, TemplateName } from "./types.js";

export interface RunDeps {
  cwd?: string;
  log?: (m: string) => void;
  err?: (m: string) => void;
}

export type { CreateOptions, Network, PackageManager, TemplateName };

/**
 * The full `create-0g-app` orchestrator. Returns a process exit code.
 *
 * @param argv full `process.argv`-shaped array (must include node + bin path
 *             at positions 0+1; commander.parse strips them).
 * @param deps injection seam for tests (cwd, log, err).
 */
export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const log = deps.log ?? ((m: string) => process.stdout.write(m + "\n"));
  const err = deps.err ?? ((m: string) => process.stderr.write(m + "\n"));
  const cwd = deps.cwd ?? process.cwd();

  const program = new Command("create-0g-app")
    .exitOverride()
    .version("0.1.0")
    .description("Scaffold a 0G app in seconds.")
    .argument("[name]", "Project name (interactive prompt if omitted)")
    .option(
      "-t, --template <name>",
      `Template (${TEMPLATES.map((t) => t.name).join("|")})`
    )
    .option("-n, --network <name>", "Network: local | galileo", "local")
    .option("--package-manager <pm>", "Package manager: pnpm | npm | yarn | bun")
    .option("--no-install", "Skip dependency install")
    .option("--no-git", "Skip git init");

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
    install: boolean;
    git: boolean;
  }>();
  const seedName = args[0] as string | undefined;

  // Validate template flag early so a typo doesn't waste a prompt.
  if (opts.template && !isValidTemplateName(opts.template)) {
    err(
      `Unknown template: ${opts.template}. Valid: ${TEMPLATES.map((t) => t.name).join(
        ", "
      )}`
    );
    return 1;
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
      dest: "",
      example: false,
    };
  } else {
    if (seedName) {
      const v = validateProjectName(seedName);
      if (!v.ok) {
        err(`Invalid name: ${v.reason}`);
        return 1;
      }
    }
    final = await interactivePrompts({
      name: seedName,
      template: opts.template as TemplateName | undefined,
      network: opts.network as Network | undefined,
      packageManager: opts.packageManager as PackageManager | undefined,
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
    await fetchTemplate({ name: final.template, dest });
  } catch (e) {
    err(`Template fetch failed: ${(e as Error).message}`);
    return 1;
  }

  // 2. write .env.example
  writeEnvExample({ network: final.network, dest });

  // 3. install
  if (final.install) {
    log(`→ Installing dependencies with ${final.packageManager}`);
    const [bin, ...rest] = installCommand(final.packageManager);
    try {
      await execa(bin, rest, { cwd: dest, stdio: "inherit" });
    } catch (e) {
      err(`(warn) install failed: ${(e as Error).message}`);
    }
  }

  // 4. git init
  if (final.git) {
    log(`→ Initialising git repository`);
    const r = await initGitRepo({ dest });
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
