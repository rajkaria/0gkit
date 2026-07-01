/**
 * 0g mcp init <agent> — write MCP config for cursor | claude | windsurf | codex
 *
 * By default writes a project-scoped config pointing at the neutral published
 * server (`npx -y @foundryprotocol/0gkit-mcp`).  When the project is a kitted
 * mcp-agent project (`.0gkit/kits.json` present, base="mcp-agent", kits applied),
 * switches to the local server (`npm --prefix <cwd> start`) so kit tools show up.
 *
 * D39 / D88 — `@foundryprotocol/0gkit-mcp` is lazy-imported via a computed
 * dynamic specifier so it is NOT bundled and the `0g --help` cold-start is
 * unaffected. The injectable `deps.mcpConfig` seam lets tests bypass the real
 * dynamic import (mirrors how `0g test` injects `deps.runConformance`).
 * `import type` at the top is erased at build time (type-only — safe).
 */

import type { Command } from "commander";
import type {
  buildMcpConfig as BuildMcpConfigFn,
  readAppliedKits as ReadAppliedKitsFn,
} from "@foundryprotocol/0gkit-mcp";
import { runCommand, type ProgramDeps } from "../program.js";

export function registerMcp(program: Command, deps: ProgramDeps): void {
  const mcp = program.command("mcp").description("wire 0gkit into your AI editor");

  mcp
    .command("init <agent>")
    .description("write MCP config for cursor | claude | windsurf | codex")
    .option("--global", "install to the agent's user-level config (default: project)")
    .action(async function (this: Command, agent: string) {
      const flags = this.opts() as { global?: boolean };
      await runCommand(deps, this, async () => {
        // D39 / D88: computed specifier keeps @foundryprotocol/0gkit-mcp out of
        // CLI cold-start. Tests inject deps.mcpConfig to skip the real import.
        let buildMcpConfig: typeof BuildMcpConfigFn;
        let readAppliedKits: typeof ReadAppliedKitsFn;

        if (deps.mcpConfig) {
          // Test seam: use injected functions directly.
          buildMcpConfig = deps.mcpConfig
            .buildMcpConfig as unknown as typeof BuildMcpConfigFn;
          readAppliedKits = deps.mcpConfig
            .readAppliedKits as unknown as typeof ReadAppliedKitsFn;
        } else {
          // Production: lazy computed-specifier import (D39).
          const spec = ["@foundryprotocol", "0gkit-mcp"].join("/");
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const mod = (await import(/* @vite-ignore */ spec as string)) as {
            buildMcpConfig: typeof BuildMcpConfigFn;
            readAppliedKits: typeof ReadAppliedKitsFn;
          };
          buildMcpConfig = mod.buildMcpConfig;
          readAppliedKits = mod.readAppliedKits;
        }

        const applied = await readAppliedKits(deps.cwd(), deps.fs);

        // homedir: injected (tests) or resolved lazily from node:os (production).
        let home: string;
        if (deps.homedir) {
          home = deps.homedir();
        } else {
          const { homedir: osHomedir } = await import("node:os");
          home = osHomedir();
        }

        const { path, json, mode, kits } = buildMcpConfig({
          agent: agent as Parameters<typeof BuildMcpConfigFn>[0]["agent"],
          scope: flags.global ? "global" : "project",
          home,
          cwd: deps.cwd(),
          applied,
        });

        // mkdir for the parent directory (FsLike.mkdir is always recursive).
        const parentDir = path.slice(0, path.lastIndexOf("/"));
        await deps.fs.mkdir(parentDir);
        await deps.fs.writeFile(path, JSON.stringify(json, null, 2) + "\n");

        const human = [
          `✓ wrote ${path}`,
          mode === "local"
            ? `  server: npm --prefix <project> start  (your local kitted mcp-agent server)`
            : `  server: npx @foundryprotocol/0gkit-mcp  (neutral 0G tools)`,
          ...(kits.length ? [`  kit tools from: ${kits.join(", ")}`] : []),
          `  Restart ${agent} to pick up the 0gkit tools.`,
        ];

        return { human, json: { agent, path, mode, kits } };
      });
    });
}
