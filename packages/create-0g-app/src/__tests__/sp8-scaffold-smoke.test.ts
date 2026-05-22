import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../index.js";

/**
 * SP8 smoke: every TEMPLATES entry must round-trip through `run` with a fake
 * fetcher that mimics giget by writing a stub package.json into `dest`. This
 * doesn't reach out to GitHub; it just verifies the orchestrator threads each
 * template name through validation → fetch → env-example → log lines.
 */
const TEMPLATES = [
  "storage-app",
  "inference-app",
  "attestation-verify",
  "mcp-agent",
  "react-app",
  "chat",
  "ai-agent",
  "tee-attested-api",
  "nft-with-storage",
];

describe("SP8 scaffold smoke", () => {
  it.each(TEMPLATES)("scaffolds %s end-to-end via fake fetcher", async (template) => {
    const root = mkdtempSync(join(tmpdir(), `sp8-${template}-`));
    const fakeFetch = async ({ name, dest }: { name: string; dest: string }) => {
      writeFileSync(
        join(dest, "package.json"),
        JSON.stringify({
          name,
          version: "0.1.0",
          type: "module",
          private: true,
        })
      );
      writeFileSync(join(dest, "README.md"), `# ${name}\n`);
    };
    const code = await run(
      [
        "node",
        "create",
        "demo",
        "--template",
        template,
        "--network",
        "local",
        "--no-install",
        "--no-git",
      ],
      {
        cwd: root,
        log: () => undefined,
        err: () => undefined,
        fetchTemplate: fakeFetch,
        runInstall: async () => undefined,
        initGit: async () => ({ ok: true }),
      }
    );
    expect(code).toBe(0);
    const pkgPath = join(root, "demo", "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string };
    expect(pkg.name).toBe(template);
    expect(existsSync(join(root, "demo", ".env.example"))).toBe(true);
  });
});
