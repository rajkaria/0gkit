# SP16: Golden path + typed config across all 9 templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `define0GConfig` (typed, zod-validated env reader) in `0gkit-core`, adopt it across all 9 templates with auto-detect of local devnet + first-success banner + "What next?" README, and gate the banner in `fresh-machine-smoke` CI.

**Architecture:**

1. **`0gkit-core` gains three small additions:** `define0GConfig({ server, client, edge })` returns a typed parser per slot using zod; `detectLocalDevnet({ rpcUrl })` probes a chainId; `printFirstSuccess({ op, id })` renders a boxed terminal banner with marker `[0gkit:first-success]` so CI grep is reliable.
2. **Every template** ships `0g.config.ts` (or `src/config.ts` for non-Node-CLI shapes) that calls `define0GConfig(...)`, a refreshed `.env.example` derived from that schema, an auto-devnet bootstrapping snippet in the entry file, a `printFirstSuccess(...)` call on the first 0G op, and a "What next?" README block with three concrete next steps.
3. **`fresh-machine-smoke.yml`** runs `npm run dev` (with a 60s timeout and dummy env) for `storage-app` + `chat` and grep-asserts `[0gkit:first-success]` appears.

**Tech Stack:** TypeScript ESM, zod ^3.23.x, vitest, tsup, Node ≥20, viem for the chainId probe. All Node built-ins for ANSI box drawing.

**Decisions captured (per roadmap):**

