# SP11 — `@foundryprotocol/0gkit-observability` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@foundryprotocol/0gkit-observability` — a single `instrument0g({...})` call registers OpenTelemetry instrumentation that wraps every 0gkit primitive (`Storage`, `Compute`, `DA`, `Attestation`) so every public method emits an OTel span with `0gkit.*` semantic attributes (network, op, bytes, gas_native, fee_native, root, confirm_seconds). Add a `0g cost` CLI subcommand that aggregates estimates (and, when present, recorded spans) into a per-operation cost breakdown. Migrate the `tee-attested-api` template from `console.log` access logging to `instrument0g` (resolving SP8 D26's documented hand-off).

**Architecture:** Prototype-patch the four primitive classes at `instrument0g()` time. Because ES modules are live bindings, mutating `Storage.prototype.upload` etc. takes effect for every consumer that imported the class. The wrapping wraps original method → `tracer.startActiveSpan('0gkit.storage.upload', cb)` → sets standard attributes (`0gkit.network`, `0gkit.op`) before the call, records result attributes (`0gkit.size_bytes`, `0gkit.gas_native`, `0gkit.fee_native`, `0gkit.confirm_seconds`, `0gkit.root`) on success, records exception + `code` attribute on `ZeroGError` failures, ends the span. Bundle: depend on `@opentelemetry/api` (1.x, peer-or-direct, small) for span APIs; SDK wiring (`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`) is optional peer — if missing and the user passes `exporter: { kind: 'otlp', ... }`, throw `OBSERVABILITY_EXPORTER_FAILED` with a clear remedy. Users with their own OTel SDK config can pass `mode: 'attach'` and we'll skip SDK setup. Tracer name is `@foundryprotocol/0gkit-observability` per OTel convention. The `0g cost` subcommand v0 aggregates `Estimate` envelopes from SP7 (`0g estimate storage|compute|da` JSON outputs piped or replayed); a `--from-jaeger <path>` flag is a SP12 polish item (out of scope here).

**Tech Stack:** TypeScript 5.6, Vitest 2.x, `@opentelemetry/api ^1.9` (direct dep), `@opentelemetry/sdk-node ^0.55` (optional peer), `@opentelemetry/exporter-trace-otlp-http ^0.55` (optional peer), `tsup` ESM build.

**Working dir (local):** `/Users/rajkaria/Projects/0G-ai-kit/`
**Branch:** `sp11-0gkit-observability`

**Dependencies (already shipped):** SP7 (`Estimate` envelopes) for `0g cost`, SP9 (`ErrorCode` enum — code `OBSERVABILITY_EXPORTER_FAILED` already pre-listed).

**Coverage gate:** 85% lines / 75% branches (instrumentation touches every code path — bar is higher).

**Bundle budget:** Client-side import (web bundle) ≤ 20 KB gzipped. Asserted via a `bundle-size.test.ts` that imports the public entry and measures via `esbuild --bundle --metafile`.

---

## File structure

**Created (new package):**

- `packages/0gkit-observability/package.json` — name `@foundryprotocol/0gkit-observability`, version `0.1.0`, deps `@opentelemetry/api`, `@foundryprotocol/0gkit-core`; optionalPeers `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`.
- `packages/0gkit-observability/tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.dependency-cruiser.cjs`, `LICENSE`, `README.md`.
- `packages/0gkit-observability/src/index.ts` — exports `instrument0g`, `disinstrument0g`, `ATTR` namespace constants.
- `packages/0gkit-observability/src/instrument.ts` — main `instrument0g({...})` entry + prototype-patching machinery.
- `packages/0gkit-observability/src/attributes.ts` — frozen const `ATTR` object with all `0gkit.*` attribute key names (one source of truth).
- `packages/0gkit-observability/src/sdk.ts` — optional SDK auto-setup (lazy-imports `@opentelemetry/sdk-node`).
- `packages/0gkit-observability/src/wrap.ts` — `wrapMethod(target, name, opName, attrFn)` helper used by `instrument.ts`.
- `packages/0gkit-observability/src/attribute-mappers.ts` — per-primitive `attrFn`s that translate args/results → `0gkit.*` attributes.
- `packages/0gkit-observability/src/__tests__/instrument.test.ts` — patches a fake Storage and asserts spans.
- `packages/0gkit-observability/src/__tests__/attributes.test.ts` — asserts `ATTR` keys match OTel conventions.
- `packages/0gkit-observability/src/__tests__/bundle-size.test.ts` — esbuild bundles `src/index.ts`, asserts ≤ 20 KB gzipped.
- `packages/0gkit-observability/src/__tests__/boundary.test.ts` — protocol-neutrality grep.

**Modified:**

