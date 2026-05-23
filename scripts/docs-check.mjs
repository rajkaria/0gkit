#!/usr/bin/env node
// docs-check — verifies every ErrorCode referenced by a throw site in the
// 0gkit-* packages has a matching docs page under apps/docs/app/errors/<CODE>/,
// and vice versa.
//
// Pure Node ESM — no tsx, no TypeScript runtime. Imports the built
// `ERROR_CODES` enum from `packages/0gkit-core/dist/index.js` so we never
// have a separate source of truth.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PACKAGES_DIR = join(ROOT, "packages");
const DOCS_ERRORS_DIR = join(ROOT, "apps/docs/app/errors");

// Match `new ZeroGError(...)`, `new ConfigError(...)`, etc., capturing the
// first SCREAMING_SNAKE string literal that appears within the first 200
// characters of the arg list. Permissive enough to handle multi-line calls,
// strict enough to avoid matching unrelated strings.
const CODE_RE =
  /new\s+(?:ZeroGError|ConfigError|NetworkError|ChainError|AttestationError)\s*\(\s*[\s\S]{0,200}?"([A-Z][A-Z0-9_]+)"/g;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules" || ent === "dist" || ent === "__tests__") continue;
    const p = join(dir, ent);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) yield p;
  }
}

export function findReferencedCodes(roots) {
  const out = new Set();
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(src)) !== null) {
        out.add(m[1]);
      }
    }
  }
  return out;
}

export function findDocumentedCodes(errorsDir) {
  if (!existsSync(errorsDir)) return new Set();
  const out = new Set();
  for (const ent of readdirSync(errorsDir)) {
    if (ent.startsWith("[") || ent === "page.mdx" || ent === "layout.tsx") continue;
    const p = join(errorsDir, ent);
    if (statSync(p).isDirectory() && existsSync(join(p, "page.mdx"))) {
      out.add(ent);
    }
  }
  return out;
}

export function diffCodes({ referenced, documented, enumDefined }) {
  const missingPages = [...referenced].filter((c) => !documented.has(c)).sort();
  const orphanPages = [...documented].filter((c) => !enumDefined.has(c)).sort();
  const unusedInCode = [...enumDefined].filter((c) => !referenced.has(c)).sort();
  return {
    missingPages,
    orphanPages,
    unusedInCode,
    ok: missingPages.length === 0 && orphanPages.length === 0,
  };
}

// ---------------------------------------------------------------------------
// --exports mode: every public export of a published 0gkit package must have
// either a dedicated `<Symbol>.mdx` page or be named in the package's main
// `page.mdx`.
// ---------------------------------------------------------------------------

const SYMBOL_RE =
  /export\s+(?:declare\s+)?(?:class|function|const|let|var|type|interface|enum|namespace)\s+(\w+)/g;
const BLOCK_RE = /export\s*\{([^}]+)\}/g;

export function findPublicExports(dtsPath) {
  if (!existsSync(dtsPath)) return new Set();
  const src = readFileSync(dtsPath, "utf8");
  const out = new Set();
  let m;
  SYMBOL_RE.lastIndex = 0;
  while ((m = SYMBOL_RE.exec(src)) !== null) out.add(m[1]);
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(src)) !== null) {
    for (const item of m[1].split(",")) {
      const name = item
        .trim()
        .split(/\s+as\s+/i)
        .pop()
        ?.trim();
      if (name && name !== "default") out.add(name);
    }
  }
  return out;
}

export function assertExportsDocumented({ pkg, docsDir, exports, ignore }) {
  const page = join(docsDir, "page.mdx");
  const text = existsSync(page) ? readFileSync(page, "utf8") : "";
  const missing = [];
  for (const sym of exports) {
    if (ignore.has(sym)) continue;
    if (existsSync(join(docsDir, `${sym}.mdx`))) continue;
    if (text.includes(sym)) continue;
    missing.push(sym);
  }
  return { pkg, ok: missing.length === 0, missing };
}

function dirsUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((ent) => {
    const p = join(dir, ent);
    return statSync(p).isDirectory();
  });
}

