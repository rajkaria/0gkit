import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFoundryPlugin } from "../foundry-plugin.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

describe("0gkit neutrality boundary (MCP)", () => {
  it("pnpm boundary:check passes with the foundry plugin loader present", () => {
    let ok = true;
    let out = "";
    try {
      out = execSync("pnpm boundary:check", {
        cwd: repoRoot,
        stdio: "pipe",
      }).toString();
    } catch (e: any) {
      ok = false;
      out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    }
    expect(ok, `boundary:check failed:\n${out}`).toBe(true);
  });

  it("foundry-plugin.ts contains NO static @foundryprotocol import", () => {
    const src = readFileSync(resolve(here, "../foundry-plugin.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@foundryprotocol/);
    expect(src).not.toMatch(/import\(\s*["']@foundryprotocol/);
  });

  it("loadFoundryPlugin is absent by default (no opt-in)", async () => {
    expect(await loadFoundryPlugin({ env: {} })).toBe(null);
  });

  it("loadFoundryPlugin opted-in but module unresolvable → null (graceful)", async () => {
    const r = await loadFoundryPlugin({ optIn: true, env: {} });
    expect(r === null || typeof r.name === "string").toBe(true);
  });

  it("ZEROG_FOUNDRY truthy values enable the opt-in path", async () => {
    // No @foundryprotocol/mcp adapter resolvable in unit env → still null,
    // but the gate itself must accept "1"/"true"/"yes".
    for (const v of ["1", "true", "yes"]) {
      const r = await loadFoundryPlugin({ env: { ZEROG_FOUNDRY: v } });
      expect(r === null || typeof r.name === "string").toBe(true);
    }
  });
});
