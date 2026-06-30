import { describe, it, expect } from "vitest";
import { mergePackageJson, appendEnv } from "../merge.js";

describe("mergePackageJson", () => {
  it("merges deps, keeps existing", () => {
    const out = mergePackageJson(
      { dependencies: { a: "^1.0.0" } },
      { dependencies: { a: "^1.0.0", b: "^2.0.0" } });
    expect(out.dependencies).toEqual({ a: "^1.0.0", b: "^2.0.0" });
  });

  it("does not overwrite existing keys in base", () => {
    const out = mergePackageJson(
      { dependencies: { a: "^2.0.0" } },
      { dependencies: { a: "^1.0.0", b: "^1.0.0" } });
    expect(out.dependencies?.a).toBe("^2.0.0");
    expect(out.dependencies?.b).toBe("^1.0.0");
  });

  it("does not mutate inputs", () => {
    const base = { dependencies: { a: "^1.0.0" } };
    const incoming = { dependencies: { b: "^2.0.0" } };
    mergePackageJson(base, incoming);
    expect(base.dependencies).toEqual({ a: "^1.0.0" });
  });

  it("merges devDependencies and scripts", () => {
    const out = mergePackageJson(
      { scripts: { build: "tsc" } },
      { devDependencies: { vitest: "^2.0.0" }, scripts: { test: "vitest" } });
    expect(out.scripts?.build).toBe("tsc");
    expect(out.scripts?.test).toBe("vitest");
    expect(out.devDependencies?.vitest).toBe("^2.0.0");
  });
});

describe("appendEnv", () => {
  it("appendEnv is idempotent", () => {
    const first = appendEnv("FOO=1\n", [{ key: "BAR", example: "2", note: "n" }]);
    const second = appendEnv(first, [{ key: "BAR", example: "2", note: "n" }]);
    expect(first).toBe(second);
    expect(first).toContain("# n\nBAR=2");
  });

  it("appends new keys only", () => {
    const result = appendEnv("EXISTING=yes\n", [
      { key: "EXISTING", example: "no" },
      { key: "NEW", example: "val", note: "a note" },
    ]);
    expect(result).toContain("NEW=val");
    // Should not duplicate EXISTING
    const matches = result.match(/EXISTING=/g);
    expect(matches?.length).toBe(1);
  });

  it("works with no note", () => {
    const result = appendEnv("", [{ key: "FOO", example: "bar" }]);
    expect(result).toContain("FOO=bar");
  });
});