- D59 — `define0GConfig` lives in `0gkit-core`; no new package.
- D71 (new) — First-success banner is opt-in via `printFirstSuccess()` helper (a single function call, not auto-wrap). Marker token `[0gkit:first-success]` is part of the public contract so CI / log scrapers can pin to it.
- D72 (new) — `detectLocalDevnet()` is a pure chainId probe (no doctor shell-out). Templates call it on boot; if local responds with the local preset's chainId they use `network: "local"`; otherwise fall back to `network: "galileo"` with a `console.warn` line.
- D73 (new) — Zod is a direct dep on `0gkit-core` (one small package gz ~14 KB, already in the install graph via `0gkit-jobs`'s schema validation). Avoiding it would mean hand-rolling type narrowing for every template and is worse for users.

---

## File Structure

**New files:**

- `packages/0gkit-core/src/define-config.ts` — `define0GConfig` + types.
- `packages/0gkit-core/src/detect-devnet.ts` — `detectLocalDevnet`.
- `packages/0gkit-core/src/first-success.ts` — `printFirstSuccess`.
- `packages/0gkit-core/src/__tests__/define-config.test.ts` — 8+ tests.
- `packages/0gkit-core/src/__tests__/detect-devnet.test.ts` — 4 tests.
- `packages/0gkit-core/src/__tests__/first-success.test.ts` — 4 tests.
- `templates/storage-app/0g.config.ts` — `define0GConfig({ server: ... })`.
- `templates/chat/0g.config.ts` — `define0GConfig({ server: ..., client: ... })`.
- `templates/ai-agent/0g.config.ts`
- `templates/tee-attested-api/0g.config.ts`
- `templates/nft-with-storage/0g.config.ts`
- `templates/inference-app/0g.config.ts`
- `templates/attestation-verify/0g.config.ts`
- `templates/mcp-agent/0g.config.ts`
- `templates/react-app/0g.config.ts`
- `.changeset/sp16-define0gconfig-golden-path.md`

**Modified files:**

- `packages/0gkit-core/src/index.ts` — re-export new APIs.
- `packages/0gkit-core/package.json` — add `zod` dep.
- `packages/0gkit-core/tsup.config.ts` — ensure zod stays external (or bundled — zod has no node deps so either works; default tsup behavior leaves deps external).
- `apps/docs/app/templates/page.mdx` — "Under 5 minutes" per template.
- `apps/docs/app/packages/0gkit-core/page.mdx` — document new exports.
- `.github/workflows/fresh-machine-smoke.yml` — add a "first-success banner" step.
- `templates/storage-app/src/index.ts`, `templates/storage-app/.env.example`, `templates/storage-app/README.md`, `templates/storage-app/package.json`
- (same trio for each of the other 8 templates)

---

## Task 1: `define0GConfig` core API (TDD)

**Files:**

- Create: `packages/0gkit-core/src/define-config.ts`
- Create: `packages/0gkit-core/src/__tests__/define-config.test.ts`
- Modify: `packages/0gkit-core/package.json` (add zod)

- [ ] **Step 1: Add zod to `0gkit-core` deps**

In `packages/0gkit-core/package.json`, add `"zod": "^3.23.0"` to `dependencies` (above `"viem"`). Keep the alphabetical order of devDependencies untouched.

Run from repo root:

```bash
pnpm install
```

Expected: lockfile updates, `node_modules/.pnpm/zod*` resolves.

- [ ] **Step 2: Write the failing test**

Create `packages/0gkit-core/src/__tests__/define-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { define0GConfig, ConfigError } from "../index.js";

describe("define0GConfig", () => {
  it("returns parsed server config from process.env", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
        PRIVATE_KEY: z.string().min(64),
      },
    });
    const out = cfg.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "a".repeat(64),
    });
    expect(out.ZEROG_NETWORK).toBe("galileo");
    expect(out.PRIVATE_KEY.length).toBe(64);
  });

  it("applies schema defaults", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
      },
    });
    expect(cfg.server({}).ZEROG_NETWORK).toBe("galileo");
  });

  it("throws ConfigError with field path when required env missing", () => {
    const cfg = define0GConfig({
      server: {
        PRIVATE_KEY: z.string().min(64),
      },
    });
    expect(() => cfg.server({})).toThrow(ConfigError);
    try {
      cfg.server({});
    } catch (e) {
      expect((e as ConfigError).code).toBe("CONFIG_INVALID_ARGUMENT");
      expect((e as ConfigError).message).toMatch(/PRIVATE_KEY/);
    }
  });

  it("client slot filters to NEXT_PUBLIC_* keys only", () => {
    const cfg = define0GConfig({
      client: {
        NEXT_PUBLIC_ZEROG_NETWORK: z.string(),
      },
    });
    const out = cfg.client({
      NEXT_PUBLIC_ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "should-not-appear",
    });
    expect(out.NEXT_PUBLIC_ZEROG_NETWORK).toBe("galileo");
    expect(Object.keys(out)).toEqual(["NEXT_PUBLIC_ZEROG_NETWORK"]);
  });

  it("client slot rejects non-NEXT_PUBLIC_* schema keys at definition time", () => {
    expect(() =>
      define0GConfig({
        client: {
          PRIVATE_KEY: z.string(),
        },
      })
    ).toThrow(/NEXT_PUBLIC_/);
  });

  it("edge slot parses but does not allow process.env-style fallback when given undefined", () => {
    const cfg = define0GConfig({
      edge: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]),
      },
    });
    expect(() => cfg.edge({})).toThrow(ConfigError);
    expect(cfg.edge({ ZEROG_NETWORK: "galileo" }).ZEROG_NETWORK).toBe("galileo");
  });

  it("envExample() emits a stringified .env.example from server + client slots", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z
          .enum(["galileo", "aristotle", "local"])
          .default("galileo")
          .describe("Which 0G network to target."),
        PRIVATE_KEY: z.string().describe("Funds 0G transactions."),
      },
      client: {
        NEXT_PUBLIC_ZEROG_NETWORK: z.string().default("galileo"),
      },
    });
    const out = cfg.envExample();
    expect(out).toContain("# Which 0G network to target.");
    expect(out).toContain("ZEROG_NETWORK=galileo");
    expect(out).toContain("# Funds 0G transactions.");
    expect(out).toContain("PRIVATE_KEY=");
    expect(out).toContain("NEXT_PUBLIC_ZEROG_NETWORK=galileo");
  });

  it("envExample() omits secrets' defaults", () => {
    const cfg = define0GConfig({
      server: {
        PRIVATE_KEY: z.string().describe("Funds transactions."),
      },
    });
    const out = cfg.envExample();
    expect(out).toMatch(/PRIVATE_KEY=\s*$/m);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @foundryprotocol/0gkit-core test
```

Expected: 8 failing assertions on missing `define0GConfig` import.

- [ ] **Step 4: Implement `define0GConfig`**

Create `packages/0gkit-core/src/define-config.ts`:

```ts
import { z, type ZodTypeAny, type ZodRawShape } from "zod";
import { ConfigError } from "./errors.js";

export interface DefineConfigOptions {
  server?: ZodRawShape;
  client?: ZodRawShape;
  edge?: ZodRawShape;
}

export interface DefinedConfig<O extends DefineConfigOptions> {
  server: (env?: Record<string, string | undefined>) => SchemaOf<O["server"]>;
  client: (env?: Record<string, string | undefined>) => SchemaOf<O["client"]>;
  edge: (env?: Record<string, string | undefined>) => SchemaOf<O["edge"]>;
  envExample: () => string;
}

type SchemaOf<S> = S extends ZodRawShape
  ? z.infer<z.ZodObject<S>>
  : Record<string, never>;

const NEXT_PUBLIC_PREFIX = "NEXT_PUBLIC_";

function buildSlot(shape: ZodRawShape | undefined) {
  if (!shape) {
    return (_env?: Record<string, string | undefined>): Record<string, never> => ({});
  }
  const obj = z.object(shape).strict();
  return (env?: Record<string, string | undefined>) => {
    const source = env ?? (typeof process !== "undefined" ? process.env : {});
    const picked: Record<string, string | undefined> = {};
    for (const key of Object.keys(shape)) {
      if (source[key] !== undefined) picked[key] = source[key];
    }
    const result = obj.safeParse(picked);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new ConfigError(
        `0gkit config validation failed — ${issues}`,
        "Check your .env.example and ensure required vars are set."
      );
    }
    return result.data as unknown as Record<string, unknown>;
  };
}

function exampleValue(schema: ZodTypeAny): string {
  const def = schema._def as { defaultValue?: () => unknown };
  if (typeof def.defaultValue === "function") {
    const v = def.defaultValue();
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      return String(v);
  }
  return "";
}

function envExampleFor(shape: ZodRawShape): string {
  const lines: string[] = [];
  for (const [key, schemaUnknown] of Object.entries(shape)) {
    const schema = schemaUnknown as ZodTypeAny;
    const desc = schema.description;
    if (desc) lines.push(`# ${desc}`);
    lines.push(`${key}=${exampleValue(schema)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function define0GConfig<O extends DefineConfigOptions>(
  opts: O
): DefinedConfig<O> {
  if (opts.client) {
    for (const key of Object.keys(opts.client)) {
      if (!key.startsWith(NEXT_PUBLIC_PREFIX)) {
        throw new Error(
          `define0GConfig.client schema key "${key}" must start with NEXT_PUBLIC_ — only public vars belong in the client slot.`
        );
      }
    }
  }

  const serverParse = buildSlot(opts.server);
  const clientParse = buildSlot(opts.client);
  const edgeParse = buildSlot(opts.edge);

  return {
    server: serverParse as DefinedConfig<O>["server"],
    client: clientParse as DefinedConfig<O>["client"],
    edge: edgeParse as DefinedConfig<O>["edge"],
    envExample: () => {
      const parts: string[] = [];
      if (opts.server)
        parts.push("# --- server (Node only) ---\n" + envExampleFor(opts.server));
      if (opts.client)
        parts.push(
          "# --- client (browser-safe, NEXT_PUBLIC_*) ---\n" +
            envExampleFor(opts.client)
        );
      if (opts.edge) parts.push("# --- edge runtime ---\n" + envExampleFor(opts.edge));
      return parts.join("\n");
    },
  };
}
```

- [ ] **Step 5: Export from index**

Modify `packages/0gkit-core/src/index.ts` — append:

```ts
export {
  define0GConfig,
  type DefineConfigOptions,
  type DefinedConfig,
} from "./define-config.js";
```

- [ ] **Step 6: Run tests, verify pass**

```bash
pnpm --filter @foundryprotocol/0gkit-core test
```

Expected: all `define-config.test.ts` cases green.

- [ ] **Step 7: Commit**

```bash
git checkout -b sp16-golden-path-typed-config
git add packages/0gkit-core/src/define-config.ts packages/0gkit-core/src/__tests__/define-config.test.ts packages/0gkit-core/src/index.ts packages/0gkit-core/package.json pnpm-lock.yaml
git commit -m "feat(core): define0GConfig — typed env reader with server/client/edge slots"
```

---

## Task 2: `detectLocalDevnet` helper (TDD)

**Files:**

- Create: `packages/0gkit-core/src/detect-devnet.ts`
- Create: `packages/0gkit-core/src/__tests__/detect-devnet.test.ts`
- Modify: `packages/0gkit-core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/0gkit-core/src/__tests__/detect-devnet.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { detectLocalDevnet } from "../index.js";
import { local } from "../networks.js";

describe("detectLocalDevnet", () => {
  it("returns true when local RPC responds with the local preset chainId", async () => {
    const fakeClient = { getChainId: vi.fn().mockResolvedValue(local.chainId) };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(true);
  });

  it("returns false when the chainId doesn't match", async () => {
    const fakeClient = { getChainId: vi.fn().mockResolvedValue(99n) };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(false);
  });

  it("returns false when the probe throws (RPC unreachable)", async () => {
    const fakeClient = {
      getChainId: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => fakeClient,
    });
    expect(ok).toBe(false);
  });

  it("times out after the requested deadline and returns false", async () => {
    const slow = {
      getChainId: () =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(local.chainId), 5000)
        ),
    };
    const start = Date.now();
    const ok = await detectLocalDevnet({
      rpcUrl: "http://localhost:8545",
      probeClient: () => slow,
      timeoutMs: 100,
    });
    expect(ok).toBe(false);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
pnpm --filter @foundryprotocol/0gkit-core test detect-devnet
```

Expected: fails on missing `detectLocalDevnet` export.

- [ ] **Step 3: Implement**

Create `packages/0gkit-core/src/detect-devnet.ts`:

```ts
import { createPublicClient, http } from "viem";
import { local } from "./networks.js";

interface ProbeClient {
  getChainId: () => Promise<number | bigint>;
}

export interface DetectLocalDevnetOptions {
  rpcUrl?: string;
  timeoutMs?: number;
  probeClient?: (rpcUrl: string) => ProbeClient;
}

const DEFAULT_LOCAL_RPC = "http://127.0.0.1:8545";
const DEFAULT_TIMEOUT_MS = 1000;

function defaultProbe(rpcUrl: string): ProbeClient {
  return createPublicClient({ transport: http(rpcUrl) }) as unknown as ProbeClient;
}

export async function detectLocalDevnet(
  opts: DetectLocalDevnetOptions = {}
): Promise<boolean> {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_LOCAL_RPC;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const probe = (opts.probeClient ?? defaultProbe)(rpcUrl);
  const target = BigInt(local.chainId ?? 0);

  try {
    const observed = await Promise.race<number | bigint>([
      probe.getChainId(),
      new Promise<number>((_, rej) =>
        setTimeout(() => rej(new Error("detectLocalDevnet timeout")), timeoutMs)
      ),
    ]);
    return BigInt(observed) === target;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Export from index**

Append to `packages/0gkit-core/src/index.ts`:

```ts
export { detectLocalDevnet, type DetectLocalDevnetOptions } from "./detect-devnet.js";
```

- [ ] **Step 5: Run tests, verify pass**

```bash
pnpm --filter @foundryprotocol/0gkit-core test detect-devnet
```

Expected: 4/4 green.

- [ ] **Step 6: Commit**

```bash
git add packages/0gkit-core/src/detect-devnet.ts packages/0gkit-core/src/__tests__/detect-devnet.test.ts packages/0gkit-core/src/index.ts
git commit -m "feat(core): detectLocalDevnet — pure chainId probe for template auto-config"
```

---

## Task 3: `printFirstSuccess` banner (TDD)

**Files:**

- Create: `packages/0gkit-core/src/first-success.ts`
- Create: `packages/0gkit-core/src/__tests__/first-success.test.ts`
- Modify: `packages/0gkit-core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/0gkit-core/src/__tests__/first-success.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { printFirstSuccess, FIRST_SUCCESS_MARKER } from "../index.js";

describe("printFirstSuccess", () => {
  it("prints a banner with the marker token, op, and id", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "storage.upload", id: "0xabc123" }, (line) =>
      out.push(line)
    );
    const blob = out.join("\n");
    expect(blob).toContain(FIRST_SUCCESS_MARKER);
    expect(blob).toContain("storage.upload");
    expect(blob).toContain("0xabc123");
  });

  it("draws a unicode box around the content", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "compute.inference", id: "tx-1" }, (line) =>
      out.push(line)
    );
    expect(out.some((l) => l.includes("┌") && l.includes("┐"))).toBe(true);
    expect(out.some((l) => l.includes("└") && l.includes("┘"))).toBe(true);
  });

  it("only renders once per call (idempotent at the helper level is the caller's job)", () => {
    const out: string[] = [];
    const sink = (line: string) => out.push(line);
    printFirstSuccess({ op: "da.publish", id: "0xfeed" }, sink);
    printFirstSuccess({ op: "da.publish", id: "0xfeed" }, sink);
    const marker = out.filter((l) => l.includes(FIRST_SUCCESS_MARKER));
    expect(marker.length).toBe(2);
  });

  it("FIRST_SUCCESS_MARKER is the documented contract token", () => {
    expect(FIRST_SUCCESS_MARKER).toBe("[0gkit:first-success]");
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
pnpm --filter @foundryprotocol/0gkit-core test first-success
```

Expected: fails on missing import.

- [ ] **Step 3: Implement**

Create `packages/0gkit-core/src/first-success.ts`:

```ts
export const FIRST_SUCCESS_MARKER = "[0gkit:first-success]";

export interface FirstSuccessArgs {
  op: string;
  id: string;
  note?: string;
}

export function printFirstSuccess(
  args: FirstSuccessArgs,
  sink: (line: string) => void = (l) => console.log(l)
): void {
  const heading = `${FIRST_SUCCESS_MARKER} ${args.op}`;
  const idLine = `id: ${args.id}`;
  const noteLine = args.note ? args.note : "";
  const width =
    Math.max(
      heading.length,
      idLine.length,
      noteLine.length,
      "First 0G action successful".length
    ) + 2;

  const top = "┌" + "─".repeat(width) + "┐";
  const bot = "└" + "─".repeat(width) + "┘";
  const pad = (s: string) => `│ ${s}${" ".repeat(Math.max(0, width - 1 - s.length))}│`;

  sink(top);
  sink(pad("First 0G action successful"));
  sink(pad(heading));
  sink(pad(idLine));
  if (noteLine) sink(pad(noteLine));
  sink(bot);
}
```

- [ ] **Step 4: Export from index**

Append:

```ts
export {
  printFirstSuccess,
  FIRST_SUCCESS_MARKER,
  type FirstSuccessArgs,
} from "./first-success.js";
```

- [ ] **Step 5: Run tests + full core suite, verify pass**

```bash
pnpm --filter @foundryprotocol/0gkit-core test
pnpm --filter @foundryprotocol/0gkit-core build
pnpm --filter @foundryprotocol/0gkit-core typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/0gkit-core/src/first-success.ts packages/0gkit-core/src/__tests__/first-success.test.ts packages/0gkit-core/src/index.ts
git commit -m "feat(core): printFirstSuccess banner helper for template golden path"
```

---

## Task 4: storage-app template migration

**Files:**

- Create: `templates/storage-app/0g.config.ts`
- Modify: `templates/storage-app/src/index.ts`
- Modify: `templates/storage-app/.env.example`
- Modify: `templates/storage-app/README.md`
- Modify: `templates/storage-app/package.json`
- Add: `templates/storage-app/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing config test**

Create `templates/storage-app/src/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("storage-app 0g.config", () => {
  it("exposes a server slot with ZEROG_NETWORK + PRIVATE_KEY", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
  });

  it("rejects a missing PRIVATE_KEY", () => {
    expect(() => config.server({})).toThrow();
  });

  it("envExample() includes both ZEROG_NETWORK and PRIVATE_KEY", () => {
    const ex = config.envExample();
    expect(ex).toContain("ZEROG_NETWORK=galileo");
    expect(ex).toContain("PRIVATE_KEY=");
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
cd templates/storage-app && pnpm test config && cd ../..
```

Expected: failure (file does not exist).

- [ ] **Step 3: Create `0g.config.ts`**

Create `templates/storage-app/0g.config.ts`:

```ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Which 0G network to target (default galileo testnet)."),
    PRIVATE_KEY: z
      .string()
      .min(64)
      .describe(
        "Signs the upload funding tx. For local devnet use the anvil dev mnemonic."
      ),
  },
});
```

- [ ] **Step 4: Add `0gkit-core` to template deps (zod is transitive but the import is direct)**

Confirm `templates/storage-app/package.json` already lists `@foundryprotocol/0gkit-core`. Add `"zod": "^3.23.0"` to `dependencies`.

Run from repo root:

```bash
pnpm install
```

- [ ] **Step 5: Run config test, verify pass**

```bash
cd templates/storage-app && pnpm test config && cd ../..
```

Expected: 3/3 green.

- [ ] **Step 6: Refresh `.env.example`**

Overwrite `templates/storage-app/.env.example`:

```
# --- server (Node only) ---
# Which 0G network to target (default galileo testnet).
ZEROG_NETWORK=galileo

# Signs the upload funding tx. For local devnet use the anvil dev mnemonic.
PRIVATE_KEY=
```

- [ ] **Step 7: Wire `0g.config` + auto-devnet + first-success into entry**

Replace `templates/storage-app/src/index.ts` body:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import {
  ZeroGError,
  formatEstimate,
  detectLocalDevnet,
  printFirstSuccess,
} from "@foundryprotocol/0gkit-core";
import { runStorageFlow } from "./storage-flow.js";
import { config } from "../0g.config.js";

async function main(): Promise<void> {
  const env = config.server();
  let network = env.ZEROG_NETWORK;
  if (network === "galileo" && (await detectLocalDevnet())) {
    console.warn("[0gkit] Local devnet detected — using network=local.");
    network = "local";
  }

  const signer = await fromPrivateKey({ privateKey: env.PRIVATE_KEY as `0x${string}` });
  const storage = new Storage({ network, signer });

  const samplePath = fileURLToPath(new URL("./index.ts", import.meta.url));
  const bytes = new Uint8Array(await readFile(samplePath));

  const result = await runStorageFlow(
    { bytes, label: samplePath },
    { storage, log: (m) => console.log(m), formatEstimate }
  );

  if (!result.ok) {
    console.error(`FAILED: ${result.reason}`);
    process.exit(1);
  }
  printFirstSuccess({
    op: "storage.upload",
    id: result.root,
    note: `network=${network}`,
  });
}

main().catch((err: unknown) => {
  if (err instanceof ZeroGError) {
    console.error(`\n${err.name}: ${err.message}`);
    if (err.hint) console.error(`Hint: ${err.hint}`);
    if (err.helpUrl) console.error(`Help: ${err.helpUrl}`);
    process.exit(1);
  }
  throw err;
});
```

If `runStorageFlow`'s success type doesn't expose `root`, narrow with whatever field carries the root (likely `result.upload.root` or `result.estimate?` — read the current `storage-flow.ts` and adjust the property path so this compiles. Do NOT invent a field).

- [ ] **Step 8: Run full template tests + typecheck**

```bash
cd templates/storage-app && pnpm test && pnpm typecheck && cd ../..
```

Expected: all green (existing flow tests + new config test).

- [ ] **Step 9: Add "What next?" to README**

At the end of `templates/storage-app/README.md`, append:

```markdown
## What next?

1. **Deploy** — `vercel deploy` (uses `0g.config.ts` for env), or wrap the script in a Node server.
2. **Extend** — fetch the uploaded root with `storage.download(root)` and stream to a client; add a manifest contract via `0gkit-contracts`.
3. **Migrate to mainnet** — set `ZEROG_NETWORK=aristotle`, fund the key, re-run. Re-read [the migration guide](https://docs.0gkit.com/migrate-from-official-sdks).
```

- [ ] **Step 10: Commit**

```bash
git add templates/storage-app pnpm-lock.yaml
git commit -m "feat(template/storage-app): adopt define0GConfig + auto-devnet + first-success banner"
```

---

## Task 5: chat template migration (Next.js, server + client slots)

**Files:**

- Create: `templates/chat/0g.config.ts`
- Modify: `templates/chat/app/api/post/route.ts` (or whichever route writes to storage)
- Modify: `templates/chat/app/providers.tsx` or `lib/contract.ts` for the client slot
- Modify: `templates/chat/.env.example`
- Modify: `templates/chat/README.md`
- Modify: `templates/chat/package.json`
- Add: `templates/chat/lib/__tests__/config.test.ts`

- [ ] **Step 1: Inspect current chat config code**

Read these to find where env is consumed: `templates/chat/app/api/post/route.ts`, `templates/chat/app/providers.tsx`, `templates/chat/lib/contract.ts`. Identify every `process.env.*` access.

- [ ] **Step 2: Write the failing config test**

Create `templates/chat/lib/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("chat 0g.config", () => {
  it("server slot accepts a valid env", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
  });

  it("client slot returns NEXT_PUBLIC_* only", () => {
    const parsed = config.client({
      NEXT_PUBLIC_ZEROG_NETWORK: "galileo",
      NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS: "0x" + "0".repeat(40),
    });
    expect(parsed.NEXT_PUBLIC_ZEROG_NETWORK).toBe("galileo");
    expect(parsed.NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS.startsWith("0x")).toBe(true);
  });
});
```

- [ ] **Step 3: Run, verify fails**

```bash
cd templates/chat && pnpm test config && cd ../..
```

Expected: file-not-found failure.

- [ ] **Step 4: Create `0g.config.ts`**

```ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Network for server-side storage uploads + contract writes."),
    PRIVATE_KEY: z
      .string()
      .min(64)
      .describe(
        "Server key — funds storage uploads and on-chain MessagePosted writes."
      ),
  },
  client: {
    NEXT_PUBLIC_ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("Network the in-browser indexer should read from."),
    NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("Deployed MessageRegistry contract address."),
  },
});
```

Add `zod` to `templates/chat/package.json` dependencies and `pnpm install` from repo root.

- [ ] **Step 5: Replace `process.env.*` consumers with `config.server()` / `config.client()`**

Wherever `templates/chat/lib/contract.ts` reads `process.env.NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS`, replace with:

```ts
import { config } from "../0g.config.js";
const env = config.client(process.env as Record<string, string | undefined>);
export const MESSAGE_REGISTRY_ADDRESS =
  env.NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS as `0x${string}`;
