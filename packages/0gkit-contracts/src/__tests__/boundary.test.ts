import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const srcDir = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe("0gkit-contracts protocol neutrality", () => {
  it("does not statically import any @foundryprotocol/* non-0gkit-* package", () => {
    const bad: string[] = [];
    for (const file of walk(srcDir)) {
      const txt = readFileSync(file, "utf8");
      const matches = txt.matchAll(/from\s+["']@foundryprotocol\/([^"']+)["']/g);
      for (const m of matches) {
        if (!m[1].startsWith("0gkit-")) bad.push(`${file}: @foundryprotocol/${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
