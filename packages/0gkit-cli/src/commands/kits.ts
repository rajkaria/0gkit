/**
 * 0g add <kit...>        — apply one or more kits to the current project
 * 0g kits list [--base]  — list kits compatible with the detected (or forced) base
 * 0g kits info <kit>     — print kit summary, tiers, env vars
 *
 * D39 constraint: `@foundryprotocol/0gkit-kits` is loaded via a computed dynamic
 * specifier so it is NOT bundled into the CLI and cold-start is unaffected.
 * The `loadKitsEngine` dep is injectable for tests (no real import, no network).
 */

import type { Command } from "commander";
import { join, dirname } from "node:path";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { runCommand, type ProgramDeps } from "../program.js";
import {
  buildKitScaffold,
  toTitleCase,
  KIT_DOMAINS,
  KNOWN_BASES,
} from "./kit-scaffold.js";

// ---------------------------------------------------------------------------
// Engine interface (structural — matches @foundryprotocol/0gkit-kits exports)
// ---------------------------------------------------------------------------

export interface KitSummary {
  name: string;
  title: string;
  domain: string;
  summary: string;
  compatibleBases: string[];
  tiers: {
    lib: string[];
    adapters?: Record<string, string[]>;
    ui?: string[];
  };
  env: Array<{ key: string; example: string; note?: string }>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  requires: string[];
  composes: string[];
  conflicts: string[];
}

export interface ApplyResult {
  applied: string[];
  filesWritten: string[];
  envAdded: string[];
  notes: string[];
  token: "[0gkit:kit-applied]";
}

export interface KitsEngineLike {
  applyKit(opts: {
    kit: string;
    dest: string;
    base: string;
    pm?: string;
    dryRun?: boolean;
  }): Promise<ApplyResult>;
  listKits(opts?: { base?: string }): KitSummary[];
  getKit(name: string): KitSummary | undefined;
  detectBase(dir: string): string;
}

// ---------------------------------------------------------------------------
// Default lazy loader (D39 computed specifier — never statically bundled)
// ---------------------------------------------------------------------------

async function defaultLoadKitsEngine(): Promise<KitsEngineLike> {
  // Computed specifier ensures bundlers (tsup/esbuild) do NOT inline this dep.
  const spec = "@foundryprotocol/0gkit-kits";
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mod = await import(/* @vite-ignore */ spec);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return mod as KitsEngineLike;
}

// ---------------------------------------------------------------------------
// registerKits
// ---------------------------------------------------------------------------

interface KitsListOpts {
  base?: string;
}

interface KitsInfoOpts {
  base?: string;
}

interface AddOpts {
  base?: string;
  pm?: string;
  dryRun?: boolean;
}

interface KitsNewOpts {
  title?: string;
  domain?: string;
  summary?: string;
  bases?: string;
  dir?: string;
  dryRun?: boolean;
}

