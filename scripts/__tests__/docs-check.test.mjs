// Test the docs-check pure functions using Node's built-in test runner.
// Run via: `node --test scripts/__tests__/docs-check.test.mjs`
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  findReferencedCodes,
  findDocumentedCodes,
  diffCodes,
  findPublicExports,
  assertExportsDocumented,
} from "../docs-check.mjs";

function scratch() {
  return mkdtempSync(join(tmpdir(), "docs-check-"));
}

describe("findReferencedCodes", () => {
  it("extracts codes from ZeroGError() calls", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "a.ts"),
      `throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "msg", "hint");`
    );
    writeFileSync(
      join(dir, "b.ts"),
      `throw new ZeroGError(\n  "CHAIN_RPC_UNREACHABLE",\n  "msg",\n  "hint"\n);`
    );
    const found = findReferencedCodes([dir]);
    assert.deepEqual([...found].sort(), [
      "CHAIN_RPC_UNREACHABLE",
      "STORAGE_QUOTA_EXCEEDED",
    ]);
  });

  it("extracts codes from subclass constructors with explicit code arg", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "a.ts"),
      `throw new ConfigError("missing FOO", "set it", "CONFIG_MISSING_ENV");`
    );
    assert.ok(findReferencedCodes([dir]).has("CONFIG_MISSING_ENV"));
  });

  it("skips __tests__ and dist directories", () => {
    const dir = scratch();
    const tests = join(dir, "__tests__");
    mkdirSync(tests);
    writeFileSync(
      join(tests, "skipped.ts"),
      `throw new ZeroGError("STORAGE_QUOTA_EXCEEDED", "msg", "hint");`
    );
    assert.equal(findReferencedCodes([dir]).size, 0);
  });
});

describe("findDocumentedCodes", () => {
  it("lists directories under apps/docs/app/errors that contain page.mdx", () => {
    const dir = scratch();
    mkdirSync(join(dir, "STORAGE_QUOTA_EXCEEDED"));
    writeFileSync(join(dir, "STORAGE_QUOTA_EXCEEDED", "page.mdx"), "# title");
    mkdirSync(join(dir, "NO_PAGE"));
    assert.deepEqual([...findDocumentedCodes(dir)].sort(), ["STORAGE_QUOTA_EXCEEDED"]);
  });

  it("ignores [code] dynamic route directory and page.mdx at root", () => {
    const dir = scratch();
    mkdirSync(join(dir, "[code]"));
    writeFileSync(join(dir, "[code]", "page.mdx"), "# dyn");
    writeFileSync(join(dir, "page.mdx"), "# index");
    assert.equal(findDocumentedCodes(dir).size, 0);
  });

  it("returns empty set when the directory does not exist", () => {
    assert.equal(findDocumentedCodes("/no/such/path/anywhere").size, 0);
  });
});

describe("diffCodes", () => {
  it("flags codes thrown without a docs page", () => {
    const result = diffCodes({
      referenced: new Set(["A", "B"]),
      documented: new Set(["A"]),
      enumDefined: new Set(["A", "B", "C"]),
    });
    assert.deepEqual(result.missingPages, ["B"]);
    assert.deepEqual(result.orphanPages, []);
    assert.deepEqual(result.unusedInCode, ["C"]);
    assert.equal(result.ok, false);
  });

  it("flags orphan docs pages with no matching enum entry", () => {
    const result = diffCodes({
      referenced: new Set(["A"]),
      documented: new Set(["A", "B"]),
      enumDefined: new Set(["A"]),
    });
    assert.deepEqual(result.orphanPages, ["B"]);
    assert.equal(result.ok, false);
  });

  it("passes when references and docs agree", () => {
    const result = diffCodes({
      referenced: new Set(["A"]),
      documented: new Set(["A"]),
      enumDefined: new Set(["A"]),
    });
    assert.equal(result.ok, true);
  });
});

describe("findPublicExports", () => {
  it("walks a .d.ts and lists declared top-level exports", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "index.d.ts"),
      [
        "export declare class Storage { upload(): void }",
        "export declare function makeStorage(): Storage;",
        "export type StorageOpts = { foo: string };",
        "export interface StorageEvents { onUpload: () => void }",
        "export const VERSION: string;",
      ].join("\n")
    );
    const found = findPublicExports(join(dir, "index.d.ts"));
    assert.ok(found.has("Storage"));
    assert.ok(found.has("makeStorage"));
    assert.ok(found.has("StorageOpts"));
    assert.ok(found.has("StorageEvents"));
    assert.ok(found.has("VERSION"));
  });

  it("picks up `export { X, Y as Z }` re-export forms", () => {
    const dir = scratch();
    writeFileSync(
      join(dir, "index.d.ts"),
      `export { Helper, Other as Renamed } from "./helper.js";`
    );
    const found = findPublicExports(join(dir, "index.d.ts"));
    assert.ok(found.has("Helper"));
    assert.ok(found.has("Renamed"));
    assert.ok(!found.has("Other"));
  });

  it("returns an empty set when the .d.ts file does not exist", () => {
    assert.equal(findPublicExports("/no/such/file.d.ts").size, 0);
  });
});

describe("assertExportsDocumented", () => {
  it("passes when every export is mentioned in page.mdx", () => {
    const dir = scratch();
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage\n- makeStorage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "makeStorage"]),
      ignore: new Set(),
    });
    assert.equal(res.ok, true);
  });

  it("flags missing exports", () => {
    const dir = scratch();
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "makeStorage"]),
      ignore: new Set(),
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.missing, ["makeStorage"]);
  });

  it("treats a dedicated <Symbol>.mdx file as documentation", () => {
    const dir = scratch();
    writeFileSync(join(dir, "page.mdx"), "## API");
    writeFileSync(join(dir, "makeStorage.mdx"), "# makeStorage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["makeStorage"]),
      ignore: new Set(),
    });
    assert.equal(res.ok, true);
  });

  it("respects the ignore set for known utility re-exports", () => {
    const dir = scratch();
    writeFileSync(join(dir, "page.mdx"), "## API\n\n- Storage");
    const res = assertExportsDocumented({
      pkg: "0gkit-storage",
      docsDir: dir,
      exports: new Set(["Storage", "InternalType"]),
      ignore: new Set(["InternalType"]),
    });
    assert.equal(res.ok, true);
  });

  it("returns ok=false with all missing exports listed", () => {
    const dir = scratch();
    writeFileSync(join(dir, "page.mdx"), "");
    const res = assertExportsDocumented({
      pkg: "0gkit-x",
      docsDir: dir,
      exports: new Set(["A", "B", "C"]),
      ignore: new Set(),
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.missing.sort(), ["A", "B", "C"]);
  });
});
