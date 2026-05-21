import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgSrc = resolve(here, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

// NOTE: The global `pnpm boundary:check` is already validated by
// `packages/0gkit-chain/src/__tests__/boundary.test.ts`. Running it again here
// races with that test under turbo's parallel runner (it temporarily writes
// `packages/0gkit-chain/src/__boundary_violation__.ts` while asserting that
// depcruise catches violations). This test stays scoped to the indexer source.
describe("0gkit-indexer neutrality boundary", () => {
  it("no source file imports a non-0gkit @foundryprotocol package", () => {
    const files = walk(pkgSrc).filter((f) => !f.includes("__tests__"));
    const offenders: string[] = [];
    const staticRe = /from\s+["']@foundryprotocol\/(?!0gkit-)/;
    const dynRe = /import\(\s*["']@foundryprotocol\/(?!0gkit-)/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (staticRe.test(src) || dynRe.test(src)) offenders.push(f);
    }
    expect(offenders, `offending files:\n${offenders.join("\n")}`).toEqual([]);
  });
});
