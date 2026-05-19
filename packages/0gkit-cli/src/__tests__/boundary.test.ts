import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFoundry } from "../foundry-loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

describe("0gkit neutrality boundary (CLI)", () => {
  it("pnpm boundary:check passes with the foundry loader present", () => {
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

  it("foundry-loader.ts contains NO static @foundryprotocol import", () => {
    const src = execSync("cat src/foundry-loader.ts", {
      cwd: resolve(repoRoot, "packages/0gkit-cli"),
    }).toString();
    expect(src).not.toMatch(/from\s+["']@foundryprotocol/);
    expect(src).not.toMatch(/import\(\s*["']@foundryprotocol/);
  });

  it("loadFoundry returns null or a plugin", async () => {
    const r = await loadFoundry();
    expect(r === null || typeof r.version === "string").toBe(true);
  });
});