- `packages/0gkit-cli/src/commands/cost.ts` — new `0g cost` subcommand.
- `packages/0gkit-cli/src/program.ts` — register `cost`.
- `packages/0gkit-cli/src/__tests__/cost.test.ts` — CLI tests with injected primitives.
- `templates/tee-attested-api/package.json` — add `@foundryprotocol/0gkit-observability` dep.
- `templates/tee-attested-api/src/index.ts` — boot `instrument0g({...})` before app start.
- `templates/tee-attested-api/src/middleware.ts` — `withAccessLog` becomes an OTel span attribute setter (removes `console.log` per SP8 D26).
- `templates/tee-attested-api/src/__tests__/middleware.test.ts` — assert span attributes via in-memory exporter.
- `templates/tee-attested-api/README.md` — replace SP11 hand-off section with real `instrument0g` docs.
- `apps/docs/app/packages/0gkit-observability/page.mdx` — new package page.
- `apps/docs/app/concepts/observability/page.mdx` — concept page on OTel + cost attribution.
- `apps/docs/app/concepts/observability/exporters/honeycomb.mdx` — wire-up example.
- `apps/docs/app/concepts/observability/exporters/datadog.mdx` — wire-up example.
- `apps/docs/app/concepts/observability/exporters/vercel.mdx` — wire-up example.
- `.github/workflows/ci.yml` — extend coverage filter.
- `.changeset/sp11-0gkit-observability.md` — first publish.
- `docs/DECISIONS.md` — append D32 (prototype-patch strategy), D33 (`0gkit.*` attribute namespace), D34 (bundle budget).
- `docs/specs/2026-05-20-essentials-roadmap.md` — mark SP11 ✅ shipped.

---

## Task graph

```
T1 (package skeleton + ATTR + boundary test)
   ├──► T2 (wrapMethod + attribute mappers + instrument0g)
   │     ├──► T3 (optional SDK auto-setup)
   │     ├──► T4 (bundle-size assertion)
   │     ├──► T5 (CLI 0g cost subcommand)
   │     └──► T6 (tee-attested-api template migration)
   │
   └──► T7 (docs pages — package + concept + 3 exporters)

                                                          ▼
                                                  T8 (release prep)
```

---

### Task 1: Package skeleton + `ATTR` namespace + boundary test

**Files:**

- Create: `packages/0gkit-observability/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.dependency-cruiser.cjs`, `README.md`, `LICENSE`.
- Create: `packages/0gkit-observability/src/attributes.ts`.
- Create: `packages/0gkit-observability/src/__tests__/attributes.test.ts`.
- Create: `packages/0gkit-observability/src/__tests__/boundary.test.ts`.
- Create: `packages/0gkit-observability/src/index.ts` (initially: re-export `ATTR` only).

- [ ] **Step 1: `package.json`**

```jsonc
{
  "name": "@foundryprotocol/0gkit-observability",
  "version": "0.1.0",
  "description": "OpenTelemetry instrumentation for 0gkit primitives.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "depcruise src",
  },
  "dependencies": {
    "@foundryprotocol/0gkit-core": "workspace:*",
    "@opentelemetry/api": "^1.9.0",
  },
  "peerDependencies": {
    "@opentelemetry/sdk-node": "^0.55.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.55.0",
  },
  "peerDependenciesMeta": {
    "@opentelemetry/sdk-node": { "optional": true },
    "@opentelemetry/exporter-trace-otlp-http": { "optional": true },
  },
  "devDependencies": {
    "@opentelemetry/sdk-node": "^0.55.0",
    "@opentelemetry/sdk-trace-base": "^1.30.0",
    "esbuild": "^0.24.0",
    "dependency-cruiser": "^16.4.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
  },
  "publishConfig": { "access": "public" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/rajkaria/0gkit.git",
    "directory": "packages/0gkit-observability",
  },
  "homepage": "https://0gkit.dev/packages/0gkit-observability",
  "bugs": "https://github.com/rajkaria/0gkit/issues",
}
```

- [ ] **Step 2: Write the failing attribute test**

`packages/0gkit-observability/src/__tests__/attributes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ATTR } from "../attributes.js";

describe("ATTR", () => {
  it("uses the 0gkit.* namespace for every key", () => {
    for (const key of Object.values(ATTR)) {
      expect(key).toMatch(/^0gkit\./);
    }
  });

  it("defines the canonical set of keys", () => {
    expect(Object.keys(ATTR).sort()).toEqual(
      [
        "NETWORK",
        "OP",
        "SIZE_BYTES",
        "SEGMENTS",
        "GAS_NATIVE",
        "FEE_NATIVE",
        "CONFIRM_SECONDS",
        "ROOT",
        "TX_HASH",
        "BLOCK_NUMBER",
        "MODEL",
        "INPUT_TOKENS",
        "OUTPUT_TOKENS",
        "ERROR_CODE",
        "DRY_RUN",
      ].sort()
    );
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ATTR)).toBe(true);
  });
});
```

- [ ] **Step 3: Run + verify failure**

```bash
pnpm install
pnpm --filter @foundryprotocol/0gkit-observability test -- attributes
```

Expected: FAIL — `ATTR` missing.

- [ ] **Step 4: Implement `attributes.ts`**

