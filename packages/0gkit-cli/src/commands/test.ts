/**
 * 0g test — conformance runner
 *
 * Runs the 0gkit conformance suites (storage / compute / da / wallet) against
 * local or live network. `@foundryprotocol/0gkit-testing` is lazy-loaded via a
 * COMPUTED dynamic specifier so it is NOT bundled and cold-start is unaffected
 * (D39 / D84).  Tests inject `runConformance`, `conformanceDeps`, and
 * `runKitConformance` through `ProgramDeps` to avoid any real import or
 * network call.
 */

import type { Command } from "commander";
import { runCommand, type ProgramDeps } from "../program.js";

export function registerTest(program: Command, deps: ProgramDeps): void {
  program
    .command("test")
    .description(
      "conformance: round-trip storage / compute / da / wallet on local | galileo"
    )
    .option(
      "--suite <list>",
      "comma list of suites to run: storage,compute,da,wallet (default: all)"
    )
    .option("--local", "use the running `0g dev` stack (http://127.0.0.1:8545)")
    .option("--galileo", "use the live galileo testnet (default)")
    .option("--kits", "also run each applied kit's conformance check")
    .action(async function (this: Command) {
      const opts = this.opts() as {
        suite?: string;
        local?: boolean;
        galileo?: boolean;
        kits?: boolean;
      };
      await runCommand(deps, this, async (ctx) => {
        // D39/D84: computed specifier keeps `0gkit-testing` out of cold-start.
        // The injected `deps.runConformance` is used when present (tests); the
        // real lazy import is the production path.
        const runConformanceFn =
          deps.runConformance ??
          (async (o: Parameters<typeof import("@foundryprotocol/0gkit-testing")["runConformance"]>[0]) => {
            const spec = "@foundryprotocol/0gkit-testing";
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const mod = await import(/* @vite-ignore */ spec as string);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            return mod.runConformance(o);
          });

        const suites = opts.suite
          ? opts.suite.split(",").map((s) => s.trim())
          : undefined;

        const suiteDeps =
          deps.conformanceDeps?.({ network: ctx.network, local: opts.local }) ?? {
            makeStorage: () => { throw new Error("no conformanceDeps"); },
            makeCompute: () => { throw new Error("no conformanceDeps"); },
            makeDA: () => { throw new Error("no conformanceDeps"); },
            testWallet: () => { throw new Error("no conformanceDeps"); },
          };

        const results = await runConformanceFn({ suites: suites as never, deps: suiteDeps });

        const failed = results.filter((r: { ok: boolean }) => !r.ok);
        if (failed.length > 0) process.exitCode = 1;

        const kitNotes: string[] = opts.kits
          ? await (deps.runKitConformance ?? defaultRunKitConformance)(deps.cwd())
          : [];

        const network = opts.local ? "local" : ctx.network;

        return {
          human: [
            `0g test — network ${network}`,
            ...results.map(
              (r: { ok: boolean; name: string; detail: string }) =>
                `  ${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`
            ),
            ...kitNotes,
            failed.length > 0
              ? `${failed.length} suite(s) failed`
              : "all conformance suites passed",
          ],
          json: { network, results, kits: kitNotes },
        };
      });
    });
}

/**
 * Default (production) runKitConformance:
 * reads `${cwd}/.0gkit/kits.json` (the manifest K5-B writes), then for each
 * applied kit tries to dynamic-import its conformance module.
 *
 * This function is injected via ProgramDeps in tests so no filesystem/network
 * is required there.  The production default is exported here and wired in
 * program.ts.
 */
export async function defaultRunKitConformance(cwd: string): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const manifestPath = join(cwd, ".0gkit", "kits.json");

  let manifest: { applied?: string[]; base?: string; at?: string };
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = JSON.parse(raw) as typeof manifest;
  } catch {
    // No manifest — no kits applied yet (additive / informational only)
    return ["no kits applied — run `0g add <kit>`"];
  }

  const applied = manifest.applied ?? [];
  if (applied.length === 0) {
    return ["no kits applied — run `0g add <kit>`"];
  }

  const notes: string[] = [];
  for (const kit of applied) {
    const modPath = join(cwd, ".0gkit", "kits", kit, "conformance.ts");
    try {
      // D39: computed specifier
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const kitMod = await import(/* @vite-ignore */ modPath as string);
      const runFn = (kitMod as { default?: unknown }).default;
      if (typeof runFn === "function") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const result = (await runFn()) as { ok: boolean; detail: string } | undefined;
        if (result && typeof result === "object") {
          notes.push(
            `  ${result.ok ? "✓" : "✗"} ${kit}: ${result.detail}`
          );
        } else {
          notes.push(`  • ${kit}: conformance ran (no result shape)`);
        }
      } else {
        notes.push(`  • ${kit}: no default export in conformance.ts`);
      }
    } catch {
      // conformance.ts doesn't exist for this kit — not an error
      notes.push(`  • ${kit}: no conformance module`);
    }
  }
  return notes;
}