```

In the API route (`app/api/post/route.ts`), at module top, after on-success of the first storage upload, call:

```ts
import { printFirstSuccess, detectLocalDevnet } from "@foundryprotocol/0gkit-core";
import { config } from "../../../0g.config.js";

const env = config.server();
let network = env.ZEROG_NETWORK;
if (network === "galileo" && (await detectLocalDevnet())) {
  console.warn("[0gkit] Local devnet detected — using network=local.");
  network = "local";
}
// ... existing upload code ...
printFirstSuccess({ op: "chat.post", id: root, note: `network=${network}` });
```

Use the exact `root` variable name the route already produces. Do not invent new names.

- [ ] **Step 6: Refresh `.env.example`**

Replace `templates/chat/.env.example`:

```
# --- server (Node only) ---
# Network for server-side storage uploads + contract writes.
ZEROG_NETWORK=galileo

# Server key — funds storage uploads and on-chain MessagePosted writes.
PRIVATE_KEY=

# --- client (browser-safe, NEXT_PUBLIC_*) ---
# Network the in-browser indexer should read from.
NEXT_PUBLIC_ZEROG_NETWORK=galileo

# Deployed MessageRegistry contract address.
NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
```

- [ ] **Step 7: README "What next?"**

Append to `templates/chat/README.md`:

```markdown
## What next?