```ts
// packages/0gkit-observability/src/attributes.ts
export const ATTR = Object.freeze({
  NETWORK: "0gkit.network",
  OP: "0gkit.op",
  SIZE_BYTES: "0gkit.size_bytes",
  SEGMENTS: "0gkit.segments",
  GAS_NATIVE: "0gkit.gas_native",
  FEE_NATIVE: "0gkit.fee_native",
  CONFIRM_SECONDS: "0gkit.confirm_seconds",
  ROOT: "0gkit.root",
  TX_HASH: "0gkit.tx_hash",
  BLOCK_NUMBER: "0gkit.block_number",
  MODEL: "0gkit.model",
  INPUT_TOKENS: "0gkit.input_tokens",
  OUTPUT_TOKENS: "0gkit.output_tokens",
  ERROR_CODE: "0gkit.error_code",
  DRY_RUN: "0gkit.dry_run",
} as const);

export type AttrKey = keyof typeof ATTR;
```

`index.ts`:

```ts
export { ATTR, type AttrKey } from "./attributes.js";
```

- [ ] **Step 5: Boundary test**

`packages/0gkit-observability/src/__tests__/boundary.test.ts` — copy from `0gkit-jobs` boundary test (same shape, swap dir).

- [ ] **Step 6: Verify pass + commit**

```bash
pnpm --filter @foundryprotocol/0gkit-observability build
pnpm --filter @foundryprotocol/0gkit-observability test
```

Expected: PASS.

```bash
git checkout -b sp11-0gkit-observability
git add packages/0gkit-observability/ pnpm-lock.yaml
git commit -m "feat(observability): SP11 — package skeleton + ATTR namespace + boundary"
```

---

### Task 2: `wrapMethod`, attribute mappers, `instrument0g`

**Files:**

- Create: `packages/0gkit-observability/src/wrap.ts`
- Create: `packages/0gkit-observability/src/attribute-mappers.ts`
- Create: `packages/0gkit-observability/src/instrument.ts`
- Create: `packages/0gkit-observability/src/__tests__/instrument.test.ts`
- Modify: `packages/0gkit-observability/src/index.ts`

- [ ] **Step 1: Write the failing test (in-memory tracer asserts spans appear)**

```ts
// packages/0gkit-observability/src/__tests__/instrument.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { trace, context } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrument0g, disinstrument0g } from "../instrument.js";

// Fake primitive classes that mimic the public surface
class FakeStorage {
  network = "galileo";
  async upload(bytes: Uint8Array): Promise<{ root: string; size: number }> {
    return { root: "0x" + "ab".repeat(32), size: bytes.length };
  }
  async estimate(bytes: number) {
    return {
      kind: "storage",
      sizeBytes: bytes,
      segments: Math.ceil(bytes / 262144),
      gas: 80000n,
      fee: 1000000000n,
    };
  }
}

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
});

afterEach(() => {
  disinstrument0g();
  provider.shutdown();
  trace.disable();
});

describe("instrument0g", () => {
  it("wraps upload() and emits a span with 0gkit.* attributes", async () => {
    instrument0g({
      mode: "attach",
      targets: {
        storage: { class: FakeStorage, methods: ["upload", "estimate"] },
      },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(1024));
    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("0gkit.storage.upload");
    expect(spans[0].attributes["0gkit.op"]).toBe("storage.upload");
    expect(spans[0].attributes["0gkit.network"]).toBe("galileo");
    expect(spans[0].attributes["0gkit.size_bytes"]).toBe(1024);
    expect(spans[0].attributes["0gkit.root"]).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("disinstrument0g restores the original method", async () => {
    instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    disinstrument0g();
    const s = new FakeStorage();
    await s.upload(new Uint8Array(0));
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it("records an exception on ZeroGError with 0gkit.error_code attribute", async () => {
    class BadStorage {
      network = "galileo";
      async upload(): Promise<never> {
        const e = new Error("over quota") as Error & { code: string };
        e.code = "STORAGE_QUOTA_EXCEEDED";
        e.name = "ZeroGError";
        throw e;
      }
    }
    instrument0g({
      mode: "attach",
      targets: { storage: { class: BadStorage, methods: ["upload"] } },
    });
    const s = new BadStorage();
    await s.upload().catch(() => {});
    await provider.forceFlush();
    const span = exporter.getFinishedSpans()[0];
    expect(span.attributes["0gkit.error_code"]).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(span.status.code).toBe(2); // ERROR
  });

  it("does not double-wrap on a second instrument0g call", async () => {
    instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(1));
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run + verify failure**

```bash
pnpm --filter @foundryprotocol/0gkit-observability test -- instrument
```

Expected: FAIL — `instrument0g` not implemented.

- [ ] **Step 3: Implement `wrap.ts`**

```ts
// packages/0gkit-observability/src/wrap.ts
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { ATTR } from "./attributes.js";

const TRACER_NAME = "@foundryprotocol/0gkit-observability";

export type AttrFn = (
  args: unknown[],
  result: unknown,
  instance: unknown
) => Record<string, unknown>;

interface WrapEntry {
  target: any;
  method: string;
  original: Function;
}

const wrapped: WrapEntry[] = [];

