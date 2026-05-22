import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..");

function* walk(dir: string): Generator<string> {
  for (const ent of readdirSync(dir)) {
    if (ent === "__tests__") continue;
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

describe("protocol neutrality", () => {
  it("never imports @foundryprotocol/* non-0gkit packages", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      const matches = src.match(/from\s+["']@foundryprotocol\/(?!0gkit-)[^"']+["']/g);
      if (matches) offenders.push(`${file}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
