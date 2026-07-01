/**
 * Kit scaffolder — the pure file-generator behind `0g kits new <name>`.
 *
 * `buildKitScaffold()` takes validated metadata and returns the complete set of
 * files for a new kit (manifest + 3-tier skeleton), plus a docs-page stub and a
 * nav-entry line for the catalog. It performs NO IO — the command layer decides
 * where to write. Keeping generation pure makes the output unit-testable and
 * guarantees a scaffolded kit is registry-valid the moment it is created.
 *
 * The generated kit follows the same conventions the shipped catalog kits use
 * (see templates/_kits/agent-memory): a dependency-injected portable `lib` core
 * with zero @foundryprotocol/* imports (neutrality), per-base `adapters`, and an
 * optional React `ui` tier for React-capable bases.
 */

// KIT_DOMAINS / REACT_BASES mirror @foundryprotocol/0gkit-kits (manifest.ts,
// bases.ts). They are duplicated (not imported) so the CLI never statically
// pulls in the kits engine — the D39 cold-start constraint (see kits.ts).
export const KIT_DOMAINS = [
  "verifiable-ai",
  "agent-infra",
  "markets",
  "assets",
  "defi",
] as const;

export type KitDomain = (typeof KIT_DOMAINS)[number];

/** Bases the scaffolder knows how to lay down an adapter for. */
export const KNOWN_BASES = [
  "react-app",
  "chat",
  "mcp-agent",
  "storage-app",
  "tee-attested-api",
  "node",
] as const;

/** React-capable bases receive the `ui` tier (mirrors bases.ts REACT_BASES). */
const REACT_BASES = new Set(["react-app", "chat"]);

export interface KitScaffoldOptions {
  name: string;
  title: string;
  domain: string;
  summary: string;
  bases: string[];
}

export interface ScaffoldFile {
  /** Path relative to the kit directory (e.g. "kit.json", "lib/foo.ts"). */
  path: string;
  contents: string;
}