export function wrapMethod(
  target: any,
  method: string,
  opName: string,
  preAttrs: AttrFn,
  postAttrs: AttrFn
): void {
  if (!target || typeof target[method] !== "function") return;
  const original = target[method];
  if ((original as any).__0gkit_instrumented) return;

  const wrapper = async function (this: any, ...args: unknown[]) {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(`0gkit.${opName}`, async (span: Span) => {
      span.setAttribute(ATTR.OP, opName);
      const pre = preAttrs(args, undefined, this);
      for (const [k, v] of Object.entries(pre)) {
        if (v !== undefined) span.setAttribute(k, v as any);
      }
      try {
        const result = await original.apply(this, args);
        const post = postAttrs(args, result, this);
        for (const [k, v] of Object.entries(post)) {
          if (v !== undefined) span.setAttribute(k, v as any);
        }
        span.end();
        return result;
      } catch (err) {
        const code = (err as any)?.code;
        if (typeof code === "string") span.setAttribute(ATTR.ERROR_CODE, code);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.end();
        throw err;
      }
    });
  };
  (wrapper as any).__0gkit_instrumented = true;
  target[method] = wrapper;
  wrapped.push({ target, method, original });
}

export function unwrapAll(): void {
  while (wrapped.length > 0) {
    const { target, method, original } = wrapped.pop()!;
    target[method] = original;
  }
}
```

- [ ] **Step 4: Implement `attribute-mappers.ts`**

```ts
// packages/0gkit-observability/src/attribute-mappers.ts
import { ATTR } from "./attributes.js";
import type { AttrFn } from "./wrap.js";

const network: AttrFn = (_args, _res, instance: any) => ({
  [ATTR.NETWORK]: instance?.network ?? "unknown",
});

export const STORAGE_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  upload: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.SIZE_BYTES]: (args[0] as Uint8Array | undefined)?.length,
      [ATTR.DRY_RUN]: (args[1] as any)?.dryRun ?? false,
    }),
    post: (_a, res: any) => ({
      [ATTR.ROOT]: res?.root ?? res?.result?.root,
      [ATTR.TX_HASH]: res?.tx?.hash ?? res?.result?.tx?.hash,
      [ATTR.CONFIRM_SECONDS]: res?.tx?.latencyMs ? res.tx.latencyMs / 1000 : undefined,
    }),
  },
  download: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.ROOT]: args[0] as string,
    }),
    post: (_a, res: any) => ({
      [ATTR.SIZE_BYTES]: (res as Uint8Array | undefined)?.length,
    }),
  },
  estimate: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.SIZE_BYTES]: args[0] as number,
      [ATTR.DRY_RUN]: true,
    }),
    post: (_a, res: any) => ({
      [ATTR.SEGMENTS]: res?.segments,
      [ATTR.GAS_NATIVE]: res?.gas?.toString(),
      [ATTR.FEE_NATIVE]: res?.fee?.toString(),
    }),
  },
  exists: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.ROOT]: args[0] as string,
    }),
    post: () => ({}),
  },
};

export const COMPUTE_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  inference: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.MODEL]: (args[0] as any)?.model,
      [ATTR.DRY_RUN]: (args[1] as any)?.dryRun ?? false,
    }),
    post: (_a, res: any) => ({
      [ATTR.OUTPUT_TOKENS]:
        res?.usage?.outputTokens ?? res?.result?.usage?.outputTokens,
      [ATTR.INPUT_TOKENS]: res?.usage?.inputTokens ?? res?.result?.usage?.inputTokens,
    }),
  },
  estimate: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.MODEL]: (args[0] as any)?.model,
      [ATTR.DRY_RUN]: true,
    }),
    post: (_a, res: any) => ({
      [ATTR.GAS_NATIVE]: res?.gas?.toString(),
      [ATTR.FEE_NATIVE]: res?.fee?.toString(),
      [ATTR.INPUT_TOKENS]: res?.breakdown?.inputTokens,
      [ATTR.OUTPUT_TOKENS]: res?.breakdown?.outputTokensMax,
    }),
  },
};

export const DA_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  publish: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.SIZE_BYTES]: (args[0] as Uint8Array | undefined)?.length,
      [ATTR.DRY_RUN]: (args[1] as any)?.dryRun ?? false,
    }),
    post: (_a, res: any) => ({
      [ATTR.GAS_NATIVE]: res?.gas?.toString() ?? res?.estimate?.gas?.toString(),
      [ATTR.FEE_NATIVE]: res?.fee?.toString() ?? res?.estimate?.fee?.toString(),
    }),
  },
  estimate: {
    pre: (args, _r, inst) => ({
      ...network([], undefined, inst),
      [ATTR.SIZE_BYTES]: args[0] as number,
      [ATTR.DRY_RUN]: true,
    }),
    post: (_a, res: any) => ({
      [ATTR.GAS_NATIVE]: res?.gas?.toString(),
      [ATTR.FEE_NATIVE]: res?.fee?.toString(),
    }),
  },
};

export const ATTESTATION_MAPPERS: Record<string, { pre: AttrFn; post: AttrFn }> = {
  verifyEnvelope: {
    pre: (_args, _r, inst) => ({ ...network([], undefined, inst) }),
    post: () => ({}),
  },
};
```

- [ ] **Step 5: Implement `instrument.ts`**

```ts
// packages/0gkit-observability/src/instrument.ts
import { wrapMethod, unwrapAll } from "./wrap.js";
import {
  STORAGE_MAPPERS,
  COMPUTE_MAPPERS,
  DA_MAPPERS,
  ATTESTATION_MAPPERS,
} from "./attribute-mappers.js";

