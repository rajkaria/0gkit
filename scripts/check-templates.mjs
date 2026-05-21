#!/usr/bin/env node
// Validates that every templates/ starter is a well-formed, degit-able
// project: required files present, package.json valid + named after its dir,
// and the `dev`/`start` script entry (if a file path) exists. Cheap CI gate —
// no network, no installs.
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../templates", import.meta.url).pathname;
const REQUIRED = ["README.md", "package.json", ".gitignore", ".env.example"];

const dirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());

let failed = 0;
for (const dir of dirs) {
  const base = join(root, dir);
  for (const f of REQUIRED) {
    if (!existsSync(join(base, f))) {
      console.error(`✗ ${dir}: missing ${f}`);
      failed++;
    }
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(base, "package.json"), "utf8"));
  } catch (err) {
    console.error(`✗ ${dir}: package.json is not valid JSON — ${err.message}`);
    failed++;
    continue;
  }
  if (pkg.name !== dir) {
    console.error(`✗ ${dir}: package.json name "${pkg.name}" != dir "${dir}"`);
    failed++;
  }
  // If the start/dev script's last token looks like a file path, it must exist.
  const cmd = pkg.scripts?.start ?? pkg.scripts?.dev ?? "";
  const last = cmd.split(/\s+/).pop() ?? "";
  if (last && /[./]/.test(last) && /\.(m?[jt]sx?)$/.test(last)) {
    if (!existsSync(join(base, last))) {
      console.error(`✗ ${dir}: script entry "${last}" not found`);
      failed++;
    }
  }
}

if (failed) {
  console.error(`\n${failed} template check(s) failed.`);
  process.exit(1);
}
console.log(`✓ ${dirs.length} template(s) OK`);