/**
 * Resolve the docs directory for a package. Most package docs live at
 * `apps/docs/app/packages/<suffix>/` (e.g. `0gkit-storage` → `storage/`).
 * Newer packages use the full name (`0gkit-observability`). We try both.
 * Returns null if neither exists.
 */
export function resolveDocsDir({ root, pkg }) {
  const full = join(root, "apps/docs/app/packages", pkg);
  if (existsSync(full)) return full;
  const suffix = pkg.replace(/^0gkit-/, "");
  const stripped = join(root, "apps/docs/app/packages", suffix);
  if (existsSync(stripped)) return stripped;
  return null;
}

export async function checkExports({ root = ROOT } = {}) {
  const pkgs = dirsUnder(join(root, "packages")).filter((p) => p.startsWith("0gkit-"));
  const cfgPath = join(root, "apps/docs/.docs-check.json");
  const cfg = existsSync(cfgPath)
    ? JSON.parse(readFileSync(cfgPath, "utf8"))
    : { ignore: {}, skipPackages: [] };
  const skip = new Set(cfg.skipPackages ?? []);
  const results = [];
  let ok = true;
  for (const pkg of pkgs) {
    if (skip.has(pkg)) continue;
    const dts = join(root, "packages", pkg, "dist", "index.d.ts");
    if (!existsSync(dts)) continue;
    const exports = findPublicExports(dts);
    const docsDir = resolveDocsDir({ root, pkg });
    if (!docsDir) {
      results.push({ pkg, ok: false, missing: ["<no docs dir>"] });
      ok = false;
      continue;
    }
    const ignore = new Set(cfg.ignore?.[pkg] ?? []);
    const res = assertExportsDocumented({ pkg, docsDir, exports, ignore });
    if (!res.ok) ok = false;
    results.push(res);
  }
  return { ok, results };
}

async function runCodesCheck() {
  const { ERROR_CODES } = await import(join(ROOT, "packages/0gkit-core/dist/index.js"));
  const referenced = findReferencedCodes([PACKAGES_DIR]);
  const documented = findDocumentedCodes(DOCS_ERRORS_DIR);
  const enumDefined = new Set(ERROR_CODES);
  const result = diffCodes({ referenced, documented, enumDefined });

  if (result.missingPages.length > 0) {
    console.error(
      `✗ Missing docs page for thrown codes:\n  ${result.missingPages.join("\n  ")}`
    );
  }
  if (result.orphanPages.length > 0) {
    console.error(
      `✗ Orphan docs pages (no code in enum):\n  ${result.orphanPages.join("\n  ")}`
    );
  }
  if (result.unusedInCode.length > 0) {
    console.warn(
      `⚠ Codes defined in enum but never thrown:\n  ${result.unusedInCode.join("\n  ")}`
    );
  }
  if (result.ok) {
    console.log(
      `✓ docs:check codes passed — ${referenced.size} codes thrown, all documented`
    );
  }
  return result.ok;
}