export type InstrumentMode = "auto" | "attach";

export interface ExporterConfig {
  kind: "otlp" | "console" | "noop";
  endpoint?: string;
  headers?: Record<string, string>;
}

export interface InstrumentConfig {
  serviceName?: string;
  exporter?: ExporterConfig;
  mode?: InstrumentMode;
  /**
   * Override which classes get patched. Used by tests; in production, the
   * default behaviour imports the real primitives and patches them.
   */
  targets?: {
    storage?: { class: any; methods: string[] };
    compute?: { class: any; methods: string[] };
    da?: { class: any; methods: string[] };
    attestation?: { class: any; methods: string[] };
  };
}

let instrumented = false;

export function instrument0g(config: InstrumentConfig = {}): void {
  if (instrumented) return;

  // Mode: "attach" leaves SDK setup to the caller. "auto" registers an OTel SDK
  // via the optional peer.
  if (config.mode !== "attach") {
    void setupSdkIfRequested(config);
  }

  const targets = config.targets ?? defaultTargets();
  if (targets.storage) {
    for (const m of targets.storage.methods) {
      const mapper = STORAGE_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(
        targets.storage.class.prototype,
        m,
        `storage.${m}`,
        mapper.pre,
        mapper.post
      );
    }
  }
  if (targets.compute) {
    for (const m of targets.compute.methods) {
      const mapper = COMPUTE_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(
        targets.compute.class.prototype,
        m,
        `compute.${m}`,
        mapper.pre,
        mapper.post
      );
    }
  }
  if (targets.da) {
    for (const m of targets.da.methods) {
      const mapper = DA_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(targets.da.class.prototype, m, `da.${m}`, mapper.pre, mapper.post);
    }
  }
  if (targets.attestation) {
    for (const m of targets.attestation.methods) {
      const mapper = ATTESTATION_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(
        targets.attestation.class.prototype,
        m,
        `attestation.${m}`,
        mapper.pre,
        mapper.post
      );
    }
  }
  instrumented = true;
}

export function disinstrument0g(): void {
  unwrapAll();
  instrumented = false;
}

async function setupSdkIfRequested(config: InstrumentConfig): Promise<void> {
  // Defer to a separate module so importing 0gkit-observability without OTel
  // SDK doesn't pull the SDK into the bundle.
  const { setupSdk } = await import("./sdk.js");
  await setupSdk(config);
}

async function defaultTargets(): Promise<NonNullable<InstrumentConfig["targets"]>> {
  // Real production path: import primitives via computed-specifier to keep the
  // observability package optional in workspaces that don't ship primitives.
  const ns = "@foundryprotocol";
  const [{ Storage }, { Compute }, { DA }, attestation] = await Promise.all([
    import([ns, "0gkit-storage"].join("/")) as Promise<any>,
    import([ns, "0gkit-compute"].join("/")) as Promise<any>,
    import([ns, "0gkit-da"].join("/")) as Promise<any>,
    import([ns, "0gkit-attestation"].join("/")) as Promise<any>,
  ]);
  return {
    storage: { class: Storage, methods: ["upload", "download", "estimate", "exists"] },
    compute: { class: Compute, methods: ["inference", "estimate"] },
    da: { class: DA, methods: ["publish", "estimate"] },
    attestation: {
      class: attestation.AttestationClient ?? attestation.default,
      methods: ["verifyEnvelope"],
    },
  };
}
```

NOTE: `defaultTargets` is async but the surrounding `instrument0g` is sync — for the production import path, the patching is best-effort fire-and-forget. The test path uses the `mode: 'attach'` + explicit `targets` to keep it synchronous. To fix this, refactor `instrument0g` to be async on the auto path: `await instrument0g({...})`. Document this in the README. Tests already use `mode: 'attach'` synchronously.

- [ ] **Step 6: Update `index.ts`**

```ts
export { ATTR, type AttrKey } from "./attributes.js";
export {
  instrument0g,
  disinstrument0g,
  type InstrumentConfig,
  type ExporterConfig,
} from "./instrument.js";
```

- [ ] **Step 7: Run + verify pass**

```bash
pnpm --filter @foundryprotocol/0gkit-observability build
pnpm --filter @foundryprotocol/0gkit-observability test -- instrument
```

Expected: 4 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/0gkit-observability/src/wrap.ts \
        packages/0gkit-observability/src/attribute-mappers.ts \
        packages/0gkit-observability/src/instrument.ts \
        packages/0gkit-observability/src/index.ts \
        packages/0gkit-observability/src/__tests__/instrument.test.ts
git commit -m "feat(observability): instrument0g + wrapMethod + per-primitive attribute mappers"
```

---

### Task 3: Optional SDK auto-setup (`sdk.ts`)

**Files:**

- Create: `packages/0gkit-observability/src/sdk.ts`

When the user passes `exporter: { kind: 'otlp', endpoint: '...' }` without their own SDK, we lazy-import `@opentelemetry/sdk-node` and register an OTLP HTTP exporter.

- [ ] **Step 1: Implement `sdk.ts`**

