#!/usr/bin/env node
// bench-cli-coldstart — measures `0g --help` cold-start latency for
// @foundryprotocol/0gkit-cli. Runs the built `dist/cli.js` N times with a
// fresh Node process each iteration (no module cache reuse), computes
// p50/p95/max, writes a baseline JSON, and exits non-zero if the budget
// is exceeded.
//
// Usage:
//   node scripts/bench-cli-coldstart.mjs
//   node scripts/bench-cli-coldstart.mjs --iterations 8 --budget-ms 5000 --out bench/cli-coldstart.json

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");

function parseArgs(argv) {
  const out = {
    iterations: 8,
    warmup: 2,
    budgetMs: 5000,
    out: "bench/cli-coldstart.json",
    cli: "packages/0gkit-cli/dist/cli.js",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--iterations") out.iterations = parseInt(argv[++i], 10);
    else if (a === "--warmup") out.warmup = parseInt(argv[++i], 10);
    else if (a === "--budget-ms") out.budgetMs = parseInt(argv[++i], 10);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--cli") out.cli = argv[++i];
  }
  return out;
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

export function summarize(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    samples: samplesMs,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    min: sorted[0] ?? 0,
    mean:
      samplesMs.length === 0
        ? 0
        : samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length,
  };
}

function timeOne(cliPath) {
  const t0 = process.hrtime.bigint();
  const res = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1_000_000;
  if (res.status !== 0) {
    throw new Error(
      `0g --help exited ${res.status}; stderr:\n${res.stderr ?? ""}`
    );
  }
  return ms;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cliPath = resolve(ROOT, args.cli);

  // Warmup runs (filesystem + node binary caches) — discarded.
  for (let i = 0; i < args.warmup; i++) timeOne(cliPath);

  const samples = [];
  for (let i = 0; i < args.iterations; i++) {
    samples.push(timeOne(cliPath));
  }
  const stats = summarize(samples);
  const result = {
    command: "0g --help",
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    iterations: args.iterations,
    warmup: args.warmup,
    budgetMs: args.budgetMs,
    timestamp: new Date().toISOString(),
    ...stats,
    ok: stats.p95 <= args.budgetMs,
  };

  const outPath = resolve(ROOT, args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");

  const fmt = (n) => `${n.toFixed(0)}ms`;
  console.log(
    `0g --help cold-start — n=${args.iterations} ` +
      `p50=${fmt(stats.p50)} p95=${fmt(stats.p95)} max=${fmt(stats.max)} ` +
      `(budget ${args.budgetMs}ms, ${result.ok ? "OK" : "OVER"})`
  );
  console.log(`baseline written to ${args.out}`);

  if (!result.ok) {
    console.error(
      `✗ cold-start budget exceeded: p95 ${fmt(stats.p95)} > ${args.budgetMs}ms`
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
