import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", "..");
const repoRoot = join(pkgRoot, "..", "..");
const cliPath = join(pkgRoot, "dist", "cli.js");
const indexPath = join(pkgRoot, "dist", "index.js");

const packageJson = JSON.parse(
  readFileSync(join(pkgRoot, "package.json"), "utf8")
) as { version: string };

describe("0g-mcp CLI metadata", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["--filter", "@foundryprotocol/0gkit-mcp", "build"], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  });

  it("keeps exported VERSION synchronized with package.json", async () => {
    const { VERSION } = (await import(pathToFileURL(indexPath).href)) as {
      VERSION: string;
    };

    expect(VERSION).toBe(packageJson.version);
  });

  for (const arg of ["--version", "-V"]) {
    it(`prints package version for ${arg} without starting the server`, () => {
      const result = spawnSync(process.execPath, [cliPath, arg], {
        cwd: pkgRoot,
        encoding: "utf8",
        timeout: 2000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(packageJson.version);
      expect(result.stderr).not.toContain("ready");
    });
  }

  for (const arg of ["--help", "-h"]) {
    it(`prints help for ${arg} without starting the server`, () => {
      const result = spawnSync(process.execPath, [cliPath, arg], {
        cwd: pkgRoot,
        encoding: "utf8",
        timeout: 2000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("0g-mcp");
      expect(result.stderr).not.toContain("ready");
    });
  }
});
