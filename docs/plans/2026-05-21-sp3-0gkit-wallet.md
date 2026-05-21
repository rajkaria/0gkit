# SP3 — `@foundryprotocol/0gkit-wallet` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `privateKey: string` from the developer experience. Ship two new packages — `@foundryprotocol/0gkit-wallet` (Node/universal: `Signer` interface, key loaders, SIWE) and `@foundryprotocol/0gkit-wallet-react` (browser: `ZeroGWalletProvider`, hooks via wagmi v2) — and refactor every Layer-1 primitive to accept an optional `{ signer: Signer }` ctor argument alongside the legacy `{ privateKey }` surface (which stays for one minor with a `console.warn` deprecation).

**Architecture:**

- **Layer 0 `0gkit-core`** owns the `Signer` interface (so wallet doesn't have to be imported by every primitive — a wallet → primitive → wallet edge would form a cycle through `peerDependency`). Primitives consume only the type; wallet implements it.
- **Layer 2 `0gkit-wallet`** is the Node/universal package. It depends on `viem` for signing and `@aws-sdk/client-kms` for KMS. Pure ESM, zero React.
- **Layer 2 `0gkit-wallet-react`** is the browser React adapter. It depends on `wagmi`, `viem`, and `react`. `"use client"` everywhere.
- **Refactor Layer-1**: every primitive (`0gkit-storage`, `0gkit-compute`, `0gkit-da`, `0gkit-attestation`, `0gkit-chain`) accepts `{ signer }` in addition to `{ privateKey }`. When both are absent (read-only paths) nothing changes. When `{ privateKey }` is passed, `console.warn` once with a migration hint.

**Tech Stack:** Node 20+ ESM, TypeScript 5.6, `viem ^2.21`, `@aws-sdk/client-kms ^3`, `@aws-sdk/client-mock ^4` (test), `ethereumjs-wallet ^1.0.2` (eth-keystore-v3 encrypt/decrypt), `wagmi ^2` (React adapter), `react ^18 || ^19` (peer), `@testing-library/react`, `vitest`, `tsup`. Prettier-first.

**Decisions referenced:** D7 (`0gkit-wallet` RSC-first, two-package split). I9 (no raw `privateKey` in new surfaces). New: **D11** — `Signer` lives in `0gkit-core` to keep the dependency graph acyclic.

**Depends on:** Layer 1 packages (already shipped). Pure additive on top.

**Hard invariants:**

- `0gkit-wallet` and `0gkit-wallet-react` are both under `packages/0gkit-*/` so the boundary rule (no `@foundryprotocol/*` non-0gkit deps) auto-applies. They are protocol-neutral.
- The `{ privateKey }` constructor stays. Tests cover both the old and the new ctor for every primitive that gets refactored.
- AWS KMS calls are gated behind `KMS_CREDENTIALS` env in CI; unit tests use `@aws-sdk/client-mock`.
- Coverage bar **85%** on wallet packages (key material — higher bar than 80).

---

## File Structure

**Create — `0gkit-core`:**

- `packages/0gkit-core/src/signer.ts` — `Signer` interface + `SignableTx` types (new)
- Modify: `packages/0gkit-core/src/index.ts` (export Signer types)

**Create — `0gkit-wallet`:**

- `packages/0gkit-wallet/package.json`
- `packages/0gkit-wallet/tsconfig.json`
- `packages/0gkit-wallet/tsup.config.ts`
- `packages/0gkit-wallet/vitest.config.ts`
- `packages/0gkit-wallet/README.md`
- `packages/0gkit-wallet/src/index.ts` — public exports
- `packages/0gkit-wallet/src/types.ts` — re-export `Signer`; `LoaderOptions`
- `packages/0gkit-wallet/src/local-signer.ts` — `LocalAccountSigner` (viem-backed)
- `packages/0gkit-wallet/src/from-private-key.ts` — `fromPrivateKey()`
- `packages/0gkit-wallet/src/from-env.ts` — `fromEnv()` (auto-pick across loaders)
- `packages/0gkit-wallet/src/from-file.ts` — `fromFile()` keystore v3 decrypt
- `packages/0gkit-wallet/src/from-kms.ts` — `fromKMS()` AWS KMS Signer
- `packages/0gkit-wallet/src/siwe.ts` — `generateNonce`, `buildMessage`, `verify`
- `packages/0gkit-wallet/src/__tests__/from-private-key.test.ts`
- `packages/0gkit-wallet/src/__tests__/from-file.test.ts`
- `packages/0gkit-wallet/src/__tests__/from-env.test.ts`
- `packages/0gkit-wallet/src/__tests__/from-kms.test.ts`
- `packages/0gkit-wallet/src/__tests__/siwe.test.ts`
- `packages/0gkit-wallet/src/__tests__/boundary.test.ts` — neutrality assertion

**Create — `0gkit-wallet-react`:**

- `packages/0gkit-wallet-react/package.json`
- `packages/0gkit-wallet-react/tsconfig.json`
- `packages/0gkit-wallet-react/tsup.config.ts`
- `packages/0gkit-wallet-react/vitest.config.ts`
- `packages/0gkit-wallet-react/README.md`
- `packages/0gkit-wallet-react/src/index.ts`
- `packages/0gkit-wallet-react/src/provider.tsx` — `ZeroGWalletProvider`
- `packages/0gkit-wallet-react/src/use-wallet.ts`
- `packages/0gkit-wallet-react/src/use-connect.ts`
- `packages/0gkit-wallet-react/src/use-switch-network.ts`
- `packages/0gkit-wallet-react/src/wagmi-signer.ts` — adapts wagmi account → `Signer`
- `packages/0gkit-wallet-react/src/__tests__/provider.test.tsx`
- `packages/0gkit-wallet-react/src/__tests__/hooks.test.tsx`
- `packages/0gkit-wallet-react/src/__tests__/wagmi-signer.test.ts`

**Modify — primitives:**

- `packages/0gkit-storage/src/storage.ts` — accept `{ signer }`, warn on `{ privateKey }`
- `packages/0gkit-storage/package.json` — add `@foundryprotocol/0gkit-core` dependency on Signer type (already present)
- `packages/0gkit-storage/src/__tests__/storage.test.ts` — add signer ctor coverage
- `packages/0gkit-compute/src/compute.ts` — accept `{ signer }` → adapt to ethers Wallet via signer.privateKey OR via raw signMessage when KMS
- `packages/0gkit-compute/src/__tests__/*.test.ts` — add signer ctor coverage
- `packages/0gkit-da/src/da.ts` — accept `{ signer }` (no-op today — DA is signer-less, but plumb for symmetry)
- `packages/0gkit-da/src/__tests__/*.test.ts` — assert it still works
- `packages/0gkit-attestation/src/attestation.ts` — new `signEnvelopeWithSigner(envelope, signer)` overload
- `packages/0gkit-attestation/src/__tests__/*.test.ts` — cover the overload
- `packages/0gkit-chain/src/faucet.ts` — no change (faucet doesn't sign). Re-export `Signer` for ergonomics? No — keep chain neutral.

**Modify — root:**

- `pnpm-workspace.yaml` — already globs `packages/*`
- `.github/workflows/ci.yml` — add KMS smoke gate (already has the right pattern)
- `apps/docs/app/packages/wallet/page.mdx` — new docs page
- `apps/docs/app/packages/wallet-react/page.mdx` — new docs page
- `apps/docs/app/packages/storage/page.mdx` — lead with `{ signer }`, demote `{ privateKey }` to "legacy"
- `apps/docs/app/packages/compute/page.mdx` — same
- `apps/docs/app/packages/da/page.mdx` — same
- `apps/docs/app/packages/attestation/page.mdx` — same
- `README.md` — replace Storage snippet with `Signer`-shaped example
- `docs/DECISIONS.md` — append D11
- `.changeset/sp3-0gkit-wallet.md`

---

## Task 1: `Signer` interface in `0gkit-core`

**Files:**

- Create: `packages/0gkit-core/src/signer.ts`
- Modify: `packages/0gkit-core/src/index.ts`
- Create: `packages/0gkit-core/src/__tests__/signer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/0gkit-core/src/__tests__/signer.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type { Signer, SignTypedDataArgs } from "../index.js";

describe("Signer interface (type-only)", () => {
  it("requires address + signMessage + signTypedData + sendTransaction", () => {
    expectTypeOf<Signer>().toMatchTypeOf<{
      address: string;
      signMessage: (
        bytes: Uint8Array | { raw: `0x${string}` }
      ) => Promise<`0x${string}`>;
      signTypedData: (args: SignTypedDataArgs) => Promise<`0x${string}`>;
      sendTransaction: (tx: unknown) => Promise<`0x${string}`>;
    }>();
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-core/src/signer.ts
/**
 * The neutral signer abstraction shared by every 0gkit primitive.
 *
 * Implementations live in `@foundryprotocol/0gkit-wallet`
 * (`fromPrivateKey` / `fromFile` / `fromEnv` / `fromKMS`) and
 * `@foundryprotocol/0gkit-wallet-react` (wagmi-backed).
 *
 * Primitives import only this type — they never depend on the wallet package
 * at build time, keeping the dependency graph acyclic.
 */
export interface Signer {
  /** EIP-55 checksummed address (or lowercased 0x; both accepted by recipients). */
  readonly address: `0x${string}`;

  /**
   * EIP-191 personal-sign over arbitrary bytes (or a pre-hashed `{raw}`
   * structure that matches viem's hashMessage shape).
   */
  signMessage(
    bytes: Uint8Array | { raw: `0x${string}` } | string
  ): Promise<`0x${string}`>;

  /** EIP-712 typed-data sign. */
  signTypedData(args: SignTypedDataArgs): Promise<`0x${string}`>;

  /** Broadcast a transaction. Returns the tx hash. */
  sendTransaction(tx: SignableTx): Promise<`0x${string}`>;

  /**
   * Optional: a raw private-key passthrough for legacy adapters (the existing
   * `0gkit-storage` / `0gkit-compute` paths that wrap ethers internally).
   * Loaders that hold the plaintext key (`fromPrivateKey`, `fromFile`,
   * `fromEnv` when reading PRIVATE_KEY) expose it; KMS-backed signers do not.
   */
  readonly privateKey?: `0x${string}`;

  /** Loader provenance tag — useful for logging/observability. */
  readonly source: "private-key" | "file" | "env" | "kms" | "wagmi" | "custom";
}

export interface SignTypedDataArgs {
  domain: {
    name?: string;
    version?: string;
    chainId?: number | bigint;
    verifyingContract?: `0x${string}`;
    salt?: `0x${string}`;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface SignableTx {
  to?: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  gas?: bigint;
  nonce?: number;
  chainId?: number;
}
```

```ts
// packages/0gkit-core/src/index.ts — append
export { type Signer, type SignTypedDataArgs, type SignableTx } from "./signer.js";
```

- [ ] **Step 4: Build + test + commit**

```bash
cd /Users/rajkaria/Projects/0G-ai-kit
pnpm exec prettier --write \
  packages/0gkit-core/src/signer.ts \
  packages/0gkit-core/src/index.ts \
  packages/0gkit-core/src/__tests__/signer.test.ts
pnpm --filter @foundryprotocol/0gkit-core build
pnpm --filter @foundryprotocol/0gkit-core test
git add packages/0gkit-core/src/signer.ts packages/0gkit-core/src/index.ts packages/0gkit-core/src/__tests__/signer.test.ts
git commit -m "feat(core): add neutral Signer interface for 0gkit-wallet"
```

---

## Task 2: Bootstrap `@foundryprotocol/0gkit-wallet` package

**Files:**

- Create: `packages/0gkit-wallet/package.json`
- Create: `packages/0gkit-wallet/tsconfig.json`
- Create: `packages/0gkit-wallet/tsup.config.ts`
- Create: `packages/0gkit-wallet/vitest.config.ts`
- Create: `packages/0gkit-wallet/src/index.ts`
- Create: `packages/0gkit-wallet/src/types.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@foundryprotocol/0gkit-wallet",
  "version": "0.1.0",
  "description": "Neutral wallet abstraction for 0G — Signer interface, key loaders (env/file/KMS), and SIWE helpers.",
  "license": "MIT",
  "homepage": "https://github.com/rajkaria/0G-ai-kit/tree/main/packages/0gkit-wallet",
  "repository": {
    "type": "git",
    "url": "https://github.com/rajkaria/0G-ai-kit.git",
    "directory": "packages/0gkit-wallet"
  },
  "bugs": { "url": "https://github.com/rajkaria/0G-ai-kit/issues" },
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "coverage": "vitest run --coverage",
    "lint": "depcruise src --config ../../.dependency-cruiser.cjs",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@foundryprotocol/0gkit-core": "workspace:*",
    "ethereumjs-wallet": "^1.0.2",
    "viem": "^2.21.0"
  },
  "peerDependencies": {
    "@aws-sdk/client-kms": "^3.600.0",
    "viem": "^2.21.0"
  },
  "peerDependenciesMeta": {
    "@aws-sdk/client-kms": { "optional": true }
  },
  "devDependencies": {
    "@aws-sdk/client-kms": "^3.600.0",
    "@types/node": "^22.10.2",
    "@vitest/coverage-v8": "^2.1.8",
    "aws-sdk-client-mock": "^4.0.2",
    "dependency-cruiser": "^16.0.0",
    "rimraf": "^6.0.1",
    "tsup": "^8.3.5",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  },
  "keywords": ["0g", "wallet", "signer", "siwe", "kms", "toolkit"],
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 2: `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`**

```json
// packages/0gkit-wallet/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "emitDeclarationOnly": false,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

```ts
// packages/0gkit-wallet/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "viem",
    "@foundryprotocol/0gkit-core",
    "@aws-sdk/client-kms",
    "ethereumjs-wallet",
  ],
});
```

```ts
// packages/0gkit-wallet/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/__tests__/**"],
      thresholds: {
        // Wallet touches keys — bar is 85%.
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
```

- [ ] **Step 3: `src/types.ts` + `src/index.ts` skeleton**

```ts
// packages/0gkit-wallet/src/types.ts
export type {
  Signer,
  SignTypedDataArgs,
  SignableTx,
} from "@foundryprotocol/0gkit-core";

export interface FromFileOptions {
  password: string;
}

export interface FromKMSOptions {
  keyId: string;
  region?: string;
}

export interface FromEnvOptions {
  env?: NodeJS.ProcessEnv;
}
```

```ts
// packages/0gkit-wallet/src/index.ts
export type {
  Signer,
  SignTypedDataArgs,
  SignableTx,
  FromFileOptions,
  FromKMSOptions,
  FromEnvOptions,
} from "./types.js";
export { fromPrivateKey } from "./from-private-key.js";
export { fromFile } from "./from-file.js";
export { fromEnv } from "./from-env.js";
export { fromKMS } from "./from-kms.js";
export * as siwe from "./siwe.js";
```

(Implementer note: stubs first; subsequent tasks fill the bodies. Build must
compile after each task, so create the modules empty with `throw new Error("TODO")`
and TS-narrowed return types before adding logic.)

- [ ] **Step 4: Skeleton modules**

Each of `from-private-key.ts`, `from-file.ts`, `from-env.ts`, `from-kms.ts`, `siwe.ts`,
`local-signer.ts` ships an exported stub returning the correct shape. We replace bodies
in subsequent tasks; this lets `pnpm typecheck` stay green.

```ts
// packages/0gkit-wallet/src/local-signer.ts
import type { Signer } from "@foundryprotocol/0gkit-core";
export function buildLocalSigner(
  _pk: `0x${string}`,
  _source: Signer["source"]
): Signer {
  throw new Error("buildLocalSigner: implemented in task 3");
}
```

```ts
// packages/0gkit-wallet/src/from-private-key.ts
import type { Signer } from "@foundryprotocol/0gkit-core";
export async function fromPrivateKey(_pk: string): Promise<Signer> {
  throw new Error("fromPrivateKey: implemented in task 3");
}
```

(Repeat: `fromFile`, `fromEnv`, `fromKMS` stubs; `siwe.ts` exports
`generateNonce()`, `buildMessage()`, `verify()` stubs.)

- [ ] **Step 5: Boundary test (neutrality)**

```ts
// packages/0gkit-wallet/src/__tests__/boundary.test.ts
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

describe("0gkit-wallet protocol neutrality", () => {
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
```

- [ ] **Step 6: Install + build + format + commit**

```bash
cd /Users/rajkaria/Projects/0G-ai-kit
pnpm install
pnpm exec prettier --write packages/0gkit-wallet/
pnpm --filter @foundryprotocol/0gkit-wallet build
pnpm --filter @foundryprotocol/0gkit-wallet test
git add packages/0gkit-wallet pnpm-lock.yaml
git commit -m "feat(wallet): bootstrap @foundryprotocol/0gkit-wallet package skeleton"
```

---

## Task 3: `fromPrivateKey` + viem-backed `LocalAccountSigner`

**Files:**

- Modify: `packages/0gkit-wallet/src/local-signer.ts`
- Modify: `packages/0gkit-wallet/src/from-private-key.ts`
- Create: `packages/0gkit-wallet/src/__tests__/from-private-key.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/0gkit-wallet/src/__tests__/from-private-key.test.ts
import { describe, it, expect } from "vitest";
import {
  hashTypedData,
  recoverMessageAddress,
  recoverTypedDataAddress,
  verifyMessage,
} from "viem";
import { fromPrivateKey } from "../from-private-key.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil account #1

describe("fromPrivateKey", () => {
  it("returns the matching address", async () => {
    const s = await fromPrivateKey(PK);
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(s.source).toBe("private-key");
    expect(s.privateKey).toBe(PK);
  });

  it("accepts a 0x-less private key", async () => {
    const s = await fromPrivateKey(PK.slice(2));
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it("signMessage produces a recoverable signature (bytes)", async () => {
    const s = await fromPrivateKey(PK);
    const sig = await s.signMessage(new TextEncoder().encode("gm"));
    const ok = await verifyMessage({
      address: s.address,
      message: "gm",
      signature: sig,
    });
    expect(ok).toBe(true);
  });

  it("signMessage accepts a string overload", async () => {
    const s = await fromPrivateKey(PK);
    const sig = await s.signMessage("gm");
    const recovered = await recoverMessageAddress({ message: "gm", signature: sig });
    expect(recovered.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("signTypedData round-trips", async () => {
    const s = await fromPrivateKey(PK);
    const args = {
      domain: { name: "0gkit", version: "1", chainId: 16602 },
      types: { Mail: [{ name: "body", type: "string" }] },
      primaryType: "Mail",
      message: { body: "hello" },
    };
    const sig = await s.signTypedData(args);
    const recovered = await recoverTypedDataAddress({ ...args, signature: sig });
    expect(recovered.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("rejects garbage", async () => {
    await expect(fromPrivateKey("0xnotahex")).rejects.toThrow(/private key/i);
    await expect(fromPrivateKey("")).rejects.toThrow(/private key/i);
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement `local-signer.ts`**

```ts
// packages/0gkit-wallet/src/local-signer.ts
import { privateKeyToAccount } from "viem/accounts";
import { ConfigError, type Signer, type SignableTx } from "@foundryprotocol/0gkit-core";

function normalizeHex(pk: string): `0x${string}` {
  const trimmed = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new ConfigError(
      "Invalid private key.",
      "Pass a 32-byte hex private key (with or without 0x), e.g. `cast wallet new` output."
    );
  }
  return `0x${trimmed.toLowerCase()}`;
}

/**
 * Build a Signer backed by a viem LocalAccount. The plaintext key is held in
 * `signer.privateKey` so legacy primitive adapters (ethers-based 0G SDKs) can
 * still extract it — KMS-backed signers do not expose `privateKey`.
 */
export function buildLocalSigner(pk: string, source: Signer["source"]): Signer {
  const normalized = normalizeHex(pk);
  const account = privateKeyToAccount(normalized);
  return {
    address: account.address,
    privateKey: normalized,
    source,
    async signMessage(input) {
      if (typeof input === "string") return account.signMessage({ message: input });
      if (input instanceof Uint8Array) {
        return account.signMessage({ message: { raw: bytesToHex(input) } });
      }
      // `{ raw: 0x... }` pre-hashed
      return account.signMessage({ message: input });
    },
    async signTypedData(args) {
      return account.signTypedData({
        domain: args.domain,
        types: args.types as never,
        primaryType: args.primaryType,
        message: args.message as never,
      });
    },
    async sendTransaction(_tx: SignableTx) {
      throw new ConfigError(
        "sendTransaction is not implemented on a bare LocalAccountSigner.",
        "Use the primitive's own write path (Storage.upload / Compute.inference / etc.) which builds the tx for you."
      );
    },
  };
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}
```

- [ ] **Step 4: Implement `from-private-key.ts`**

```ts
// packages/0gkit-wallet/src/from-private-key.ts
import type { Signer } from "@foundryprotocol/0gkit-core";
import { buildLocalSigner } from "./local-signer.js";

export async function fromPrivateKey(privateKey: string): Promise<Signer> {
  return buildLocalSigner(privateKey, "private-key");
}
```

- [ ] **Step 5: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-wallet/src/local-signer.ts packages/0gkit-wallet/src/from-private-key.ts packages/0gkit-wallet/src/__tests__/from-private-key.test.ts
pnpm --filter @foundryprotocol/0gkit-wallet test from-private-key
git add packages/0gkit-wallet/src/local-signer.ts packages/0gkit-wallet/src/from-private-key.ts packages/0gkit-wallet/src/__tests__/from-private-key.test.ts
git commit -m "feat(wallet): fromPrivateKey() + viem-backed LocalAccountSigner"
```

---

## Task 4: `fromFile` (eth-keystore-v3)

**Files:**

- Modify: `packages/0gkit-wallet/src/from-file.ts`
- Create: `packages/0gkit-wallet/src/__tests__/from-file.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Wallet from "ethereumjs-wallet";
import { fromFile } from "../from-file.js";

async function makeKeystore(pk: string, password: string): Promise<{ path: string }> {
  const dir = mkdtempSync(join(tmpdir(), "wallet-test-"));
  const w = Wallet.fromPrivateKey(Buffer.from(pk.replace(/^0x/, ""), "hex"));
  const json = await w.toV3(password, { kdf: "scrypt", n: 2 }); // n=2 keeps the test fast
  const file = join(dir, "key.json");
  writeFileSync(file, JSON.stringify(json));
  return { path: file };
}

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("fromFile", () => {
  it("decrypts a keystore-v3 and returns a Signer", async () => {
    const { path } = await makeKeystore(PK, "hunter2");
    const s = await fromFile(path, { password: "hunter2" });
    expect(s.address).toBeDefined();
    expect(s.source).toBe("file");
    expect(s.privateKey).toBe(PK);
  });

  it("rejects with a helpful ConfigError on bad password", async () => {
    const { path } = await makeKeystore(PK, "right");
    await expect(fromFile(path, { password: "wrong" })).rejects.toMatchObject({
      code: "CONFIG",
    });
  });

  it("rejects with ConfigError on missing file", async () => {
    await expect(fromFile("/no/such/file", { password: "x" })).rejects.toMatchObject({
      code: "CONFIG",
    });
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-wallet/src/from-file.ts
import { readFileSync } from "node:fs";
import Wallet from "ethereumjs-wallet";
import { ConfigError, type Signer } from "@foundryprotocol/0gkit-core";
import { buildLocalSigner } from "./local-signer.js";
import type { FromFileOptions } from "./types.js";

export async function fromFile(path: string, opts: FromFileOptions): Promise<Signer> {
  let json: string;
  try {
    json = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Could not read keystore at ${path}: ${err instanceof Error ? err.message : String(err)}.`,
      "Pass an absolute path to a Web3 secret-storage (keystore-v3) JSON file."
    );
  }
  let wallet: Wallet;
  try {
    wallet = await Wallet.fromV3(json, opts.password, true);
  } catch (err) {
    throw new ConfigError(
      `Keystore decrypt failed: ${err instanceof Error ? err.message : String(err)}.`,
      "Check the password — or confirm the file is a valid keystore-v3 JSON (`crypto.cipher`, `kdf`, etc.)."
    );
  }
  const pk = `0x${wallet.getPrivateKey().toString("hex")}`;
  return buildLocalSigner(pk, "file");
}
```

- [ ] **Step 4: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-wallet/src/from-file.ts packages/0gkit-wallet/src/__tests__/from-file.test.ts
pnpm --filter @foundryprotocol/0gkit-wallet test from-file
git add packages/0gkit-wallet/src/from-file.ts packages/0gkit-wallet/src/__tests__/from-file.test.ts
git commit -m "feat(wallet): fromFile() — keystore-v3 decrypt via ethereumjs-wallet"
```

