import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initGitRepo } from "../git.js";

describe("initGitRepo", () => {
  it("creates a .git directory and an initial commit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cga-git-"));
    writeFileSync(join(dir, "README.md"), "# test");
    const result = await initGitRepo({ dest: dir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(dir, ".git"))).toBe(true);
  }, 10_000);

  it("returns ok: false (not throw) when git is not installed", async () => {
    const result = await initGitRepo({ dest: "/nope", gitBin: "/nope/git" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/git|ENOENT|spawn/i);
  });
});
