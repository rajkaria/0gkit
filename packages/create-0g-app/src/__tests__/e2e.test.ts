import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../index.js";

describe.skipIf(!process.env.CI_HAS_NET)(
  "create-0g-app e2e (storage-app, local, no install)",
  () => {
    it("scaffolds a complete project", async () => {
      const cwd = mkdtempSync(join(tmpdir(), "cga-e2e-"));
      const code = await run(
        [
          "node",
          "create-0g-app",
          "demo",
          "--template",
          "storage-app",
          "--network",
          "local",
          "--no-install",
          "--no-git",
        ],
        { cwd }
      );
      expect(code).toBe(0);
      expect(existsSync(join(cwd, "demo", "package.json"))).toBe(true);
      expect(existsSync(join(cwd, "demo", ".env.example"))).toBe(true);
      expect(existsSync(join(cwd, "demo", "src"))).toBe(true);
    }, 60_000);
  }
);
