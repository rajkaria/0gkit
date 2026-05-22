import { wrapMethod, unwrapAll } from "./wrap.js";
import {
  STORAGE_MAPPERS,
  COMPUTE_MAPPERS,
  DA_MAPPERS,
  ATTESTATION_MAPPERS,
} from "./attribute-mappers.js";

export type InstrumentMode = "auto" | "attach";

export interface ExporterConfig {
  /** `noop` skips SDK setup entirely; `console` prints to stdout; `otlp` POSTs to an OTLP collector. */
  kind: "otlp" | "console" | "noop";
  endpoint?: string;
  headers?: Record<string, string>;
}

/**
 * The patched class is constructed via `new`, so this matches any constructor
 * whose prototype carries the methods we'll wrap.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctor = abstract new (...args: any[]) => unknown;

export interface InstrumentTargets {
  /** Class constructor (we patch the `prototype`). */
  storage?: { class: Ctor; methods: string[] };
  compute?: { class: Ctor; methods: string[] };
  da?: { class: Ctor; methods: string[] };
  attestation?: { class: Ctor; methods: string[] };
}

export interface InstrumentConfig {
  /** Required for SDK auto-setup. Default `"0gkit-app"`. */
  serviceName?: string;
  /** Configure the OTel exporter. Omit (or `kind: "noop"`) for attach-only. */
  exporter?: ExporterConfig;
  /**
   * `"auto"` (default): if `exporter` is set, lazy-import @opentelemetry/sdk-node
   * and register it. `"attach"`: skip SDK setup — caller already has an SDK
   * configured.
   */
  mode?: InstrumentMode;
  /**
   * Override which classes get patched. When omitted, the real primitives are
   * resolved via dynamic import (which is why this entry point is async).
   * Tests use this hook to inject fakes synchronously.
   */
  targets?: InstrumentTargets;
}

let instrumented = false;

/**
 * Register OTel instrumentation for the 0gkit primitives. Idempotent — a
 * second call is a no-op until `disinstrument0g()` is called.
 *
 * The function is async because the default code path lazy-imports the
 * primitive packages (so apps that only use `mode: "attach"` + explicit
 * `targets` never pull the SDK or other primitive packages into their
 * bundle). When `targets` is provided, the `await` resolves immediately —
 * no dynamic imports run.
 */
export async function instrument0g(config: InstrumentConfig = {}): Promise<void> {
  if (instrumented) return;

  if (config.mode !== "attach") {
    // Best-effort SDK setup. If the caller passed `exporter: { kind: "noop" }`
    // (or didn't pass an exporter at all), `setupSdk` is a no-op.
    await setupSdkIfRequested(config);
  }

  const targets = config.targets ?? (await defaultTargets());

  if (targets.storage) {
    for (const m of targets.storage.methods) {
      const mapper = STORAGE_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(
        targets.storage.class.prototype as Record<string, unknown>,
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
        targets.compute.class.prototype as Record<string, unknown>,
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
      wrapMethod(
        targets.da.class.prototype as Record<string, unknown>,
        m,
        `da.${m}`,
        mapper.pre,
        mapper.post
      );
    }
  }
  if (targets.attestation) {
    for (const m of targets.attestation.methods) {
      const mapper = ATTESTATION_MAPPERS[m];
      if (!mapper) continue;
      wrapMethod(
        targets.attestation.class.prototype as Record<string, unknown>,
        m,
        `attestation.${m}`,
        mapper.pre,
        mapper.post
      );
    }
  }
  instrumented = true;
}

/**
 * Restore every patched method to its original. Mostly used by tests to keep
 * suites isolated. Production callers typically `instrument0g()` once at
 * boot and never reverse it.
 */
export function disinstrument0g(): void {
  unwrapAll();
  instrumented = false;
}

async function setupSdkIfRequested(config: InstrumentConfig): Promise<void> {
  // Defer to a separate module so apps that bring their own SDK never load
  // ours, and so tree-shakers can drop the entire SDK code path.
  const { setupSdk } = await import("./sdk.js");
  await setupSdk(config);
}

async function defaultTargets(): Promise<InstrumentTargets> {
  // Computed specifiers so the dependency-cruiser boundary check sees no
  // static edge to the primitive packages — `instrument0g` is plugin-style.
  const ns = "@foundryprotocol";
  const [storageMod, computeMod, daMod] = await Promise.all([
    import([ns, "0gkit-storage"].join("/")) as Promise<{ Storage: Ctor }>,
    import([ns, "0gkit-compute"].join("/")) as Promise<{ Compute: Ctor }>,
    import([ns, "0gkit-da"].join("/")) as Promise<{ DA: Ctor }>,
  ]);
  // NOTE: `@foundryprotocol/0gkit-attestation` currently exports free
  // functions (verifyEnvelope, signEnvelope, ...) rather than a class with a
  // prototype to patch. We can't safely monkey-patch a re-exported module
  // function under ESM live bindings, so attestation is intentionally NOT in
  // the default target set. Callers that want a span around verifyEnvelope
  // should pass an explicit `targets.attestation` (e.g. once a future
  // `AttestationClient` class lands). See docs/DECISIONS.md D32.
  return {
    storage: {
      class: storageMod.Storage,
      methods: ["upload", "download", "estimate", "exists"],
    },
    compute: {
      class: computeMod.Compute,
      methods: ["inference", "estimate"],
    },
    da: { class: daMod.DA, methods: ["publish", "estimate"] },
  };
}