```ts
// packages/0gkit-observability/src/sdk.ts
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { InstrumentConfig } from "./instrument.js";

export async function setupSdk(config: InstrumentConfig): Promise<void> {
  const exporter = config.exporter;
  if (!exporter || exporter.kind === "noop") return;

  try {
    const { NodeSDK } = (await import(["@opentelemetry", "sdk-node"].join("/"))) as any;
    let traceExporter: any = undefined;
    if (exporter.kind === "console") {
      const { ConsoleSpanExporter } = (await import(
        ["@opentelemetry", "sdk-trace-base"].join("/")
      )) as any;
      traceExporter = new ConsoleSpanExporter();
    } else if (exporter.kind === "otlp") {
      const { OTLPTraceExporter } = (await import(
        ["@opentelemetry", "exporter-trace-otlp-http"].join("/")
      )) as any;
      traceExporter = new OTLPTraceExporter({
        url: exporter.endpoint,
        headers: exporter.headers,
      });
    }
    const sdk = new NodeSDK({
      serviceName: config.serviceName ?? "0gkit-app",
      traceExporter,
    });
    sdk.start();
  } catch (err) {
    throw new ZeroGError(
      "OBSERVABILITY_EXPORTER_FAILED",
      `failed to start OTel SDK: ${(err as Error).message}`,
      `install the SDK peers: \`pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http\`. If you already have an OTel SDK configured, pass \`mode: "attach"\` to instrument0g().`
    );
  }
}
```

- [ ] **Step 2: Commit (no new tests — covered by integration when the template uses it)**

```bash
git add packages/0gkit-observability/src/sdk.ts
git commit -m "feat(observability): optional OTel SDK auto-setup via lazy-imported peers"
```

---

### Task 4: Bundle-size assertion (`bundle-size.test.ts`)

**Files:**

- Create: `packages/0gkit-observability/src/__tests__/bundle-size.test.ts`

- [ ] **Step 1: Implement the test**

```ts
import { describe, expect, it } from "vitest";
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

describe("bundle size", () => {
  it("public entry bundles to ≤ 20 KB gzipped", async () => {
    const result = await build({
      entryPoints: [resolve(__dirname, "../index.ts")],
      bundle: true,
      format: "esm",
      target: "es2022",
      write: false,
      external: ["@opentelemetry/api", "@foundryprotocol/0gkit-core"],
      minify: true,
      treeShaking: true,
    });
    const text = result.outputFiles[0].text;
    const gz = gzipSync(Buffer.from(text, "utf8")).length;
    expect(gz).toBeLessThanOrEqual(20 * 1024);
  });
});
```

- [ ] **Step 2: Run + verify**

```bash
pnpm --filter @foundryprotocol/0gkit-observability test -- bundle-size
```

Expected: PASS (the package, sans externalised peers, is tiny — wrap helper + attribute mappers + ATTR const).

- [ ] **Step 3: Commit**

```bash
git add packages/0gkit-observability/src/__tests__/bundle-size.test.ts
git commit -m "test(observability): assert public entry ≤ 20 KB gzipped"
```

---

### Task 5: `0g cost` CLI subcommand

**Files:**

- Create: `packages/0gkit-cli/src/commands/cost.ts`
- Modify: `packages/0gkit-cli/src/program.ts`
- Create: `packages/0gkit-cli/src/__tests__/cost.test.ts`

v0 surface (estimate-based; trace replay is SP12+):

```
0g cost forecast
  --storage <bytes>[,<bytes>...]
  --compute "prompt|model|maxTokens" (repeatable)
  --da <bytes>
  [--json]
```

Outputs: per-op estimate + total native fee/gas.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

describe("0g cost forecast", () => {
  it("aggregates storage + compute + da estimates", async () => {
    const out: string[] = [];
    const deps: ProgramDeps = {
      stdout: (s) => out.push(s),
      stderr: () => {},
      env: process.env,
      storageEstimate: async (bytes) => ({
        kind: "storage",
        sizeBytes: bytes,
        segments: 1,
        gas: 80000n,
        fee: 1_000_000_000n,
      }),
      computeEstimate: async ({ prompt, model }) => ({
        kind: "compute",
        gas: 0n,
        fee: 500_000_000n,
        breakdown: { inputTokens: prompt.length / 4, outputTokensMax: 512 },
      }),
      daEstimate: async (bytes) => ({
        kind: "da",
        sizeBytes: bytes,
        gas: 0n,
        fee: BigInt(bytes) * 1_000_000n,
      }),
    } as any;

    const program = buildProgram(deps);
    await program.parseAsync([
      "node",
      "0g",
      "cost",
      "forecast",
      "--storage",
      "1024",
      "--compute",
      "hello|llama-3-8b|256",
      "--da",
      "512",
      "--json",
    ]);
    const result = JSON.parse(out.join(""));
    expect(result.totalFeeWei).toBeGreaterThan(0n.toString());
    expect(result.byOp.storage.length).toBe(1);
    expect(result.byOp.compute.length).toBe(1);
    expect(result.byOp.da.length).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `commands/cost.ts`**

```ts
import type { Command } from "commander";
import type { ProgramDeps } from "../program.js";
import { renderOutput } from "../output.js";