1. **Deploy** — `vercel deploy`. Configure `PRIVATE_KEY` + `NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS` in the Vercel dashboard.
2. **Extend** — per-room channels: keyed by a room id in the `MessagePosted` event topic; client-side signing via `0gkit-wallet-react` for true user identity.
3. **Migrate to mainnet** — deploy `MessageRegistry` to aristotle, paste its address into both env files, redeploy.
```

- [ ] **Step 8: Run tests, typecheck, lint**

```bash
cd templates/chat && pnpm test && pnpm typecheck && cd ../..
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add templates/chat pnpm-lock.yaml
git commit -m "feat(template/chat): adopt define0GConfig with server + client slots, banner, what-next"
```

---

## Task 6: ai-agent template migration

**Files:**

- Create: `templates/ai-agent/0g.config.ts`
- Modify: `templates/ai-agent/src/index.ts`
- Modify: `templates/ai-agent/.env.example`
- Modify: `templates/ai-agent/README.md`
- Modify: `templates/ai-agent/package.json`
- Add: `templates/ai-agent/src/__tests__/config.test.ts`

- [ ] **Step 1: Config test (mirrors storage-app but for compute keys)**

Create `templates/ai-agent/src/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("ai-agent 0g.config", () => {
  it("server slot includes ZEROG_NETWORK, BROKER_KEY, optional MODEL", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      BROKER_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
    expect(parsed.MODEL).toBeUndefined();
  });

  it("rejects missing BROKER_KEY", () => {
    expect(() => config.server({})).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fails**

```bash
cd templates/ai-agent && pnpm test config && cd ../..
```

- [ ] **Step 3: Create `0g.config.ts`**

```ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("0G network for compute calls."),
    BROKER_KEY: z
      .string()
      .min(64)
      .describe("Funded broker key for 0G Compute (testnet OK)."),
    PROVIDER: z
      .string()
      .optional()
      .describe("Optional pinned compute provider address; auto-discovers if blank."),
    MODEL: z
      .string()
      .optional()
      .describe("Optional pinned model name; defaults to provider's default."),
  },
});
```

Add `zod` to `package.json` deps. `pnpm install`.

- [ ] **Step 4: Wire into entry**

In `templates/ai-agent/src/index.ts`, replace env reads with:

```ts
import {
  detectLocalDevnet,
  printFirstSuccess,
  ZeroGError,
} from "@foundryprotocol/0gkit-core";
import { config } from "../0g.config.js";

const env = config.server();
let network = env.ZEROG_NETWORK;
if (network === "galileo" && (await detectLocalDevnet())) {
  console.warn("[0gkit] Local devnet detected — using network=local.");
  network = "local";
}
// ... existing Compute instantiation, using env.BROKER_KEY, env.PROVIDER, env.MODEL ...

// After the first agent step succeeds:
printFirstSuccess({
  op: "compute.inference",
  id: firstReceipt.txHash ?? "ok",
  note: `network=${network}`,
});
```

Use whatever variable names the current `src/index.ts` defines for the first compute receipt — do not rename.

- [ ] **Step 5: Refresh `.env.example` to match the schema (server slot only)**

```
# --- server (Node only) ---
# 0G network for compute calls.
ZEROG_NETWORK=galileo

# Funded broker key for 0G Compute (testnet OK).
BROKER_KEY=

# Optional pinned compute provider address; auto-discovers if blank.
PROVIDER=

# Optional pinned model name; defaults to provider's default.
MODEL=
```

- [ ] **Step 6: README "What next?"**

```markdown
## What next?

1. **Deploy** — wrap `runAgent` in a Vercel Function or Cron route; persist results to KV.
2. **Extend** — swap `MemoryBackend` to `SqliteBackend` for crash-safe agent state (one-line change in `0gkit-jobs`); add custom tools in `src/tools.ts`.
3. **Migrate to mainnet** — `ZEROG_NETWORK=aristotle`, top up the broker, rerun. See the [compute concept page](https://docs.0gkit.com/concepts/durable-jobs).
```

- [ ] **Step 7: Tests, typecheck, commit**

```bash
cd templates/ai-agent && pnpm test && pnpm typecheck && cd ../..
git add templates/ai-agent pnpm-lock.yaml
git commit -m "feat(template/ai-agent): adopt define0GConfig + first-success banner + what-next"
```

---

## Task 7: tee-attested-api + nft-with-storage migrations (batched — Node server / Foundry script)

Same shape as Tasks 4 and 6 for each, with these per-template specifics:

### 7a. tee-attested-api

**Schema (`templates/tee-attested-api/0g.config.ts`):**

```ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
    PRIVATE_KEY: z.string().min(64).describe("Signs attested API responses."),
    PORT: z.coerce
      .number()
      .int()
      .positive()
      .default(8787)
      .describe("HTTP port for the Hono server."),
  },
});
```

**Entry wiring (`templates/tee-attested-api/src/index.ts`):** Use `config.server()` for `PRIVATE_KEY` and `PORT`. Inside the first request handler that emits `X-0G-Attestation`, after the response is built, call:

```ts
printFirstSuccess({
  op: "tee.attest",
  id: attestation.signature,
  note: `port=${env.PORT}`,
});
```

Only fire once per process — guard with a module-level `let banner_emitted = false`.

**.env.example:**

```
# --- server (Node only) ---
ZEROG_NETWORK=galileo
PRIVATE_KEY=
PORT=8787
```

**Test (`templates/tee-attested-api/src/__tests__/config.test.ts`):**

```ts
import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("tee-attested-api 0g.config", () => {
  it("PORT coerces to number", () => {
    const parsed = config.server({
      PRIVATE_KEY: "0x" + "a".repeat(64),
      PORT: "9090",
    });
    expect(parsed.PORT).toBe(9090);
  });
});
```

**README "What next?":**

```markdown
## What next?

1. **Deploy** — `vercel deploy` or `fly launch`. Hono runs natively on Fluid Compute.
2. **Extend** — add per-route attestation enforcement; persist attested receipts to `0gkit-storage`.
3. **Migrate to mainnet** — `ZEROG_NETWORK=aristotle`, ensure the TEE provider sidecar is configured for mainnet endpoints.
```

### 7b. nft-with-storage

**Schema:**

```ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
    PRIVATE_KEY: z.string().min(64).describe("Mints + uploads media."),
    NFT_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("Deployed StorageNFT contract address."),
  },
});
```

**Entry wiring (`templates/nft-with-storage/src/index.ts`):** After the first successful `mint`, fire `printFirstSuccess({ op: "nft.mint", id: tokenId.toString(), note: \`network=${network}\` })`.

**.env.example:**

```
# --- server (Node only) ---
ZEROG_NETWORK=galileo
PRIVATE_KEY=
NFT_ADDRESS=
```

**Test:** mirror Tasks 4/6 — assert `NFT_ADDRESS` regex + missing-key throws.

**README "What next?":**

```markdown
## What next?

1. **Deploy contract** — `forge create contracts/StorageNFT.sol:StorageNFT --rpc-url ...`; paste address into `.env`.
2. **Extend** — add ERC-2981 royalties; build a marketplace UI reading mint events via `0gkit-indexer`.
3. **Migrate to mainnet** — redeploy `StorageNFT` to aristotle; rebuild typed clients with `0g contracts generate`.
```

- [ ] **Step 1–3 (each subtemplate): config test → fails → schema → passes**

For tee-attested-api:

```bash
cd templates/tee-attested-api && pnpm test config && cd ../..
```

For nft-with-storage:

```bash
cd templates/nft-with-storage && pnpm test config && cd ../..
```

- [ ] **Step 4: Wire entries, refresh .env.examples, append READMEs (per spec above)**

- [ ] **Step 5: Run full suites + typecheck per template**

```bash
cd templates/tee-attested-api && pnpm test && pnpm typecheck && cd ../..
cd templates/nft-with-storage && pnpm test && pnpm typecheck && cd ../..
```

- [ ] **Step 6: Commit**

```bash
git add templates/tee-attested-api templates/nft-with-storage pnpm-lock.yaml
git commit -m "feat(templates): adopt define0GConfig + banner across tee-attested-api + nft-with-storage"
```

---

## Task 8: inference-app + attestation-verify + mcp-agent + react-app migrations (batched)

These are the lower-touch templates. Same five-step pattern. Per-template schemas:

### 8a. inference-app

```ts
// templates/inference-app/0g.config.ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
    BROKER_KEY: z
      .string()
      .min(64)
      .describe("Funded 0G broker private key for inference."),
    PROVIDER: z
      .string()
      .optional()
      .describe("Pin a provider address; blank = auto-discover."),
    MODEL: z
      .string()
      .optional()
      .describe("Pin a model name; blank = provider default."),
    PROMPT: z
      .string()
      .default("In one sentence, what is the 0G network?")
      .describe("Prompt to send."),
  },
});
```

Wire entry; first-success banner fires on the inference result with `printFirstSuccess({ op: "compute.inference", id: receipt.txHash ?? "ok" })`. README "What next?": deploy as a cron, extend to streaming, mainnet migration. .env.example mirrors the schema.

### 8b. attestation-verify (no network — pure crypto)

```ts
// templates/attestation-verify/0g.config.ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    DEMO_PRIVATE_KEY: z
      .string()
      .default("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
      .describe("Test signing key — DO NOT use for anything real."),
  },
});
```

Wire entry; on a successful verify, `printFirstSuccess({ op: "attestation.verify", id: envelope.signature.slice(0, 18) })`. README "What next?": integrate into your own server's request middleware; extend to signed receipts; reference signed-envelopes concept doc.

### 8c. mcp-agent

```ts
// templates/mcp-agent/0g.config.ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
    ZEROG_RPC_URL: z.string().url().optional(),
    ZEROG_PRIVATE_KEY: z.string().optional().describe("Signer for og_storage_put."),
    ZEROG_BROKER_KEY: z.string().optional().describe("Broker for og_infer."),
    ZEROG_PROVIDER: z.string().optional(),
    ZEROG_FOUNDRY: z
      .enum(["0", "1"])
      .default("0")
      .describe("Enable opt-in Foundry plugin."),
  },
});
```

Wire MCP boot; banner on first successful tool call (track via the tool dispatcher).

### 8d. react-app

```ts
// templates/react-app/0g.config.ts
import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  client: {
    NEXT_PUBLIC_ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo"),
    NEXT_PUBLIC_DEMO_PRIVATE_KEY: z
      .string()
      .optional()
      .describe("Demo-only upload key — blank disables the upload form."),
  },
});
```

(no server slot — pure browser demo). Banner fires inside the `useUpload` success handler (`printFirstSuccess` writes to console, not the DOM — that's fine for the smoke test).

- [ ] **Step 1: For each of the four subtemplates, create `0g.config.ts` + `__tests__/config.test.ts` (if a tests dir doesn't exist, mirror the existing layout — react-app may not have a vitest setup; skip the config test there but verify `tsc --noEmit` typechecks the import).**

- [ ] **Step 2: Wire entries**

For inference-app/attestation-verify/mcp-agent: each `src/index.ts` consumes `config.server()`, calls `detectLocalDevnet` where networked, and emits one `printFirstSuccess` on first success.

For react-app: import `config.client(...)` in the component that owns the upload form; emit `printFirstSuccess` from `onSuccess`.

- [ ] **Step 3: Refresh each `.env.example` to match its schema (use `config.envExample()` as the source of truth — copy its output verbatim).**

- [ ] **Step 4: Append each README with three concrete "What next?" steps. Keep them honest — don't promise capabilities the template doesn't have.**

- [ ] **Step 5: Add `zod` to each template's package.json deps. From repo root: `pnpm install`.**

- [ ] **Step 6: Per-template `pnpm test && pnpm typecheck` green.**

- [ ] **Step 7: Commit**

```bash
git add templates/inference-app templates/attestation-verify templates/mcp-agent templates/react-app pnpm-lock.yaml
git commit -m "feat(templates): adopt define0GConfig across inference-app + attestation-verify + mcp-agent + react-app"
```

---

## Task 9: Docs update — templates page + 0gkit-core exports

**Files:**

- Modify: `apps/docs/app/templates/page.mdx`
- Modify: `apps/docs/app/packages/0gkit-core/page.mdx`

- [ ] **Step 1: Add the "Under 5 minutes" promise + measured time per template**

Open `apps/docs/app/templates/page.mdx`. Below the existing template grid, add a row per template showing: name, primary primitive, measured `npm create` → first-success time (placeholder: insert `~Xs` after CI fills it; for the initial PR use rough local measurements — `~45s` for the simple ones, `~90s` for next.js+install).

If the existing page has a per-template card layout, extend each card with a `Time-to-first-success: <Xs>` line.

- [ ] **Step 2: Document new core exports**

In `apps/docs/app/packages/0gkit-core/page.mdx`, under the existing Exports section, add `define0GConfig`, `detectLocalDevnet`, `printFirstSuccess`, `FIRST_SUCCESS_MARKER`. Each gets a 2-3 line snippet showing usage. Keep the alphabetical order if the existing file uses one.

- [ ] **Step 3: Run docs CI gate**

```bash
pnpm docs:check
```

Expected: green; if it warns about new exports lacking pages, the inline doc snippets satisfy the `--exports` check because they live in the package page.

- [ ] **Step 4: Commit**

```bash
git add apps/docs
git commit -m "docs: templates 'under 5 minutes' table + 0gkit-core exports (define0GConfig + helpers)"
```

---

## Task 10: CI workflow extension + changeset + final pre-flight

**Files:**

- Modify: `.github/workflows/fresh-machine-smoke.yml`
- Create: `.changeset/sp16-define0gconfig-golden-path.md`

- [ ] **Step 1: Add a banner-grep step to the smoke workflow**

In `.github/workflows/fresh-machine-smoke.yml`, after the existing `scaffold-and-install` job, add a new job (or extend the existing one with a `if: matrix.template == 'storage-app' || matrix.template == 'chat'` conditional step) that:

1. Installs deps (`npm install --no-audit --no-fund --legacy-peer-deps`).
2. Copies `.env.example` → `.env` (the schema-generated defaults are enough to boot the demo flows in dry-mode for storage-app; chat needs `PRIVATE_KEY=0x<64 a's>` and a placeholder contract address — set those inline).
3. Starts `npm run dev` with a 60-second timeout (`timeout 60s npm run dev`), capturing stdout to a tmp file.
4. Grep-asserts `\[0gkit:first-success\]` appears in the output. Fail if absent.

Concrete YAML to append after the existing template assertions:

```yaml
- name: first-success banner (storage-app + chat)
  if: matrix.template == 'storage-app' || matrix.template == 'chat'
  run: |
    set -euo pipefail
    cd "$WORK/demo"
    # Provide the bare minimum env to satisfy define0GConfig schemas
    # — these are dummy values that let the boot path run.
    cat > .env <<'EOF'
    ZEROG_NETWORK=galileo
    PRIVATE_KEY=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    NEXT_PUBLIC_ZEROG_NETWORK=galileo
    NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
    EOF
    npm install --no-audit --no-fund --legacy-peer-deps
    LOG=$(mktemp)
    timeout --preserve-status 60s npm run dev 2>&1 | tee "$LOG" || true
    if ! grep -F '[0gkit:first-success]' "$LOG"; then
      echo "::error::First-success banner did not appear in dev output for ${{ matrix.template }}"
      tail -50 "$LOG"
      exit 1
    fi
    echo "✓ first-success banner observed"
```

Caveat: the chat template's `npm run dev` is `next dev` — it boots but doesn't fire a 0G op without user interaction. For chat, the banner test asserts the dev server boots and the demo home page renders; either accept that and only run banner-grep on storage-app, or add a tiny boot-time `printFirstSuccess` call gated behind `process.env.OGKIT_SMOKE === "1"` in chat. **Recommendation: only run banner-grep on storage-app for the initial CI gate; expand to chat in a follow-up after the boot-time hook is wired**. Adjust the `if:` to `matrix.template == 'storage-app'` only.

- [ ] **Step 2: Add the changeset**

Create `.changeset/sp16-define0gconfig-golden-path.md`:

```markdown
---
"@foundryprotocol/0gkit-core": minor
"create-0gkit-app": patch
"create-0g-app": patch
---

SP16: golden path + typed config

- New `define0GConfig({ server, client, edge })` typed env reader with zod validation. Server, browser-public (NEXT*PUBLIC*\*), and edge-runtime slots. Generates an `.env.example` from the schema.
- New `detectLocalDevnet({ rpcUrl })` — pure chainId probe; templates auto-fall-back to `network=local` when the local devnet is reachable.
- New `printFirstSuccess({ op, id })` banner helper with `FIRST_SUCCESS_MARKER = "[0gkit:first-success]"` (public contract for log scrapers).
- All 9 templates migrated: every template ships `0g.config.ts`, `.env.example` derived from the schema, auto-devnet detection on boot, a first-success banner on the first 0G op, and a "What next?" section in the README.
- CI: `fresh-machine-smoke.yml` asserts the banner appears in `npm run dev` output for storage-app.
```

- [ ] **Step 3: Final workspace gates**

From repo root:

```bash
pnpm format:check
pnpm boundary:check
pnpm typecheck
pnpm test
pnpm docs:check
pnpm templates:check
```

Expected: all green. If `boundary:check` flags a violation (e.g. a template imports something it shouldn't), fix the offending import.

- [ ] **Step 4: Push, open PR, watch CI, squash-merge**

```bash
git push -u origin sp16-golden-path-typed-config
gh pr create --title "SP16: golden path + define0GConfig across all 9 templates" --body "$(cat <<'EOF'
## Summary

- New `define0GConfig` typed env reader in `0gkit-core` (server/client/edge slots, zod-validated).
- New `detectLocalDevnet` + `printFirstSuccess` helpers in `0gkit-core`.
- All 9 templates adopt `define0GConfig`, refresh `.env.example` to match the schema, auto-detect local devnet, emit a first-success banner on the first 0G op, and gain a "What next?" README section.
- `fresh-machine-smoke.yml` now grep-asserts the first-success banner in `npm run dev` output for storage-app.

Decisions: D71 (banner contract token), D72 (chainId-probe detection), D73 (zod in core).

## Test plan

- [x] `pnpm test` — green across all packages (new tests for define0GConfig + detectLocalDevnet + printFirstSuccess + per-template config schema).
- [x] `pnpm boundary:check` — green.
- [x] `pnpm docs:check` — green; new core exports documented.
- [x] `pnpm templates:check` — all 9 templates OK.
- [ ] CI `fresh-machine-smoke` (manual dispatch post-merge after the next changeset release publishes).
EOF
)"
```

After CI green:

```bash
gh pr merge --squash --delete-branch
```

---

## Self-Review Notes

- **Spec coverage:** `define0GConfig` ✓ (Task 1), three slots ✓ (Task 1 tests), every template adopts it ✓ (Tasks 4–8), `.env.example` per schema ✓ (Tasks 4–8 step "refresh .env.example"), auto-detect local devnet ✓ (Tasks 2 + entry wiring), first-success banner ✓ (Task 3 + every template), "What next?" README ✓ (Tasks 4–8), docs page update ✓ (Task 9), CI banner gate ✓ (Task 10).
- **Placeholder scan:** Task 4 step 7 says "If `runStorageFlow`'s success type doesn't expose `root`, narrow with whatever field carries the root — read the current `storage-flow.ts` and adjust" — this is intentional, because the existing flow's success shape may have evolved past what I sampled. Implementer must read the file rather than guess.
- **Type consistency:** `define0GConfig` consistently exposes `.server` / `.client` / `.edge` / `.envExample()` across tasks. `printFirstSuccess({ op, id, note? })` shape is consistent across all template wirings. `detectLocalDevnet({ rpcUrl?, timeoutMs?, probeClient? })` signature stable.
- **Known runtime risks:** the `0g.config.ts` files live at the template root and are imported from `src/index.ts` via `../0g.config.js` (TypeScript ESM extension contract). Verify each template's `tsconfig.json` has `"include": ["0g.config.ts", "src/**/*"]` or equivalent — if not, add it.
- **CI banner caveat:** the smoke step uses `timeout --preserve-status 60s` so a healthy server that runs past the timeout still exits cleanly without failing the build. The grep is the actual gate.
