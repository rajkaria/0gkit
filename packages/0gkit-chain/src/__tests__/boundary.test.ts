import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const violationFile = resolve(
  repoRoot,
  "packages/0gkit-chain/src/__boundary_violation__.ts"
);

function runBoundaryCheck(): { ok: boolean; out: string } {
  try {
    const out = execSync("pnpm boundary:check", {
      cwd: repoRoot,
      stdio: "pipe",
    }).toString();
    return { ok: true, out };
  } catch (e: any) {
    return {
      ok: false,
      out: `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`,
    };
  }
}

describe("CI neutrality boundary", () => {
  it("passes on the clean tree", () => {
    const { ok } = runBoundaryCheck();
    expect(ok).toBe(true);
  });

  it("fails when a 0gkit package imports Foundry", () => {
    writeFileSync(
      violationFile,
      `import "@foundryprotocol/sdk";\nexport const x = 1;\n`
    );
    try {
      const { ok, out } = runBoundaryCheck();
      expect(ok).toBe(false);
      expect(out).toContain("no-foundry-in-0gkit");
    } finally {
      rmSync(violationFile, { force: true });
    }
  });
});