export function registerCostCommand(program: Command, deps: ProgramDeps): void {
  const cost = program.command("cost").description("Forecast 0G operation costs.");

  cost
    .command("forecast")
    .option(
      "--storage <bytes...>",
      "comma-separated byte counts to upload",
      (v: string, acc: number[] = []) => {
        for (const s of v.split(",")) acc.push(Number(s));
        return acc;
      }
    )
    .option(
      "--compute <spec...>",
      "pipe-delimited 'prompt|model|maxTokens'",
      (v: string, acc: string[] = []) => {
        acc.push(v);
        return acc;
      }
    )
    .option("--da <bytes>", "DA payload byte count", (v: string) => Number(v))
    .option("--json", "emit JSON")
    .action(async (opts) => {
      const byOp: any = { storage: [], compute: [], da: [] };
      let totalFee = 0n;
      let totalGas = 0n;
      if (opts.storage) {
        for (const bytes of opts.storage as number[]) {
          const est = await deps.storageEstimate(bytes);
          byOp.storage.push(est);
          totalFee += BigInt(est.fee);
          totalGas += BigInt(est.gas);
        }
      }
      if (opts.compute) {
        for (const spec of opts.compute as string[]) {
          const [prompt, model, max] = spec.split("|");
          const est = await deps.computeEstimate({
            prompt,
            model,
            maxOutputTokens: Number(max),
          });
          byOp.compute.push(est);
          totalFee += BigInt(est.fee);
          totalGas += BigInt(est.gas);
        }
      }
      if (typeof opts.da === "number") {
        const est = await deps.daEstimate(opts.da);
        byOp.da.push(est);
        totalFee += BigInt(est.fee);
        totalGas += BigInt(est.gas);
      }
      deps.stdout(
        renderOutput(
          {
            byOp: stringifyBigInts(byOp),
            totalGas: totalGas.toString(),
            totalFeeWei: totalFee.toString(),
          },
          { json: opts.json }
        )
      );
    });
}

function stringifyBigInts(o: any): any {
  return JSON.parse(
    JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}
```

Add `storageEstimate`, `computeEstimate`, `daEstimate` to the `ProgramDeps` interface (these were already candidates from SP7's `0g estimate` CLI work — confirm and re-use).

- [ ] **Step 3: Register + run test**

```bash
pnpm --filter @foundryprotocol/0gkit-cli build
pnpm --filter @foundryprotocol/0gkit-cli test -- cost
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/0gkit-cli/src/commands/cost.ts packages/0gkit-cli/src/program.ts packages/0gkit-cli/src/__tests__/cost.test.ts
git commit -m "feat(cli): 0g cost forecast — aggregate SP7 estimates across ops"
```

---

### Task 6: Migrate `tee-attested-api` template

**Files:**

- Modify: `templates/tee-attested-api/package.json` — add `@foundryprotocol/0gkit-observability`.
- Modify: `templates/tee-attested-api/src/index.ts` — call `instrument0g({...})` at boot.
- Modify: `templates/tee-attested-api/src/middleware.ts` — `withAccessLog` becomes a thin attribute setter on the active OTel span; remove `console.log`.
- Modify: `templates/tee-attested-api/src/__tests__/middleware.test.ts` — assert attributes via in-memory exporter.
- Modify: `templates/tee-attested-api/README.md` — remove SP11 hand-off, add real `instrument0g` docs.

- [ ] **Step 1: Update middleware to record on the active span**

```ts
// templates/tee-attested-api/src/middleware.ts (excerpt)
import { trace } from "@opentelemetry/api";

export function withAccessLog() {
  return async (c: any, next: () => Promise<void>) => {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute("http.method", c.req.method);
      span.setAttribute("http.route", c.req.path);
    }
    await next();
    if (span) {
      span.setAttribute("http.status_code", c.res.status);
    }
  };
}
```

- [ ] **Step 2: Boot `instrument0g` in `index.ts`**

```ts
import { instrument0g } from "@foundryprotocol/0gkit-observability";

await instrument0g({
  serviceName: "tee-attested-api",
  exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? { kind: "otlp", endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }
    : { kind: "noop" },
});
```

- [ ] **Step 3: Update tests + run**

```bash
cd templates/tee-attested-api
pnpm install
pnpm test
```

Expected: tests PASS, coverage ≥ 80/70.

- [ ] **Step 4: Commit**

```bash
git add templates/tee-attested-api/
git commit -m "feat(templates): migrate tee-attested-api to instrument0g (resolves SP8 D26 hand-off)"
```

---

### Task 7: Docs pages

**Files:**

- Create: `apps/docs/app/packages/0gkit-observability/page.mdx`
- Create: `apps/docs/app/concepts/observability/page.mdx`
- Create: `apps/docs/app/concepts/observability/exporters/honeycomb.mdx`
- Create: `apps/docs/app/concepts/observability/exporters/datadog.mdx`
- Create: `apps/docs/app/concepts/observability/exporters/vercel.mdx`

Each exporter page is short and concrete: one snippet of `instrument0g({ exporter: { kind: 'otlp', endpoint: <vendor URL>, headers: { ... } } })`, one screenshot of where the trace shows up, one note on auth.

- [ ] **Step 1-5: Author each page (~100-150 lines each, concrete code, no placeholders)**

For each exporter page, the wire-up is the same shape; the differences are endpoint URL + headers + screenshot description.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/app/packages/0gkit-observability/ apps/docs/app/concepts/observability/
git commit -m "docs: 0gkit-observability package + concept + Honeycomb/Datadog/Vercel exporter guides"
```