const KIT_NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function registerKits(program: Command, deps: ProgramDeps): void {
  const loadEngine: () => Promise<KitsEngineLike> =
    deps.loadKitsEngine ?? defaultLoadKitsEngine;

  // ------------------------------------------------------------------
  // 0g add <kit...>
  // ------------------------------------------------------------------
  program
    .command("add <kit...>")
    .description("Apply one or more kits to the current project.")
    .option(
      "--base <name>",
      "force the project base (react-app | mcp-agent | node | …)"
    )
    .option(
      "--pm <pm>",
      "package manager to use in printed install hint (pnpm | npm | yarn)"
    )
    .option(
      "--dry-run",
      "preview what would be written without touching the filesystem"
    )
    .action(async function (this: Command, kits: string[]) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as AddOpts;
        const engine = await loadEngine();

        const base = opts.base ?? engine.detectBase(deps.cwd());

        const allLines: string[] = [];
        const allJson: Record<string, unknown>[] = [];

        for (const kit of kits) {
          const result = await engine.applyKit({
            kit,
            dest: deps.cwd(),
            base,
            pm: opts.pm,
            dryRun: opts.dryRun,
          });

          // Human lines: notes + token
          const kitLines: string[] = [];
          if (result.filesWritten.length > 0) {
            kitLines.push(`  files     ${result.filesWritten.join(", ")}`);
          }
          if (result.envAdded.length > 0) {
            kitLines.push(
              `  env       ${result.envAdded.join(", ")} added to .env.example`
            );
          }
          for (const note of result.notes) {
            kitLines.push(`  note      ${note}`);
          }
          kitLines.push(`  ${result.token}`);

          allLines.push(`kit ${kit}`, ...kitLines, "");
          allJson.push({ kit, ...result });
        }

        // Remove trailing blank line
        if (allLines.at(-1) === "") allLines.pop();

        return {
          human: allLines,
          json:
            allJson.length === 1
              ? (allJson[0] as unknown as Record<string, unknown>)
              : ({ kits: allJson } as unknown as Record<string, unknown>),
        };
      });
    });

  // ------------------------------------------------------------------
  // 0g kits
  // ------------------------------------------------------------------
  const kitsCmd = program
    .command("kits")
    .description("Browse and inspect available kits.");

  // ------------------------------------------------------------------
  // 0g kits list [--base]
  // ------------------------------------------------------------------
  kitsCmd
    .command("list")
    .description("List kits compatible with the detected (or specified) project base.")
    .option("--base <name>", "override the project base filter")
    .action(async function (this: Command) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as KitsListOpts;
        const engine = await loadEngine();

        // Only detectBase when --base is absent
        const base = opts.base ?? engine.detectBase(deps.cwd());

        const kits = engine.listKits({ base });

        if (kits.length === 0) {
          return {
            human: [`no kits available for base "${base}"`],
            json: { base, kits: [] },
          };
        }

        const human = [
          `kits for base: ${base}`,
          "",
          ...kits.map(
            (k) => `  ${k.name.padEnd(24)} ${k.title.padEnd(28)} [${k.domain}]`
          ),
          "",
          `${kits.length} kit(s) found.`,
        ];

        return {
          human,
          json: {
            base,
            kits: kits.map((k) => ({
              name: k.name,
              title: k.title,
              domain: k.domain,
              summary: k.summary,
            })),
          },
        };
      });
    });

  // ------------------------------------------------------------------
  // 0g kits info <kit>
  // ------------------------------------------------------------------
  kitsCmd
    .command("info <kit>")
    .description(
      "Print detailed info for a kit: summary, tiers, compatible bases, env vars."
    )
    .action(async function (this: Command, kit: string) {
      await runCommand(deps, this, async () => {
        const engine = await loadEngine();
        const manifest = engine.getKit(kit);

        if (!manifest) {
          throw new ConfigError(
            `Kit "${kit}" not found in registry.`,
            `Run "0g kits list" to see available kits.`
          );
        }

        const tierFiles: string[] = [
          ...(manifest.tiers.lib ?? []),
          ...Object.values(manifest.tiers.adapters ?? {}).flat(),
          ...(manifest.tiers.ui ?? []),
        ];

        const human: string[] = [
          `kit ${manifest.name}`,
          `  title     ${manifest.title}`,
          `  domain    ${manifest.domain}`,
          `  summary   ${manifest.summary}`,
          `  bases     ${manifest.compatibleBases.join(", ")}`,
        ];

        if (tierFiles.length > 0) {
          human.push(`  tiers     ${tierFiles.join(", ")}`);
        }

        if (manifest.requires.length > 0) {
          human.push(
            `  requires  ${manifest.requires.map((r) => `@foundryprotocol/${r}`).join(", ")}`
          );
        }

        if (manifest.env.length > 0) {
          human.push("", "  env vars:");
          for (const { key, example, note } of manifest.env) {
            const noteStr = note ? `  # ${note}` : "";
            human.push(`    ${key}=${example}${noteStr}`);
          }
        }

        return {
          human,
          json: manifest as unknown as Record<string, unknown>,
        };
      });
    });

  // ------------------------------------------------------------------
  // 0g kits new <name>
  //   Scaffold a brand-new kit (manifest + 3-tier skeleton + doc stub) that a
  //   developer can publish to the shared 0G kit catalog via a PR. When run
  //   inside the 0gkit monorepo it writes into templates/_kits/ and the docs
  //   tree; anywhere else it writes a self-contained kit folder in the cwd.
  // ------------------------------------------------------------------
  kitsCmd
    .command("new <name>")
    .description("Scaffold a new kit you can publish to the shared 0G kit catalog.")
    .option(
      "--title <title>",
      "human-readable kit title (default: Title Case of the name)"
    )
    .option("--domain <domain>", `kit domain (${KIT_DOMAINS.join(" | ")})`)
    .option("--summary <summary>", "one-sentence description of the kit")
    .option(
      "--bases <csv>",
      `comma-separated compatible bases (${KNOWN_BASES.join(", ")})`
    )
    .option(
      "--dir <path>",
      "output directory (default: templates/_kits when in the 0gkit repo, else cwd)"
    )
    .option("--dry-run", "print the plan without writing any files")
    .action(async function (this: Command, name: string) {
      await runCommand(deps, this, async () => {
        const opts = this.opts() as KitsNewOpts;

        // --- validate name -------------------------------------------------
        if (!KIT_NAME_RE.test(name)) {
          throw new ConfigError(
            `Kit name "${name}" must be kebab-case (lowercase letters/digits, single hyphens).`,
            `Try "0g kits new my-feature".`
          );
        }

        // --- validate domain -----------------------------------------------
        const domain = opts.domain ?? "agent-infra";
        if (!(KIT_DOMAINS as readonly string[]).includes(domain)) {
          throw new ConfigError(
            `Unknown kit domain "${domain}".`,
            `Use one of: ${KIT_DOMAINS.join(", ")}.`
          );
        }

        // --- validate bases ------------------------------------------------
        const bases = (opts.bases ?? "react-app")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (bases.length === 0) {
          throw new ConfigError(
            `--bases must list at least one base.`,
            `e.g. --bases react-app,mcp-agent`
          );
        }
        const unknownBases = bases.filter(
          (b) => !(KNOWN_BASES as readonly string[]).includes(b)
        );
        if (unknownBases.length > 0) {
          throw new ConfigError(
            `Unknown base(s): ${unknownBases.join(", ")}.`,
            `Known bases: ${KNOWN_BASES.join(", ")}.`
          );
        }

        const title = opts.title ?? toTitleCase(name);
        const summary = opts.summary ?? `TODO: one-sentence description of ${name}.`;

        const scaffold = buildKitScaffold({
          name,
          title,
          domain,
          summary,
          bases,
        });

        // --- resolve output location --------------------------------------
        const cwd = deps.cwd();
        const inRepo = await deps.fs.exists(join(cwd, "templates", "_kits"));
        const baseDir = opts.dir
          ? opts.dir
          : inRepo
            ? join(cwd, "templates", "_kits")
            : cwd;
        const kitDir = join(baseDir, name);

        // --- duplicate guard ----------------------------------------------
        if (await deps.fs.exists(join(kitDir, "kit.json"))) {
          throw new ConfigError(
            `A kit already exists at ${kitDir}.`,
            `Pick another name or remove the existing directory.`
          );
        }

        // Only write the docs page + nav hint when scaffolding inside the
        // monorepo (and not into a custom --dir): outside the repo there is no
        // apps/docs tree to write into.
        const writeDocPage = inRepo && !opts.dir;

        const planned: Array<{ path: string; contents: string }> = scaffold.files.map(
          (f) => ({
            path: join(kitDir, f.path),
            contents: f.contents,
          })
        );
        if (writeDocPage) {
          planned.push({
            path: join(cwd, scaffold.docPage.path),
            contents: scaffold.docPage.contents,
          });
        }

        if (!opts.dryRun) {
          const dirs = new Set(planned.map((f) => dirname(f.path)));
          for (const dir of dirs) {
            await deps.fs.mkdir(dir);
          }
          for (const f of planned) {
            await deps.fs.writeFile(f.path, f.contents);
          }
        }

        // --- human output --------------------------------------------------
        const verb = opts.dryRun ? "would create" : "created";
        const human: string[] = [
          `${verb} kit "${name}" (${domain})`,
          `  location  ${kitDir}`,
          "",
          `${opts.dryRun ? "planned files:" : "files written:"}`,
          ...planned.map((f) => `  ${f.path}`),
          "",
          "next steps to publish to the catalog:",
        ];
        if (inRepo) {
          human.push(
            `  1. Build the registry:  pnpm --filter @foundryprotocol/0gkit-kits build`,
            `  2. Validate the kit:    pnpm kits:check`,
            `  3. Register the doc page in apps/docs/lib/nav.ts under "Kits":`,
            `       ${scaffold.navLine.trim()}`,
            `  4. Fill in lib/${name}.ts + adapters, then open a PR to rajkaria/0gkit.`
          );
        } else {
          human.push(
            `  1. Fill in lib/${name}.ts + the per-base adapters.`,
            `  2. Copy ${name}/ into templates/_kits/ in a clone of rajkaria/0gkit.`,
            `  3. Add a doc page at apps/docs/app/kits/${name}/page.mdx and a nav entry:`,
            `       ${scaffold.navLine.trim()}`,
            `  4. Run pnpm kits:check, then open a PR. Once merged it's live via 0g add ${name}.`
          );
        }
        human.push("", `  [0gkit:kit-created]`);

        return {
          human,
          json: {
            name,
            title,
            domain,
            summary,
            bases,
            location: kitDir,
            files: planned.map((f) => f.path),
            navLine: scaffold.navLine.trim(),
            dryRun: Boolean(opts.dryRun),
            token: "[0gkit:kit-created]",
          },
        };
      });
    });
}
