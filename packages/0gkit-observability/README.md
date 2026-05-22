# @foundryprotocol/0gkit-observability

> OpenTelemetry instrumentation for 0gkit primitives. One call wires every
> Storage / Compute / DA / Attestation operation as an OTel span with `0gkit.*`
> semantic attributes.

## What it does

`instrument0g()` patches the public methods of `Storage`, `Compute`, `DA`, and
`Attestation` at runtime so every call emits an OTel span. The span name is
`0gkit.<primitive>.<method>` (e.g. `0gkit.storage.upload`). Attributes include
`0gkit.network`, `0gkit.size_bytes`, `0gkit.gas_native`, `0gkit.fee_native`,
`0gkit.confirm_seconds`, `0gkit.root`, and so on. Failures record the
exception, set the span status to ERROR, and attach `0gkit.error_code` (the
SCREAMING_SNAKE code from SP9's error taxonomy).

## When to use it

- Production apps that need to know what's slow, what's expensive, and what's
  failing in their 0G calls.
- Cost-attribution dashboards: the `0gkit.gas_native` + `0gkit.fee_native`
  attributes feed straight into per-team / per-feature cost rollups.
- Anywhere you already have an OTel collector (Honeycomb, Datadog, Tempo,
  Vercel OTel, Grafana Cloud).

## Install

```bash
pnpm add @foundryprotocol/0gkit-observability @opentelemetry/api

# Optional — only if you don't already have an OTel SDK configured
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## Quickstart

```ts
import { instrument0g } from "@foundryprotocol/0gkit-observability";

// At process boot, BEFORE any Storage / Compute / DA call:
await instrument0g({
  serviceName: "my-app",
  exporter: {
    kind: "otlp",
    endpoint: "https://api.honeycomb.io/v1/traces",
    headers: { "x-honeycomb-team": process.env.HONEYCOMB_API_KEY! },
  },
});

// From here, every Storage / Compute / DA / Attestation call emits a span.
// Nothing else in your app needs to change.
```

## Bring your own SDK (`mode: "attach"`)

If you already wire `@opentelemetry/sdk-node` (or any other OTel SDK) in your
app, pass `mode: "attach"` so `instrument0g` skips SDK setup and only patches
primitives:

```ts
import { instrument0g } from "@foundryprotocol/0gkit-observability";

await instrument0g({ mode: "attach" });
```

## Custom targets (for tests)

Tests can patch fake classes by passing `targets` explicitly. This bypasses
the optional dynamic imports of real primitives, so it's also synchronous in
practice (the `await` resolves immediately):

```ts
import { instrument0g, disinstrument0g } from "@foundryprotocol/0gkit-observability";

class FakeStorage {
  network = "galileo";
  async upload() {
    return { root: "0xabc" };
  }
}

await instrument0g({
  mode: "attach",
  targets: { storage: { class: FakeStorage, methods: ["upload"] } },
});

// Run tests against an in-memory exporter.

disinstrument0g(); // restores originals
```

## Span attribute reference

All attribute keys live in a single frozen `ATTR` constant in `attributes.ts`:

| Constant            | Key                       | Notes                                                  |
| ------------------- | ------------------------- | ------------------------------------------------------ |
| `ATTR.NETWORK`      | `0gkit.network`           | `"galileo"` / `"aristotle"` / `"local"`                |
| `ATTR.OP`           | `0gkit.op`                | `"storage.upload"`, `"compute.inference"`, ...        |
| `ATTR.SIZE_BYTES`   | `0gkit.size_bytes`        | Bytes uploaded / downloaded / published                |
| `ATTR.SEGMENTS`     | `0gkit.segments`          | Storage segments (256 KiB chunks)                      |
| `ATTR.GAS_NATIVE`   | `0gkit.gas_native`        | Gas units (stringified bigint)                         |
| `ATTR.FEE_NATIVE`   | `0gkit.fee_native`        | Native wei fee (stringified bigint)                    |
| `ATTR.CONFIRM_SECONDS` | `0gkit.confirm_seconds` | Confirmation latency in seconds                        |
| `ATTR.ROOT`         | `0gkit.root`              | Storage Merkle root                                    |
| `ATTR.TX_HASH`      | `0gkit.tx_hash`           | Transaction hash                                       |
| `ATTR.BLOCK_NUMBER` | `0gkit.block_number`      | Block number                                           |
| `ATTR.MODEL`        | `0gkit.model`             | Compute model id                                       |
| `ATTR.INPUT_TOKENS` | `0gkit.input_tokens`      | Input tokens consumed                                  |
| `ATTR.OUTPUT_TOKENS`| `0gkit.output_tokens`     | Output tokens generated (or max for estimates)         |
| `ATTR.ERROR_CODE`   | `0gkit.error_code`        | SCREAMING_SNAKE code from SP9 error taxonomy           |
| `ATTR.DRY_RUN`      | `0gkit.dry_run`           | `true` for `.estimate()` and `{ dryRun: true }` calls  |

## Bundle size

The public entry bundles to ≤ 20 KB gzipped. Asserted by
`src/__tests__/bundle-size.test.ts` on every CI run. `@opentelemetry/api` is
externalised (peer dep); the optional SDK + exporter peers are lazy-imported
and never reach the bundle unless the caller asks for them.

## License

MIT