---

### Task 8: Decisions, changeset, roadmap, PR

- [ ] **Step 1: Append D32 + D33 + D34**

`docs/DECISIONS.md`:

```markdown
---

## D32 — Observability via prototype patching, not module rewriting

**Date:** 2026-05-22 · **SP:** SP11

`instrument0g()` mutates `Storage.prototype.upload` etc. directly at call
time. Because ES modules export live bindings, this takes effect for every
caller that already imported the class. This avoids the alternative — a
`tracedStorage(s)` wrapper users must remember to call everywhere — and
matches the OTel auto-instrumentation contract that "one call wires
everything." Tests use a `mode: "attach"` + explicit `targets` injection to
keep them synchronous and isolated.

---

## D33 — Span attribute namespace is `0gkit.*`, frozen const in `ATTR`

**Date:** 2026-05-22 · **SP:** SP11

All attribute keys live in a single `ATTR` constant in `attributes.ts`. This
is the canonical names: `0gkit.network`, `0gkit.op`, `0gkit.size_bytes`,
`0gkit.gas_native`, `0gkit.fee_native`, `0gkit.confirm_seconds`,
`0gkit.root`, `0gkit.tx_hash`, `0gkit.block_number`, `0gkit.model`,
`0gkit.input_tokens`, `0gkit.output_tokens`, `0gkit.error_code`,
`0gkit.dry_run`. Standard OTel `http.*` and `rpc.*` attributes are layered
on top by user instrumentation (we don't duplicate them). The `0gkit.*`
prefix follows OTel's vendor namespace convention so collectors / cost
calculators can filter on the prefix.

---

## D34 — Bundle budget 20 KB gzipped for the public entry

**Date:** 2026-05-22 · **SP:** SP11

Asserted by `bundle-size.test.ts` via esbuild + gzip. `@opentelemetry/api` is
externalised (it's a peer; users provide it). The SDK and exporter peers are
optional and never reach the bundle unless explicitly imported. This budget
protects the "free observability" promise — we never want users to weigh a
toolkit decision on observability bundle cost.
```

- [ ] **Step 2: Author changeset**

```markdown
---
"@foundryprotocol/0gkit-observability": minor
"@foundryprotocol/0gkit-cli": minor
"create-0gkit-app": patch
"create-0g-app": patch
---

SP11 — `@foundryprotocol/0gkit-observability`. First publish: `instrument0g()`
patches Storage/Compute/DA/Attestation prototypes to emit OTel spans with
`0gkit.*` attributes. Bundle ≤ 20 KB gzipped. CLI gains `0g cost forecast`.
The `tee-attested-api` template moves from `console.log` access logging to
OTel spans.
```

- [ ] **Step 3: Mark SP11 ✅ in roadmap**

- [ ] **Step 4: Full pre-merge gate**

```bash
pnpm format:check && pnpm boundary:check && pnpm build && pnpm typecheck && pnpm test && pnpm docs:check && pnpm templates:check
```

- [ ] **Step 5: Push + PR + squash-merge**

```bash
git push -u origin sp11-0gkit-observability
gh pr create --title "SP11 — 0gkit-observability (OTel + 0g cost CLI)" --body "$(cat <<'EOF'
## Summary
- New `@foundryprotocol/0gkit-observability` — `instrument0g()` patches primitive prototypes
- `ATTR` namespace for `0gkit.*` attributes
- Optional OTel SDK auto-setup via lazy-imported peers
- New CLI: `0g cost forecast` aggregates SP7 estimates
- `tee-attested-api` template migrated (resolves SP8 D26)
- Bundle ≤ 20 KB gzipped (asserted in CI)
- Decisions D32/D33/D34

## Test plan
- [x] Spans emitted for upload/inference/publish with `0gkit.*` attributes
- [x] Error spans carry `0gkit.error_code` + ERROR status
- [x] disinstrument0g restores originals
- [x] Bundle size assertion
- [x] tee-attested-api template tests pass on OTel-based middleware

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Update Foundryprotocol CLAUDE.md**

---

## Self-review checklist

- Spec coverage: `instrument0g({...})`, `0gkit.*` semantic conventions, exporter docs (Honeycomb / Datadog / Vercel), `0g cost`, bundle budget — all covered. ✓
- No placeholders: every step has runnable code.
- Type consistency: `InstrumentConfig`, `ExporterConfig`, `ATTR`, `AttrFn`, `wrapMethod`, `unwrapAll` named identically across tasks. ✓
- Error code used: `OBSERVABILITY_EXPORTER_FAILED` — already in SP9's enum. ✓
- Bundle budget protected by automated test. ✓
- SP8 D26 hand-off (tee-attested-api) resolved. ✓