async function runExportsCheck() {
  const { ok, results } = await checkExports();
  for (const r of results) {
    if (!r.ok) {
      console.error(`✗ ${r.pkg}: undocumented exports — ${r.missing.join(", ")}`);
    }
  }
  if (ok) {
    console.log(`✓ docs:check exports passed — ${results.length} packages`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// --versions mode: docs MDX and template READMEs must not pin a
// @foundryprotocol/0gkit-* version lower than the package's current
// package.json version. Equal-or-higher pins (and the literal `@latest` /
// no-version-at-all forms) always pass. Guards against drift after a release.
// ---------------------------------------------------------------------------

// Matches `@foundryprotocol/0gkit-<name>@<x.y.z>` with optional `^` / `~`.
// Captures: 1 = package short name (e.g. "core"), 2 = version (e.g. "1.0.2").
const VERSION_PIN_RE =
  /@foundryprotocol\/0gkit-([a-z][a-z0-9-]*)@[~^]?(\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)/gi;

function* walkText(dir, exts) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules" || ent === "dist" || ent === ".next") continue;
    const p = join(dir, ent);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkText(p, exts);
    else if (exts.some((e) => p.endsWith(e))) yield p;
  }
}

export function findVersionPins(roots) {
  const out = [];
  const exts = [".mdx", ".md"];
  for (const root of roots) {
    for (const file of walkText(root, exts)) {
      const src = readFileSync(file, "utf8");
      let m;
      VERSION_PIN_RE.lastIndex = 0;
      while ((m = VERSION_PIN_RE.exec(src)) !== null) {
        const before = src.lastIndexOf("\n", m.index) + 1;
        const lineNo = src.slice(0, before).split("\n").length;
        out.push({
          file,
          line: lineNo,
          pkg: `0gkit-${m[1]}`,
          version: m[2],
        });
      }
    }
  }
  return out;
}

export function readCurrentVersions(packagesDir) {
  const out = new Map();
  if (!existsSync(packagesDir)) return out;
  for (const ent of readdirSync(packagesDir)) {
    if (!ent.startsWith("0gkit-")) continue;
    const pkgJson = join(packagesDir, ent, "package.json");
    if (!existsSync(pkgJson)) continue;
    try {
      const { version } = JSON.parse(readFileSync(pkgJson, "utf8"));
      if (typeof version === "string") out.set(ent, version);
    } catch {
      // Skip unparseable package.json — covered by other CI gates.
    }
  }
  return out;
}

/** Numeric semver compare, ignoring pre-release suffix. Returns -1/0/1. */
export function semverCompare(a, b) {
  const parse = (v) => v.split("-")[0].split(".").map((n) => parseInt(n, 10));
  const [aa, ab, ac] = parse(a);
  const [ba, bb, bc] = parse(b);
  if (aa !== ba) return aa < ba ? -1 : 1;
  if (ab !== bb) return ab < bb ? -1 : 1;
  if (ac !== bc) return ac < bc ? -1 : 1;
  return 0;
}

export function diffVersions(pins, current) {
  const stale = [];
  for (const pin of pins) {
    const cur = current.get(pin.pkg);
    if (!cur) continue; // unknown package — ignore (e.g. test fixture).
    if (semverCompare(pin.version, cur) < 0) {
      stale.push({ ...pin, current: cur });
    }
  }
  return { stale, ok: stale.length === 0 };
}

async function runVersionsCheck() {
  const docsDir = join(ROOT, "apps/docs/app");
  const templatesDir = join(ROOT, "templates");
  const pins = findVersionPins([docsDir, templatesDir]);
  const current = readCurrentVersions(join(ROOT, "packages"));
  const result = diffVersions(pins, current);

  if (result.stale.length > 0) {
    console.error(
      `✗ docs:check versions — ${result.stale.length} stale pin(s) below current package.json:`
    );
    for (const s of result.stale) {
      const rel = s.file.startsWith(ROOT) ? s.file.slice(ROOT.length + 1) : s.file;
      console.error(
        `  ${rel}:${s.line} — @foundryprotocol/${s.pkg}@${s.version} (current ${s.current})`
      );
    }
    console.error(
      "  Use `@latest` or drop the version pin; let the npm registry be the source of truth."
    );
  } else {
    console.log(
      `✓ docs:check versions passed — ${pins.length} pin(s) checked across docs + templates`
    );
  }
  return result.ok;
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode === "--codes") {
    const ok = await runCodesCheck();
    process.exit(ok ? 0 : 1);
  }
  if (mode === "--exports") {
    const ok = await runExportsCheck();
    process.exit(ok ? 0 : 1);
  }
  if (mode === "--versions") {
    const ok = await runVersionsCheck();
    process.exit(ok ? 0 : 1);
  }
  // No flag → run all checks. Exit non-zero if any fails.
  const codesOk = await runCodesCheck();
  const exportsOk = await runExportsCheck();
  const versionsOk = await runVersionsCheck();
  if (!codesOk || !exportsOk || !versionsOk) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
