import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../program.js";

/**
 * Regression test for the bug fixed alongside this test (drop of the
 * hardcoded `export const VERSION = "0.1.0"` in program.ts): every release
 * used to ship the wrong --version output. The fix reads from package.json
 * at runtime. This test asserts the wiring stays correct — if someone
 * hardcodes a version string again, or breaks the readFileSync path, CI
 * catches it before the next release.
 *
 * Lives in the CLI package so it runs in the normal `pnpm test` matrix.
 */
describe("VERSION sync", () => {
  it("exported VERSION matches package.json#version exactly", () => {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "package.json"
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
    // Defensive: VERSION must look like a real semver string, not the
    // readPackageVersion() fallback or an empty string.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/);
    expect(VERSION).not.toBe("0.0.0"); // the fallback in readPackageVersion()
  });
});