---

## Task 5: `fromEnv` (loader auto-pick)

**Files:**

- Modify: `packages/0gkit-wallet/src/from-env.ts`
- Create: `packages/0gkit-wallet/src/__tests__/from-env.test.ts`

- [ ] **Step 1: Write failing tests**

Auto-pick order: `KMS_KEY_ID` → `KEY_FILE` + `KEY_PASSWORD` → `PRIVATE_KEY`. The first
match wins. If none set, throw a clear `ConfigError`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Wallet from "ethereumjs-wallet";
import { fromEnv } from "../from-env.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("fromEnv", () => {
  it("picks PRIVATE_KEY when set", async () => {
    const s = await fromEnv({ env: { PRIVATE_KEY: PK } });
    expect(s.source).toBe("env");
    expect(s.privateKey).toBe(PK);
  });

  it("picks KEY_FILE + KEY_PASSWORD when set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fromenv-"));
    const w = Wallet.fromPrivateKey(Buffer.from(PK.slice(2), "hex"));
    const json = await w.toV3("pw", { kdf: "scrypt", n: 2 });
    const path = join(dir, "k.json");
    writeFileSync(path, JSON.stringify(json));
    const s = await fromEnv({ env: { KEY_FILE: path, KEY_PASSWORD: "pw" } });
    expect(s.source).toBe("env");
    expect(s.privateKey).toBe(PK);
  });

  it("prefers KMS_KEY_ID over PRIVATE_KEY", async () => {
    // We can't actually contact KMS in this unit test, but we can assert
    // the loader attempts KMS first by mocking @aws-sdk/client-kms to fail
    // with a recognisable signature.
    await expect(
      fromEnv({
        env: { KMS_KEY_ID: "arn:aws:kms:us-east-1:000:key/abc", PRIVATE_KEY: PK },
      })
    ).rejects.toMatchObject({ code: "CONFIG", message: expect.stringMatching(/KMS/i) });
  });

  it("throws when nothing is set", async () => {
    await expect(fromEnv({ env: {} })).rejects.toMatchObject({ code: "CONFIG" });
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-wallet/src/from-env.ts
import { ConfigError, type Signer } from "@foundryprotocol/0gkit-core";
import { fromPrivateKey } from "./from-private-key.js";
import { fromFile } from "./from-file.js";
import { fromKMS } from "./from-kms.js";
import type { FromEnvOptions } from "./types.js";

export async function fromEnv(opts: FromEnvOptions = {}): Promise<Signer> {
  const env = opts.env ?? process.env;

  if (env.KMS_KEY_ID) {
    try {
      return await fromKMS({
        keyId: env.KMS_KEY_ID,
        region: env.AWS_REGION ?? env.KMS_REGION,
      });
    } catch (err) {
      // Surface the KMS-specific reason rather than silently falling through.
      throw new ConfigError(
        `KMS_KEY_ID was set but fromKMS() failed: ${err instanceof Error ? err.message : String(err)}.`,
        "Verify AWS credentials, network reachability, and that the key allows sign/get-public-key."
      );
    }
  }

  if (env.KEY_FILE) {
    if (!env.KEY_PASSWORD) {
      throw new ConfigError(
        "KEY_FILE is set but KEY_PASSWORD is not.",
        "Set KEY_PASSWORD to the password used to encrypt the keystore-v3 file."
      );
    }
    const signer = await fromFile(env.KEY_FILE, { password: env.KEY_PASSWORD });
    return tagSource(signer);
  }

  if (env.PRIVATE_KEY) {
    return tagSource(await fromPrivateKey(env.PRIVATE_KEY));
  }

  throw new ConfigError(
    "No wallet credentials found in env.",
    "Set one of: PRIVATE_KEY (hex), KEY_FILE + KEY_PASSWORD (keystore-v3), KMS_KEY_ID (AWS KMS arn)."
  );
}

/** Preserve loader provenance ("env") while delegating to a sub-loader. */
function tagSource(s: Signer): Signer {
  return { ...s, source: "env" };
}
```

- [ ] **Step 4: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-wallet/src/from-env.ts packages/0gkit-wallet/src/__tests__/from-env.test.ts
pnpm --filter @foundryprotocol/0gkit-wallet test from-env
git add packages/0gkit-wallet/src/from-env.ts packages/0gkit-wallet/src/__tests__/from-env.test.ts
git commit -m "feat(wallet): fromEnv() — auto-pick KMS / file / privateKey loaders"
```

---

## Task 6: `fromKMS` (AWS KMS-backed Signer)

**Files:**

- Modify: `packages/0gkit-wallet/src/from-kms.ts`
- Create: `packages/0gkit-wallet/src/__tests__/from-kms.test.ts`

KMS signing implementation: we ask KMS to produce an ECDSA signature over the
keccak-256 of the EIP-191 / EIP-712 hash. The public key is fetched once via
`GetPublicKeyCommand` (SPKI-encoded; we strip the DER header to recover the
65-byte uncompressed point, drop the leading `0x04`, keccak the remaining 64
bytes, take the last 20 — that's the address). For ECDSA recovery we try both
`v=27` and `v=28` and keep the one that recovers our known address.

- [ ] **Step 1: Failing tests (mocked)**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import {
  recoverMessageAddress,
  recoverTypedDataAddress,
  privateKeyToAddress,
  signatureToHex,
} from "viem";
import { privateKeyToAccount, sign as signHash } from "viem/accounts";
import { fromKMS } from "../from-kms.js";

// Helper: produce an SPKI-DER uncompressed public key from a known private key
// so we can drive the mock end-to-end.
import { secp256k1 } from "@noble/curves/secp256k1";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDRESS = privateKeyToAddress(PK);

function spkiDerFromPrivateKey(pk: string): Uint8Array {
  // SPKI prefix for secp256k1 EC public key (23 bytes) + 65-byte uncompressed point.
  const SPKI_PREFIX = new Uint8Array([
    0x30, 0x56, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
    0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, 0x03, 0x42, 0x00,
  ]);
  const point = secp256k1.getPublicKey(pk.slice(2), false); // uncompressed, 65 bytes
  const out = new Uint8Array(SPKI_PREFIX.length + point.length);
  out.set(SPKI_PREFIX, 0);
  out.set(point, SPKI_PREFIX.length);
  return out;
}

// Produce a KMS-shaped DER ECDSA signature over a hash, using our known key.
async function kmsSignDer(hashHex: `0x${string}`): Promise<Uint8Array> {
  const sigCompact = secp256k1.sign(hashHex.slice(2), PK.slice(2), {
    lowS: true,
  });
  // ASN.1 SEQUENCE { r INTEGER, s INTEGER } — minimal encoding.
  const r = trimZeros(sigCompact.toCompactRawBytes().slice(0, 32));
  const s = trimZeros(sigCompact.toCompactRawBytes().slice(32, 64));
  const seq = new Uint8Array(2 + 2 + r.length + 2 + s.length);
  let i = 0;
  seq[i++] = 0x30;
  seq[i++] = 2 + r.length + 2 + s.length;
  seq[i++] = 0x02;
  seq[i++] = r.length;
  seq.set(r, i);
  i += r.length;
  seq[i++] = 0x02;
  seq[i++] = s.length;
  seq.set(s, i);
  return seq;
}
function trimZeros(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && b[i + 1] < 0x80) i++;
  let out = b.slice(i);
  if (out[0] >= 0x80) out = new Uint8Array([0, ...out]); // pad to keep positive
  return out;
}

const kmsMock = mockClient(KMSClient);

beforeEach(() => {
  kmsMock.reset();
  kmsMock.on(GetPublicKeyCommand).resolves({ PublicKey: spkiDerFromPrivateKey(PK) });
  kmsMock.on(SignCommand).callsFake(async (input) => ({
    Signature: await kmsSignDer(
      `0x${Buffer.from(input.Message as Uint8Array).toString("hex")}` as `0x${string}`
    ),
  }));
});

describe("fromKMS (mocked)", () => {
  it("derives the correct address from KMS GetPublicKey", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(s.source).toBe("kms");
    expect(s.privateKey).toBeUndefined();
  });

  it("signMessage returns a signature that recovers the same address", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const sig = await s.signMessage("gm");
    const rec = await recoverMessageAddress({ message: "gm", signature: sig });
    expect(rec.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("signTypedData returns a recoverable signature", async () => {
    const s = await fromKMS({ keyId: "arn:aws:kms:us-east-1:000:key/abc" });
    const args = {
      domain: { name: "0gkit", version: "1", chainId: 16602 },
      types: { Mail: [{ name: "body", type: "string" }] },
      primaryType: "Mail",
      message: { body: "hello" },
    };
    const sig = await s.signTypedData(args);
    const rec = await recoverTypedDataAddress({ ...args, signature: sig });
    expect(rec.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("propagates KMS errors as ConfigError", async () => {
    kmsMock.reset();
    kmsMock.on(GetPublicKeyCommand).rejects(new Error("AccessDeniedException"));
    await expect(fromKMS({ keyId: "arn:bad" })).rejects.toMatchObject({
      code: "CONFIG",
    });
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-wallet/src/from-kms.ts
import {
  KMSClient,
  GetPublicKeyCommand,
  SignCommand,
  MessageType,
  SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import { hashMessage, hashTypedData, keccak256, toHex, type Hex } from "viem";
import {
  ConfigError,
  type Signer,
  type SignTypedDataArgs,
  type SignableTx,
} from "@foundryprotocol/0gkit-core";
import type { FromKMSOptions } from "./types.js";

/**
 * KMS-backed Signer. The plaintext key never leaves AWS; we ask KMS to
 * produce ECDSA signatures and lift them into the EIP-155 (r, s, v) shape
 * Ethereum recovers from. `privateKey` is intentionally undefined so legacy
 * primitive adapters fall back to a non-key path (e.g. ethers `Signer`-shape
 * wrap that delegates `signMessage`/`signTypedData` to us).
 */
export async function fromKMS(opts: FromKMSOptions): Promise<Signer> {
  let client: KMSClient;
  try {
    client = new KMSClient({ region: opts.region ?? process.env.AWS_REGION });
  } catch (err) {
    throw new ConfigError(
      `Failed to construct KMSClient: ${err instanceof Error ? err.message : String(err)}.`,
      "Install @aws-sdk/client-kms and provide AWS credentials (env, profile, or IAM role)."
    );
  }

  let publicKeyDer: Uint8Array;
  try {
    const r = await client.send(new GetPublicKeyCommand({ KeyId: opts.keyId }));
    if (!r.PublicKey) throw new Error("KMS GetPublicKey returned no PublicKey");
    publicKeyDer = r.PublicKey;
  } catch (err) {
    throw new ConfigError(
      `KMS GetPublicKey(${opts.keyId}) failed: ${err instanceof Error ? err.message : String(err)}.`,
      "Verify the KMS key id, the IAM principal can kms:GetPublicKey, and the key spec is ECC_SECG_P256K1."
    );
  }

  const address = addressFromSpki(publicKeyDer);

  async function kmsSign(hash: Hex): Promise<Hex> {
    let der: Uint8Array;
    try {
      const r = await client.send(
        new SignCommand({
          KeyId: opts.keyId,
          Message: hexToBytes(hash),
          MessageType: MessageType.DIGEST,
          SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
        })
      );
      if (!r.Signature) throw new Error("KMS Sign returned no Signature");
      der = r.Signature;
    } catch (err) {
      throw new ConfigError(
        `KMS Sign failed: ${err instanceof Error ? err.message : String(err)}.`,
        "Confirm the IAM principal has kms:Sign and the key is enabled."
      );
    }
    const { r, s } = decodeDerEcdsa(der);
    // Normalise to low-s (BIP-62 / EIP-2). KMS already returns lowS when the
    // signing algorithm is configured that way, but cheap to reassert.
    const sLowered = normaliseLowS(s);
    // Try v=27 / v=28 and pick the one that recovers our known address.
    for (const v of [27n, 28n]) {
      const sig = encodeSignature(r, sLowered, v);
      const { recoverAddress } = await import("viem");
      const recovered = await recoverAddress({ hash, signature: sig });
      if (recovered.toLowerCase() === address.toLowerCase()) return sig;
    }
    throw new ConfigError(
      "KMS signature did not recover the expected address.",
      "This usually means the public key returned by KMS does not match the signing key — file a bug."
    );
  }

  return {
    address,
    source: "kms",
    async signMessage(input) {
      const hash =
        typeof input === "string"
          ? hashMessage(input)
          : input instanceof Uint8Array
            ? hashMessage({ raw: bytesToHex(input) })
            : hashMessage(input);
      return kmsSign(hash);
    },
    async signTypedData(args: SignTypedDataArgs) {
      const hash = hashTypedData({
        domain: args.domain,
        types: args.types as never,
        primaryType: args.primaryType,
        message: args.message as never,
      });
      return kmsSign(hash);
    },
    async sendTransaction(_tx: SignableTx): Promise<`0x${string}`> {
      throw new ConfigError(
        "sendTransaction is not implemented for KMS signers.",
        "Use the primitive's own write path (Storage.upload / Compute.inference / etc.) which builds the tx for you."
      );
    },
  };
}

/* ---- helpers ---- */

const SPKI_HEADER_LEN = 23; // see secp256k1 SPKI prefix
function addressFromSpki(spki: Uint8Array): `0x${string}` {
  if (spki.length !== SPKI_HEADER_LEN + 65) {
    throw new ConfigError(
      `KMS PublicKey has unexpected length ${spki.length} (expected ${SPKI_HEADER_LEN + 65}).`,
      "The KMS key is not an ECC_SECG_P256K1 (secp256k1) key. Create one with KeySpec=ECC_SECG_P256K1."
    );
  }
  const point = spki.slice(SPKI_HEADER_LEN); // 0x04 || X(32) || Y(32)
  if (point[0] !== 0x04) {
    throw new ConfigError(
      `KMS PublicKey is not in uncompressed form.`,
      "Re-create the KMS key as ECC_SECG_P256K1; uncompressed is the default."
    );
  }
  const xy = point.slice(1);
  const hash = keccak256(bytesToHex(xy));
  return `0x${hash.slice(-40)}` as `0x${string}`;
}

function decodeDerEcdsa(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error("Bad DER signature");
  // SEQUENCE [length] 0x02 [rLen] r 0x02 [sLen] s
  let i = 2;
  if (der[i] !== 0x02) throw new Error("Bad DER signature (r)");
  const rLen = der[i + 1];
  const r = bytesToBigInt(der.slice(i + 2, i + 2 + rLen));
  i += 2 + rLen;
  if (der[i] !== 0x02) throw new Error("Bad DER signature (s)");
  const sLen = der[i + 1];
  const s = bytesToBigInt(der.slice(i + 2, i + 2 + sLen));
  return { r, s };
}

const SECP_N = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
);
function normaliseLowS(s: bigint): bigint {
  return s > SECP_N / 2n ? SECP_N - s : s;
}

function encodeSignature(r: bigint, s: bigint, v: bigint): `0x${string}` {
  const rh = r.toString(16).padStart(64, "0");
  const sh = s.toString(16).padStart(64, "0");
  const vh = v.toString(16).padStart(2, "0");
  return `0x${rh}${sh}${vh}` as `0x${string}`;
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const h = hex.slice(2);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return n;
}
```

- [ ] **Step 4: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-wallet/src/from-kms.ts packages/0gkit-wallet/src/__tests__/from-kms.test.ts
pnpm --filter @foundryprotocol/0gkit-wallet test from-kms
git add packages/0gkit-wallet/src/from-kms.ts packages/0gkit-wallet/src/__tests__/from-kms.test.ts
git commit -m "feat(wallet): fromKMS() — AWS KMS-backed Signer (secp256k1, EIP-191/712)"
```

---

## Task 7: SIWE — nonce + verify

**Files:**

- Modify: `packages/0gkit-wallet/src/siwe.ts`
- Create: `packages/0gkit-wallet/src/__tests__/siwe.test.ts`

SIWE follows [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361). We DON'T pull
in `siwe` from npm; we implement the message format + verify ourselves so
there's zero extra dep weight.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import * as siwe from "../siwe.js";
import { fromPrivateKey } from "../from-private-key.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("siwe.generateNonce", () => {
  it("returns a 17-char alphanumeric string per spec", () => {
    const n = siwe.generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9]{17,}$/);
  });
  it("returns unique nonces", () => {
    const a = siwe.generateNonce();
    const b = siwe.generateNonce();
    expect(a).not.toBe(b);
  });
});

describe("siwe.buildMessage + siwe.verify", () => {
  it("a self-signed message verifies", async () => {
    const signer = await fromPrivateKey(PK);
    const nonce = siwe.generateNonce();
    const message = siwe.buildMessage({
      domain: "0gkit.dev",
      address: signer.address,
      uri: "https://0gkit.dev/login",
      nonce,
      chainId: 16602,
      statement: "Sign in with 0G.",
      issuedAt: new Date("2026-05-21T00:00:00Z"),
    });
    const signature = await signer.signMessage(message);
    const r = await siwe.verify({ message, signature, expectedNonce: nonce });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.address.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it("returns ok:false for a nonce mismatch", async () => {
    const signer = await fromPrivateKey(PK);
    const nonce = siwe.generateNonce();
    const message = siwe.buildMessage({
      domain: "0gkit.dev",
      address: signer.address,
      uri: "https://0gkit.dev/login",
      nonce,
      chainId: 16602,
      issuedAt: new Date("2026-05-21T00:00:00Z"),
    });
    const signature = await signer.signMessage(message);
    const r = await siwe.verify({
      message,
      signature,
      expectedNonce: "differentnonce",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/nonce/i);
  });

  it("returns ok:false for a tampered message body", async () => {
    const signer = await fromPrivateKey(PK);
    const nonce = siwe.generateNonce();
    const message = siwe.buildMessage({
      domain: "0gkit.dev",
      address: signer.address,
      uri: "https://0gkit.dev/login",
      nonce,
      chainId: 16602,
      issuedAt: new Date("2026-05-21T00:00:00Z"),
    });
    const signature = await signer.signMessage(message);
    const tampered = message.replace("0gkit.dev", "evil.example");
    const r = await siwe.verify({ message: tampered, signature, expectedNonce: nonce });
    expect(r.ok).toBe(false);
  });

  it("returns ok:false when expirationTime has passed", async () => {
    const signer = await fromPrivateKey(PK);
    const nonce = siwe.generateNonce();
    const message = siwe.buildMessage({
      domain: "0gkit.dev",
      address: signer.address,
      uri: "https://0gkit.dev/login",
      nonce,
      chainId: 16602,
      issuedAt: new Date("2026-05-01T00:00:00Z"),
      expirationTime: new Date("2026-05-02T00:00:00Z"),
    });
    const signature = await signer.signMessage(message);
    const r = await siwe.verify({
      message,
      signature,
      expectedNonce: nonce,
      now: new Date("2026-05-20T00:00:00Z"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/expired/i);
  });
});
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-wallet/src/siwe.ts
import { recoverMessageAddress, type Hex } from "viem";
import { randomBytes } from "node:crypto";

export interface BuildMessageArgs {
  domain: string;
  address: `0x${string}`;
  uri: string;
  nonce: string;
  chainId: number;
  version?: "1";
  statement?: string;
  issuedAt?: Date;
  expirationTime?: Date;
  notBefore?: Date;
  requestId?: string;
  resources?: string[];
}

export interface VerifyArgs {
  message: string;
  signature: Hex;
  expectedNonce?: string;
  now?: Date;
}

export type VerifyResult =
  | { ok: true; address: `0x${string}`; fields: ParsedSiwe }
  | { ok: false; reason: string };

export interface ParsedSiwe {
  domain: string;
  address: `0x${string}`;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

/** EIP-4361 nonce: 17+ alphanumeric chars from a CSPRNG. */
export function generateNonce(): string {
  const bytes = randomBytes(13);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return (
    out +
    alphabet[(bytes[0] ^ bytes[12]) % alphabet.length] +
    alphabet[Date.now() % alphabet.length] +
    alphabet[(Date.now() >> 8) % alphabet.length] +
    alphabet[(Date.now() >> 16) % alphabet.length]
  );
}

/** EIP-4361 message body (exact byte layout). */
export function buildMessage(args: BuildMessageArgs): string {
  const lines: string[] = [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
  ];
  if (args.statement) {
    lines.push(args.statement, "");
  }
  lines.push(`URI: ${args.uri}`);
  lines.push(`Version: ${args.version ?? "1"}`);
  lines.push(`Chain ID: ${args.chainId}`);
  lines.push(`Nonce: ${args.nonce}`);
  lines.push(`Issued At: ${(args.issuedAt ?? new Date()).toISOString()}`);
  if (args.expirationTime)
    lines.push(`Expiration Time: ${args.expirationTime.toISOString()}`);
  if (args.notBefore) lines.push(`Not Before: ${args.notBefore.toISOString()}`);
  if (args.requestId) lines.push(`Request ID: ${args.requestId}`);
  if (args.resources && args.resources.length > 0) {
    lines.push("Resources:");
    for (const r of args.resources) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}

const HEADER_REGEX =
  /^(?<domain>[^\s]+) wants you to sign in with your Ethereum account:\n(?<address>0x[0-9a-fA-F]{40})\n\n(?:(?<statement>[^\n]+(?:\n[^\n]+)*)\n\n)?URI: (?<uri>[^\n]+)\nVersion: (?<version>[^\n]+)\nChain ID: (?<chainId>\d+)\nNonce: (?<nonce>[^\n]+)\nIssued At: (?<issuedAt>[^\n]+)(?:\nExpiration Time: (?<expirationTime>[^\n]+))?(?:\nNot Before: (?<notBefore>[^\n]+))?(?:\nRequest ID: (?<requestId>[^\n]+))?(?:\nResources:\n(?<resources>(?:- [^\n]+\n?)+))?$/;

export function parse(message: string): ParsedSiwe | null {
  const m = HEADER_REGEX.exec(message);
  if (!m?.groups) return null;
  const g = m.groups;
  return {
    domain: g.domain,
    address: g.address as `0x${string}`,
    statement: g.statement,
    uri: g.uri,
    version: g.version,
    chainId: parseInt(g.chainId, 10),
    nonce: g.nonce,
    issuedAt: g.issuedAt,
    expirationTime: g.expirationTime,
    notBefore: g.notBefore,
    requestId: g.requestId,
    resources: g.resources
      ? g.resources
          .split("\n")
          .map((l) => l.replace(/^- /, "").trim())
          .filter(Boolean)
      : undefined,
  };
}

export async function verify(args: VerifyArgs): Promise<VerifyResult> {
  const parsed = parse(args.message);
  if (!parsed) return { ok: false, reason: "Message does not match EIP-4361 grammar." };

  if (args.expectedNonce && parsed.nonce !== args.expectedNonce) {
    return { ok: false, reason: `Nonce mismatch (expected ${args.expectedNonce}).` };
  }

  const now = args.now ?? new Date();
  if (parsed.expirationTime && new Date(parsed.expirationTime) <= now) {
    return { ok: false, reason: `Message expired at ${parsed.expirationTime}.` };
  }
  if (parsed.notBefore && new Date(parsed.notBefore) > now) {
    return { ok: false, reason: `Message not valid before ${parsed.notBefore}.` };
  }

  let recovered: `0x${string}`;
  try {
    recovered = await recoverMessageAddress({
      message: args.message,
      signature: args.signature,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `Signature recovery failed: ${err instanceof Error ? err.message : String(err)}.`,
    };
  }

  if (recovered.toLowerCase() !== parsed.address.toLowerCase()) {
    return {
      ok: false,
      reason: `Signature does not match the address declared in the message (got ${recovered}, expected ${parsed.address}).`,
    };
  }

  return { ok: true, address: recovered, fields: parsed };
}
```

- [ ] **Step 4: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-wallet/src/siwe.ts packages/0gkit-wallet/src/__tests__/siwe.test.ts
pnpm --filter @foundryprotocol/0gkit-wallet test siwe
git add packages/0gkit-wallet/src/siwe.ts packages/0gkit-wallet/src/__tests__/siwe.test.ts
git commit -m "feat(wallet): SIWE — EIP-4361 nonce/buildMessage/verify"
```

---

## Task 8: Bootstrap `@foundryprotocol/0gkit-wallet-react`

**Files:**

- Create: `packages/0gkit-wallet-react/package.json` / `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`
- Create: `packages/0gkit-wallet-react/src/index.ts`
- Create: `packages/0gkit-wallet-react/src/wagmi-signer.ts`
- Create: `packages/0gkit-wallet-react/src/provider.tsx`
- Create: `packages/0gkit-wallet-react/src/use-wallet.ts`
- Create: `packages/0gkit-wallet-react/src/use-connect.ts`
- Create: `packages/0gkit-wallet-react/src/use-switch-network.ts`
- Create: tests `provider.test.tsx`, `hooks.test.tsx`, `wagmi-signer.test.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@foundryprotocol/0gkit-wallet-react",
  "version": "0.1.0",
  "description": "React adapter for @foundryprotocol/0gkit-wallet — ZeroGWalletProvider + hooks backed by wagmi v2.",
  "license": "MIT",
  "homepage": "https://github.com/rajkaria/0G-ai-kit/tree/main/packages/0gkit-wallet-react",
  "repository": {
    "type": "git",
    "url": "https://github.com/rajkaria/0G-ai-kit.git",
    "directory": "packages/0gkit-wallet-react"
  },
  "bugs": { "url": "https://github.com/rajkaria/0G-ai-kit/issues" },
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "coverage": "vitest run --coverage",
    "lint": "depcruise src --config ../../.dependency-cruiser.cjs",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@foundryprotocol/0gkit-core": "workspace:*",
    "@foundryprotocol/0gkit-wallet": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18 || ^19",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0",
    "@tanstack/react-query": "^5.59.0"
  },
  "devDependencies": {
    "@tanstack/react-query": "^5.59.0",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/coverage-v8": "^2.1.8",
    "dependency-cruiser": "^16.0.0",
    "jsdom": "^25.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "rimraf": "^6.0.1",
    "tsup": "^8.3.5",
    "typescript": "^5.6.3",
    "viem": "^2.21.0",
    "vitest": "^2.1.8",
    "wagmi": "^2.12.0"
  },
  "keywords": ["0g", "wallet", "react", "wagmi", "siwe"],
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 2: `tsconfig.json` (jsx-react), tsup, vitest (jsdom + 85% bar)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "emitDeclarationOnly": false,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

```ts
// tsup.config.ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "react",
    "viem",
    "wagmi",
    "@tanstack/react-query",
    "@foundryprotocol/0gkit-core",
    "@foundryprotocol/0gkit-wallet",
  ],
});
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/index.ts", "src/__tests__/**"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
```

- [ ] **Step 3: `src/wagmi-signer.ts` — adapt wagmi account to our `Signer`**

```ts
// packages/0gkit-wallet-react/src/wagmi-signer.ts
import type {
  Signer,
  SignTypedDataArgs,
  SignableTx,
} from "@foundryprotocol/0gkit-core";

/** Minimal subset of wagmi's `useAccount` + actions we depend on. */
export interface WagmiAccountAdapter {
  address: `0x${string}` | undefined;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
  signTypedDataAsync: (args: SignTypedDataArgs) => Promise<`0x${string}`>;
  sendTransactionAsync: (tx: SignableTx) => Promise<`0x${string}`>;
}

/** Build a Signer from a connected wagmi account. Returns null when disconnected. */
export function adaptWagmi(adapter: WagmiAccountAdapter): Signer | null {
  if (!adapter.address) return null;
  return {
    address: adapter.address,
    source: "wagmi",
    async signMessage(input) {
      const message =
        typeof input === "string"
          ? input
          : input instanceof Uint8Array
            ? new TextDecoder().decode(input)
            : input.raw;
      return adapter.signMessageAsync({ message });
    },
    async signTypedData(args) {
      return adapter.signTypedDataAsync(args);
    },
    async sendTransaction(tx) {
      return adapter.sendTransactionAsync(tx);
    },
  };
}
```

- [ ] **Step 4: `src/provider.tsx`, `use-wallet.ts`, `use-connect.ts`, `use-switch-network.ts`**

```tsx
// packages/0gkit-wallet-react/src/provider.tsx
"use client";

import { ReactNode, useMemo } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export type ZeroGNetwork = "galileo" | "aristotle" | "local";
export type ZeroGConnectorId = "injected" | "walletConnect";

export interface ZeroGWalletConfig {
  network: ZeroGNetwork;
  connectors?: ZeroGConnectorId[];
  walletConnectProjectId?: string;
}

const CHAINS = {
  galileo: defineChain({
    id: 16602,
    name: "0G Galileo",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  }),
  aristotle: defineChain({
    id: 16661,
    name: "0G Aristotle",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  }),
  local: defineChain({
    id: 31337,
    name: "0G Local",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  }),
} as const;

export function ZeroGWalletProvider(props: {
  config: ZeroGWalletConfig;
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const wagmiConfig = useMemo(() => {
    const chain = CHAINS[props.config.network];
    const wanted = props.config.connectors ?? ["injected"];
    const connectors = wanted.map((id) => {
      if (id === "injected") return injected();
      if (id === "walletConnect") {
        if (!props.config.walletConnectProjectId) {
          throw new Error(
            "ZeroGWalletProvider: walletConnect connector requires walletConnectProjectId."
          );
        }
        return walletConnect({ projectId: props.config.walletConnectProjectId });
      }
      throw new Error(`ZeroGWalletProvider: unknown connector "${id}"`);
    });
    return createConfig({
      chains: [chain],
      connectors,
      transports: { [chain.id]: http(chain.rpcUrls.default.http[0]) },
    });
  }, [props.config]);

  const qc = useMemo(() => props.queryClient ?? new QueryClient(), [props.queryClient]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{props.children}</QueryClientProvider>
    </WagmiProvider>
  );
}
```

```ts
// packages/0gkit-wallet-react/src/use-wallet.ts
"use client";

import { useMemo } from "react";
import {
  useAccount,
  useDisconnect,
  useSignMessage,
  useSignTypedData,
  useSendTransaction,
} from "wagmi";
import type { Signer } from "@foundryprotocol/0gkit-core";
import { adaptWagmi } from "./wagmi-signer.js";

export interface UseWalletResult {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  signer: Signer | null;
  disconnect: () => void;
}

export function useWallet(): UseWalletResult {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const { disconnect } = useDisconnect();

  const signer = useMemo(
    () =>
      adaptWagmi({
        address,
        signMessageAsync: (args) => signMessageAsync(args),
        signTypedDataAsync: (args) =>
          signTypedDataAsync(args as never) as Promise<`0x${string}`>,
        sendTransactionAsync: (tx) => sendTransactionAsync(tx as never),
      }),
    [address, signMessageAsync, signTypedDataAsync, sendTransactionAsync]
  );

  return { address, isConnected, signer, disconnect };
}
```

```ts
// packages/0gkit-wallet-react/src/use-connect.ts
"use client";
import { useConnect as useWagmiConnect } from "wagmi";

export function useConnect() {
  const { connectAsync, connectors, isPending, error, reset } = useWagmiConnect();
  return {
    connect: (connectorId?: string) => {
      const c = connectorId
        ? connectors.find((x) => x.id === connectorId || x.type === connectorId)
        : connectors[0];
      if (!c) throw new Error(`No connector found for "${connectorId}".`);
      return connectAsync({ connector: c });
    },
    connectors,
    isPending,
    error,
    reset,
  };
}
```

```ts
// packages/0gkit-wallet-react/src/use-switch-network.ts
"use client";
import { useSwitchChain } from "wagmi";

export function useSwitchNetwork() {
  const { switchChainAsync, isPending, error } = useSwitchChain();
  return {
    switchNetwork: (chainId: number) => switchChainAsync({ chainId }),
    isPending,
    error,
  };
}
```

- [ ] **Step 5: `src/index.ts`**

```ts
export {
  ZeroGWalletProvider,
  type ZeroGWalletConfig,
  type ZeroGNetwork,
  type ZeroGConnectorId,
} from "./provider.js";
export { useWallet, type UseWalletResult } from "./use-wallet.js";
export { useConnect } from "./use-connect.js";
export { useSwitchNetwork } from "./use-switch-network.js";
export { adaptWagmi, type WagmiAccountAdapter } from "./wagmi-signer.js";
```

- [ ] **Step 6: Tests — `wagmi-signer.test.ts` (pure, no React) + `provider.test.tsx` (mount) + `hooks.test.tsx` (uses a mocked wagmi context via `vi.mock`)**

The mocked-wagmi pattern: `vi.mock("wagmi", () => ({...}))` returning fake
hooks so we can assert our adapter does the right thing without spinning up
WalletConnect / MetaMask.

```tsx
// packages/0gkit-wallet-react/src/__tests__/wagmi-signer.test.ts
import { describe, it, expect, vi } from "vitest";
import { adaptWagmi } from "../wagmi-signer.js";

describe("adaptWagmi", () => {
  it("returns null when no address", () => {
    expect(
      adaptWagmi({
        address: undefined,
        signMessageAsync: vi.fn(),
        signTypedDataAsync: vi.fn(),
        sendTransactionAsync: vi.fn(),
      })
    ).toBeNull();
  });

  it("forwards signMessage(string)", async () => {
    const signMessageAsync = vi.fn().mockResolvedValue("0xsig");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync,
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    const sig = await s.signMessage("gm");
    expect(sig).toBe("0xsig");
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "gm" });
    expect(s.source).toBe("wagmi");
  });

  it("forwards signMessage(Uint8Array) as decoded string", async () => {
    const signMessageAsync = vi.fn().mockResolvedValue("0xsig");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync,
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    await s.signMessage(new TextEncoder().encode("hi"));
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "hi" });
  });
});
```

```tsx
// packages/0gkit-wallet-react/src/__tests__/provider.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ZeroGWalletProvider } from "../provider.js";

describe("ZeroGWalletProvider", () => {
  it("renders children with the local network", () => {
    const { getByText } = render(
      <ZeroGWalletProvider config={{ network: "local" }}>
        <span>child</span>
      </ZeroGWalletProvider>
    );
    expect(getByText("child")).toBeDefined();
  });

  it("throws when walletConnect is requested without a projectId", () => {
    expect(() =>
      render(
        <ZeroGWalletProvider
          config={{ network: "galileo", connectors: ["walletConnect"] }}
        >
          <span>child</span>
        </ZeroGWalletProvider>
      )
    ).toThrow(/walletConnectProjectId/);
  });
});
```

```tsx
// packages/0gkit-wallet-react/src/__tests__/hooks.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  signMessageAsync: vi.fn(),
  signTypedDataAsync: vi.fn(),
  sendTransactionAsync: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: mockState.address,
    isConnected: mockState.isConnected,
  }),
  useDisconnect: () => ({ disconnect: mockState.disconnect }),
  useSignMessage: () => ({ signMessageAsync: mockState.signMessageAsync }),
  useSignTypedData: () => ({ signTypedDataAsync: mockState.signTypedDataAsync }),
  useSendTransaction: () => ({ sendTransactionAsync: mockState.sendTransactionAsync }),
  useConnect: () => ({
    connectAsync: vi.fn(),
    connectors: [{ id: "injected", type: "injected", name: "Injected" }],
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false, error: null }),
}));

import { useWallet } from "../use-wallet.js";
import { useConnect } from "../use-connect.js";
import { useSwitchNetwork } from "../use-switch-network.js";

beforeEach(() => {
  mockState.address = undefined;
  mockState.isConnected = false;
  vi.clearAllMocks();
});

describe("useWallet", () => {
  it("returns no signer when disconnected", () => {
    const { result } = renderHook(() => useWallet());
    expect(result.current.signer).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("returns a wagmi-backed signer when connected", async () => {
    mockState.address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    mockState.isConnected = true;
    mockState.signMessageAsync.mockResolvedValue("0xsig");
    const { result } = renderHook(() => useWallet());
    expect(result.current.signer).not.toBeNull();
    expect(result.current.signer!.address.toLowerCase()).toBe(mockState.address);
    const sig = await result.current.signer!.signMessage("gm");
    expect(sig).toBe("0xsig");
  });
});

describe("useConnect", () => {
  it("returns connectors", () => {
    const { result } = renderHook(() => useConnect());
    expect(result.current.connectors.length).toBeGreaterThan(0);
    expect(result.current.connectors[0].id).toBe("injected");
  });
});

describe("useSwitchNetwork", () => {
  it("exposes switchNetwork that accepts a chainId", () => {
    const { result } = renderHook(() => useSwitchNetwork());
    expect(typeof result.current.switchNetwork).toBe("function");
  });
});
```

- [ ] **Step 7: Install + format + commit**

```bash
pnpm install
pnpm exec prettier --write packages/0gkit-wallet-react/
pnpm --filter @foundryprotocol/0gkit-wallet-react build
pnpm --filter @foundryprotocol/0gkit-wallet-react test
git add packages/0gkit-wallet-react pnpm-lock.yaml
git commit -m "feat(wallet-react): wagmi-backed ZeroGWalletProvider + useWallet/useConnect/useSwitchNetwork"
```

---

## Task 9: Refactor `0gkit-storage` to accept `{ signer }`

**Files:**

- Modify: `packages/0gkit-storage/src/storage.ts`
- Modify: `packages/0gkit-storage/src/__tests__/storage.test.ts`

- [ ] **Step 1: Add a failing test for the `{ signer }` ctor**

```ts
it("accepts a Signer via { signer }", async () => {
  const signer = await fromPrivateKey(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  );
  const s = new Storage({
    network: "galileo",
    signer,
    loadSdk: async () => fakeSdk({}),
  });
  const r = await s.upload(new Uint8Array([1]));
  expect(r.root).toBe("0xroot");
});

it("warns once on { privateKey } (deprecation)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // construct twice — assert warn was called at least once (we collapse repeats)
  new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
  new Storage(cfg({ loadSdk: async () => fakeSdk({}) }));
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
```

The test imports `fromPrivateKey` from `@foundryprotocol/0gkit-wallet` — wire
the dev-dep first:

```json
// packages/0gkit-storage/package.json — add to devDependencies
"@foundryprotocol/0gkit-wallet": "workspace:*"
```

- [ ] **Step 2: Confirm fail → Step 3: Implement**

```ts
// packages/0gkit-storage/src/storage.ts — patch the surface
import type { Signer } from "@foundryprotocol/0gkit-core";

export interface StorageConfig {
  network?: "aristotle" | "galileo";
  indexerUrl?: string;
  rpcUrl?: string;
  signer?: Signer;
  /** @deprecated Pass `signer` (from `fromPrivateKey`/`fromEnv`/`fromKMS`) instead. */
  privateKey?: string;
  loadSdk?: () => Promise<StorageSdk>;
}

// one-shot deprecation warning per-process
let warnedPrivateKey = false;

export class Storage {
  // …
  constructor(config: StorageConfig) {
    const net = config.network ?? "aristotle";
    this.indexerUrl = config.indexerUrl ?? INDEXERS[net];
    this.rpcUrl = config.rpcUrl ?? DEFAULT_RPC;
    if (config.signer) {
      // KMS signers don't expose privateKey — fall back to the legacy path only
      // when the loader carries plaintext.
      this.privateKey = config.signer.privateKey;
      if (!this.privateKey) {
        // we still accept the signer; signer() will throw a clear error if a
        // KMS-only flow is used with an SDK that only takes ethers.Wallet —
        // until SP10 swaps the SDK adapter to take a `Signer` directly.
      }
    } else if (config.privateKey) {
      if (!warnedPrivateKey) {
        console.warn(
          "@foundryprotocol/0gkit-storage: `{ privateKey }` is deprecated and will be removed in v0.3.\n" +
            "  Migrate to `{ signer: await fromEnv() }` (or fromPrivateKey/fromKMS) from @foundryprotocol/0gkit-wallet."
        );
        warnedPrivateKey = true;
      }
      this.privateKey = config.privateKey;
    }
    this.loadSdk =
      config.loadSdk ??
      (() =>
        import("@0gfoundation/0g-storage-ts-sdk" as string) as Promise<StorageSdk>);
  }
  // signer() unchanged — uses this.privateKey
}
```

- [ ] **Step 4: Run + format + commit**

```bash
pnpm exec prettier --write packages/0gkit-storage/src/storage.ts packages/0gkit-storage/src/__tests__/storage.test.ts packages/0gkit-storage/package.json
pnpm --filter @foundryprotocol/0gkit-storage test
git add packages/0gkit-storage/src/storage.ts packages/0gkit-storage/src/__tests__/storage.test.ts packages/0gkit-storage/package.json
git commit -m "feat(storage): accept { signer } ctor + deprecate { privateKey } (one-shot warn)"
```

---

## Task 10: Refactor `0gkit-compute`, `0gkit-da`, `0gkit-attestation`, `0gkit-chain`

Same pattern in each:

1. Add `signer?: Signer` to the config interface; keep `privateKey`/`brokerKey` working.
2. When `signer.privateKey` is present, route it through the existing ethers/viem path.
3. When `signer` is KMS-backed (no `privateKey`), it's still useful for `signMessage`/`signTypedData` paths even if the SDK adapter can't broadcast txs yet — log and continue.
4. One-shot `console.warn` on the legacy field.
5. Tests cover both surfaces.

**Files:**

- Modify: `packages/0gkit-compute/src/compute.ts` (alias `brokerKey` → derive from `signer.privateKey` when given)
- Modify: `packages/0gkit-compute/src/__tests__/compute.test.ts`
- Modify: `packages/0gkit-compute/package.json` (devDep `@foundryprotocol/0gkit-wallet`)
- Modify: `packages/0gkit-da/src/da.ts` (accept `signer` for future symmetry; DA today is signer-less)
- Modify: `packages/0gkit-da/src/__tests__/da.test.ts`
- Modify: `packages/0gkit-da/package.json`
- Modify: `packages/0gkit-attestation/src/attestation.ts` — add `signEnvelopeWithSigner(envelope, signer)` that delegates to `signer.signMessage({raw: digest})`.
- Modify: `packages/0gkit-attestation/src/__tests__/attestation.test.ts`
- Modify: `packages/0gkit-attestation/package.json`
- Modify: `packages/0gkit-chain/src/balance.ts` (read-only — no change needed; faucet doesn't sign). Export a free helper `signMessageWith(signer, bytes)` for ergonomics.
- Modify: `packages/0gkit-chain/src/__tests__/...`

- [ ] **Step 1: Tests first (one per primitive)**

(Per primitive: clone the storage test pattern — assert `{ signer }` works and `{ privateKey }` still works + warns.)

- [ ] **Step 2: Implementation**

For `0gkit-attestation`, the new helper looks like:

```ts
// packages/0gkit-attestation/src/attestation.ts
import type { Signer } from "@foundryprotocol/0gkit-core";

export async function signEnvelopeWithSigner(
  envelope: AttestationEnvelope,
  signer: Signer
): Promise<SignedEnvelope> {
  const digest = digestEnvelope(envelope);
  const signature = await signer.signMessage({ raw: digest });
  return { envelope, digest, signature };
}
```

Run, format, commit each primitive separately for reviewable history:

```bash
# After each primitive:
pnpm exec prettier --write packages/0gkit-<name>/
pnpm --filter @foundryprotocol/0gkit-<name> test
git add packages/0gkit-<name>
git commit -m "feat(<name>): accept { signer } ctor + deprecate { privateKey }"
```

---

## Task 11: Docs (wallet, wallet-react, primitives lead with `{ signer }`)

**Files:**

- Create: `apps/docs/app/packages/wallet/page.mdx`
- Create: `apps/docs/app/packages/wallet-react/page.mdx`
- Modify: `apps/docs/app/packages/storage/page.mdx` (lead with `{ signer }`, keep `{ privateKey }` in a "Legacy" section)
- Modify: `apps/docs/app/packages/compute/page.mdx`
- Modify: `apps/docs/app/packages/da/page.mdx`
- Modify: `apps/docs/app/packages/attestation/page.mdx`
- Modify: `apps/docs/app/packages/page.mdx` (sidebar list)
- Modify: `README.md` — replace `new StorageClient({ privateKey })` snippet with `Signer`-shaped example.

Each docs page covers: install, public surface, full example, gotchas (RSC for
wallet-react, KMS key spec requirements, `fromEnv` precedence).

- [ ] **Step 1: Write `wallet/page.mdx`** (full reference)
- [ ] **Step 2: Write `wallet-react/page.mdx`** (RSC notes, provider example, hooks)
- [ ] **Step 3: Refresh primitive pages** (snippet swaps; old `privateKey` snippet kept under `### Legacy`)
- [ ] **Step 4: Append D11 to `docs/DECISIONS.md`**

```md
## D11 — `Signer` interface lives in `0gkit-core`, not `0gkit-wallet`

**Date:** 2026-05-21 · **SP:** SP3

Layer-1 primitives (`0gkit-storage`/`0gkit-compute`/`0gkit-da`/`0gkit-attestation`/`0gkit-chain`)
need to consume a `Signer` type. If that type lived in `0gkit-wallet`, every
primitive would have to peerDepend on the wallet package — creating a
fan-out the dep-cruiser rule can flag as suspicious AND a real install-time
weight problem (KMS, wagmi, etc. would tunnel into every storage user). By
defining the interface in `0gkit-core` (the package every other 0gkit-\* already
depends on), primitives consume only a type and stay weightless. Wallet
implements; primitives consume; no cycle, no extra installs.
```

- [ ] **Step 5: Commit**

```bash
pnpm exec prettier --write apps/docs/ docs/DECISIONS.md README.md
git add apps/docs docs/DECISIONS.md README.md
git commit -m "docs(wallet): wallet + wallet-react reference, primitives lead with { signer }, D11"
```

---

## Task 12: Changeset

- [ ] **Step 1: Write the changeset**

```md
---
"@foundryprotocol/0gkit-core": minor
"@foundryprotocol/0gkit-wallet": minor
"@foundryprotocol/0gkit-wallet-react": minor
"@foundryprotocol/0gkit-storage": minor
"@foundryprotocol/0gkit-compute": minor
"@foundryprotocol/0gkit-da": minor
"@foundryprotocol/0gkit-attestation": minor
"@foundryprotocol/0gkit-chain": minor
---

SP3: `0gkit-wallet` + `0gkit-wallet-react`. New `Signer` interface in
`0gkit-core` adopted by every primitive — `new Storage({ signer })` replaces
`new Storage({ privateKey })` (legacy stays for one minor with a deprecation
warning). Loaders: `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`
(auto-picks KMS/file/PK), `fromKMS` (AWS KMS, secp256k1). SIWE: EIP-4361
nonce/buildMessage/verify. React: `ZeroGWalletProvider` + `useWallet` /
`useConnect` / `useSwitchNetwork` over wagmi v2.
```

- [ ] **Step 2: Commit**

```bash
pnpm exec prettier --write .changeset/sp3-0gkit-wallet.md
git add .changeset/sp3-0gkit-wallet.md
git commit -m "chore(changeset): SP3 — 0gkit-wallet (+ primitives signer ctor minor bumps)"
```

---

## Task 13: Self-review + CI gauntlet

- [ ] **Step 1: Run the full gauntlet**

```bash
cd /Users/rajkaria/Projects/0G-ai-kit
pnpm install
pnpm exec prettier --check .
pnpm boundary:check
pnpm --filter @foundryprotocol/0gkit-core build
pnpm typecheck
pnpm test
pnpm build
```

All MUST be green. Fix and re-run until they are.

- [ ] **Step 2: Cross-check coverage on wallet packages**

```bash
pnpm --filter @foundryprotocol/0gkit-wallet coverage
pnpm --filter @foundryprotocol/0gkit-wallet-react coverage
```

Both ≥85% lines/functions. If short, add a unit test that covers the uncovered
branch.

- [ ] **Step 3: Self-review checklist**

- [ ] `Signer` interface in core has no wallet-package-only types.
- [ ] `0gkit-wallet/src/__tests__/boundary.test.ts` green (no foreign `@foundryprotocol/*` imports).
- [ ] Both old `{ privateKey }` and new `{ signer }` work on every primitive.
- [ ] `console.warn` fires exactly once per process even with N constructors.
- [ ] SIWE verify rejects: tampered body, mismatched nonce, expired, future-not-yet-valid.
- [ ] KMS code path: tests pass with `aws-sdk-client-mock`; CI smoke gated on `KMS_CREDENTIALS`.
- [ ] Every new file has a matching docs page (`apps/docs/app/packages/wallet*`).

- [ ] **Step 4: Open PR + squash-merge after CI**

```bash
git push -u origin feat/sp3-0gkit-wallet
gh pr create --title "feat(wallet): SP3 — @foundryprotocol/0gkit-wallet (Signer, SIWE, React, KMS, keystore)" --body "$(cat <<'EOF'
## Gauntlet

| Check | Status |
| --- | --- |
| pnpm format:check | green |
| pnpm boundary:check | green |
| pnpm typecheck | green |
| pnpm test | green |
| pnpm build | green |
| wallet coverage | ≥85% lines |
| wallet-react coverage | ≥85% lines |

## Surface shipped

- `@foundryprotocol/0gkit-core` — new `Signer` / `SignTypedDataArgs` / `SignableTx` types
- `@foundryprotocol/0gkit-wallet` — `fromPrivateKey`, `fromFile` (keystore-v3), `fromEnv`, `fromKMS`, `siwe.generateNonce/buildMessage/verify`
- `@foundryprotocol/0gkit-wallet-react` — `ZeroGWalletProvider`, `useWallet`, `useConnect`, `useSwitchNetwork` (wagmi v2)
- Primitive refactors — `Storage`/`Compute`/`DA`/`Attestation` accept `{ signer }`. Legacy `{ privateKey }` keeps working with a one-shot deprecation warning.

## Plan deviations

- `Signer` interface defined in `0gkit-core` (not `0gkit-wallet`) to keep the dep graph acyclic (D11).
- KMS smoke test gated on `KMS_CREDENTIALS` (matches the giget pattern in SP1).
- `sendTransaction` on LocalAccountSigner throws — primitives don't need it today; we'll surface a real impl in SP7's dry-run work.

Closes the SP3 line of the essentials roadmap.
EOF
)"
gh pr merge --squash --auto --delete-branch
```

---

## Spec Coverage Self-Review

| Spec requirement (SP3)                                                      | Task               |
| --------------------------------------------------------------------------- | ------------------ |
| `Signer` interface + `WalletProvider` / loaders                             | T1, T3, T4, T5, T6 |
| `fromPrivateKey`, `fromEnv`, `fromFile`, `fromKMS`                          | T3, T4, T5, T6     |
| SIWE `generateNonce` + `verify`                                             | T7                 |
| React: `ZeroGWalletProvider`, `useWallet`, `useConnect`, `useSwitchNetwork` | T8                 |
| Every primitive accepts `{ signer }` ctor + legacy `{ privateKey }` stays   | T9, T10            |
| Deprecation `console.warn` on `{ privateKey }`                              | T9, T10            |
| Coverage 85% on wallet                                                      | T13                |
| Docs page per public surface                                                | T11                |
| Changeset cut for affected packages                                         | T12                |
| Self-review + gauntlet + PR + auto-squash                                   | T13                |