export interface KitScaffold {
  /** All kit files, relative to the kit directory. */
  files: ScaffoldFile[];
  /** Docs page stub — path is relative to the repo root. */
  docPage: ScaffoldFile;
  /** The nav.ts entry line to paste under the "Kits" section. */
  navLine: string;
  /** Whether a UI tier was generated (a React-capable base was requested). */
  hasUi: boolean;
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

/** `my-feature` → `MyFeature` */
export function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** `my-feature` → `myFeature` */
export function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `my-feature` → `My Feature` (used as a default title). */
export function toTitleCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Per-base adapter path convention (relative to the base project root). Mirrors
 * the shipped kits: mcp-agent tools live in src/tools, Next.js bases expose an
 * App-Router route, everything else gets a plain src/ module.
 */
export function adapterRelPath(base: string, name: string): string {
  if (base === "mcp-agent") return `src/tools/${name}.ts`;
  if (REACT_BASES.has(base)) return `app/api/${name}/route.ts`;
  return `src/${name}.ts`;
}

// ---------------------------------------------------------------------------
// buildKitScaffold
// ---------------------------------------------------------------------------

export function buildKitScaffold(opts: KitScaffoldOptions): KitScaffold {
  const { name, title, domain, summary, bases } = opts;
  const Pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  const hasUi = bases.some((b) => REACT_BASES.has(b));

  const files: ScaffoldFile[] = [];

  // --- lib tier -----------------------------------------------------------
  files.push({ path: `lib/${name}.ts`, contents: libSource(name, Pascal) });
  files.push({
    path: `lib/${name}.test.ts`,
    contents: libTestSource(name, Pascal),
  });

  // --- adapters tier ------------------------------------------------------
  const adapters: Record<string, string[]> = {};
  for (const b of bases) {
    const rel = adapterRelPath(b, name);
    adapters[b] = [rel];
    files.push({
      path: `adapters/${b}/${rel}`,
      contents: adapterSource(b, name, Pascal, camel),
    });
  }

  // --- ui tier ------------------------------------------------------------
  const ui: string[] = [];
  if (hasUi) {
    const panel = `components/${Pascal}Panel.tsx`;
    const hook = `hooks/use${Pascal}.ts`;
    ui.push(panel, hook);
    files.push({
      path: `ui/${panel}`,
      contents: uiPanelSource(name, Pascal),
    });
    files.push({ path: `ui/${hook}`, contents: uiHookSource(name, Pascal) });
  }

  // --- manifest -----------------------------------------------------------
  const manifest: Record<string, unknown> = {
    name,
    title,
    domain,
    summary,
    compatibleBases: bases,
    tiers: {
      lib: [`lib/${name}.ts`],
      adapters,
      ...(hasUi ? { ui } : {}),
    },
    requires: [],
    env: [],
    dependencies: {},
    devDependencies: {},
    composes: [],
    conflicts: [],
  };
  files.unshift({
    path: "kit.json",
    contents: JSON.stringify(manifest, null, 2) + "\n",
  });

  return {
    files,
    docPage: {
      path: `apps/docs/app/kits/${name}/page.mdx`,
      contents: docPageSource(name, title, summary, bases),
    },
    navLine: `      { title: ${JSON.stringify(title)}, href: "/kits/${name}" },`,
    hasUi,
  };
}

// ---------------------------------------------------------------------------
// File templates
// ---------------------------------------------------------------------------

function libSource(name: string, Pascal: string): string {
  return `/**
 * ${name} — portable core.
 *
 * This file is framework-agnostic. It must NOT import any 0gkit package
 * directly — every 0G primitive it needs is passed in through the
 * \`${Pascal}Deps\` interface and wired up by the per-base adapter (see
 * adapters/<base>/). That keeps this core unit-testable with mocks and portable
 * across every compatible base. This neutrality is enforced by \`pnpm kits:check\`.
 */

/** 0G primitives injected by the adapter. Replace with what your kit needs. */
export interface ${Pascal}Deps {
  /**
   * Example seam. Swap this for the real primitives your kit uses, e.g.
   * \`storage: Pick<Storage, "upload" | "download">\`. \`now\` is injected so the
   * core stays deterministic under test.
   */
  now?: () => number;
}

/** Input to the kit's core operation. */
export interface ${Pascal}Input {
  message: string;
}

/** Result returned by the kit's core operation. */
export interface ${Pascal}Result {
  ok: boolean;
  message: string;
  at: number;
}

/**
 * The kit's core operation. Replace the body with your real logic — this stub
 * echoes its input so the kit is runnable the moment it is applied.
 */
export async function run${Pascal}(
  deps: ${Pascal}Deps,
  input: ${Pascal}Input,
): Promise<${Pascal}Result> {
  const now = deps.now ?? Date.now;
  return { ok: true, message: input.message, at: now() };
}
`;
}

function libTestSource(name: string, Pascal: string): string {
  return `/**
 * Unit tests for the ${name} portable core.
 *
 * No network, no real 0gkit — dependencies are injected. Run with:
 *   npx vitest run templates/_kits/${name}/lib/${name}.test.ts
 */

import { describe, it, expect } from "vitest";
import { run${Pascal} } from "./${name}.js";

describe("${name} (lib core)", () => {
  it("runs with injected deps and no 0gkit package installed", async () => {
    const result = await run${Pascal}({ now: () => 0 }, { message: "hello" });
    expect(result.ok).toBe(true);
    expect(result.message).toBe("hello");
    expect(result.at).toBe(0);
  });
});
`;
}

function adapterSource(
  base: string,
  name: string,
  Pascal: string,
  camel: string
): string {
  const header = `/**
 * ${name} — ${base} adapter.
 *
 * Wires real 0G primitives into the portable lib (lib/${name}.ts). Adapters are
 * the ONLY tier allowed to import @foundryprotocol/0gkit-* packages. Construct
 * the primitives your kit needs and pass them into \`run${Pascal}\` as its deps.
 */
`;

  if (REACT_BASES.has(base)) {
    return `${header}
import { NextResponse } from "next/server";

import { run${Pascal}, type ${Pascal}Deps } from "../../../lib/${name}.js";

// TODO: construct the 0gkit primitives your kit needs (e.g. new Storage(...))
// and expose them here. See adapters/README or the docs for wiring examples.
const deps: ${Pascal}Deps = {};

export async function POST(req: Request): Promise<Response> {
  const input = (await req.json()) as { message: string };
  const result = await run${Pascal}(deps, input);
  return NextResponse.json(result);
}
`;
  }

  if (base === "mcp-agent") {
    return `${header}
import { run${Pascal}, type ${Pascal}Deps } from "../../lib/${name}.js";

// TODO: construct the 0gkit primitives your kit needs and expose them here.
const deps: ${Pascal}Deps = {};

/**
 * Register this kit's tool(s) on your MCP server. Adapt the shape to your
 * server's tool-registration API (see @foundryprotocol/0gkit-mcp).
 */
export async function ${camel}Handler(input: {
  message: string;
}): Promise<{ ok: boolean; message: string; at: number }> {
  return run${Pascal}(deps, input);
}
`;
  }

  // node / storage-app / tee-attested-api / other
  return `${header}
import { run${Pascal}, type ${Pascal}Deps } from "../lib/${name}.js";

// TODO: construct the 0gkit primitives your kit needs and expose them here.
const deps: ${Pascal}Deps = {};

/** Entry point for the ${base} base. Call this from your app. */
export async function ${camel}(input: {
  message: string;
}): Promise<{ ok: boolean; message: string; at: number }> {
  return run${Pascal}(deps, input);
}
`;
}

function uiPanelSource(name: string, Pascal: string): string {
  return `/**
 * ${name} — ${Pascal}Panel React component.
 *
 * Requires the react-app (or chat) adapter — POST /api/${name}. Import only from
 * the lib/hook layer, never from adapters.
 *
 * Usage:
 *   import { ${Pascal}Panel } from "@/components/${Pascal}Panel";
 *   <${Pascal}Panel />
 */

"use client";

import { useState, type FormEvent } from "react";
import { use${Pascal} } from "../hooks/use${Pascal}.js";

export function ${Pascal}Panel() {
  const { result, run, isLoading, error } = use${Pascal}();
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await run(message);
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something"
          aria-label="message"
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Running…" : "Run"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
`;
}

function uiHookSource(name: string, Pascal: string): string {
  return `/**
 * ${name} — React hook.
 *
 * Calls the /api/${name} route handler exposed by the react-app adapter.
 * Types are duplicated from the lib so the UI layer stays self-contained.
 */

"use client";

import { useState, useCallback } from "react";

export interface ${Pascal}Result {
  ok: boolean;
  message: string;
  at: number;
}

export interface Use${Pascal}Result {
  result: ${Pascal}Result | null;
  isLoading: boolean;
  error: string | null;
  run: (message: string) => Promise<void>;
}

export function use${Pascal}(): Use${Pascal}Result {
  const [result, setResult] = useState<${Pascal}Result | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (message: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/${name}", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(\`request failed: \${res.status}\`);
      setResult((await res.json()) as ${Pascal}Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, isLoading, error, run };
}
`;
}

function docPageSource(
  name: string,
  title: string,
  summary: string,
  bases: string[]
): string {
  const basesList = bases.map((b) => `\`${b}\``).join(", ");
  return `---
title: ${JSON.stringify(title)}
---

# ${title}

> ${summary}

## What it does

Describe the real behavior of the kit here, step by step. Only name exports that
actually exist — read the package source before documenting it.

## Compatible bases

${basesList}

## Apply

\`\`\`bash
# at scaffold time
npm create 0gkit-app -- --kits ${name}

# into an existing project
0g add ${name}
\`\`\`

## Environment variables

List every env var the kit reads (mirror \`kit.json\`'s \`env\`). None yet.

## Tiers

- **lib** — \`lib/${name}.ts\`: the portable, dependency-injected core.
- **adapters** — per-base wiring of the real 0gkit packages.
${bases.some((b) => b === "react-app" || b === "chat") ? "- **ui** — React component + hook.\n" : ""}
## Honesty note

State any caveats up front — attestation is a signed receipt (\"✓ signature
verified\", never \"TEE attested\"), network mode, and whether the kit executes or
only analyzes.
`;
}
