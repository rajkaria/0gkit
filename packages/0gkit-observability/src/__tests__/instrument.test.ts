import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { instrument0g, disinstrument0g } from "../instrument.js";

// Fake primitive classes that mimic the public surface of the real
// Storage/Compute/DA — just enough for `instrument0g` to patch them.
class FakeStorage {
  network = "galileo";
  async upload(
    bytes: Uint8Array
  ): Promise<{ root: string; tx: { latencyMs: number } }> {
    return { root: "0x" + "ab".repeat(32), tx: { latencyMs: bytes.length } };
  }
  async estimate(bytes: number) {
    return {
      kind: "storage" as const,
      sizeBytes: bytes,
      segments: Math.max(1, Math.ceil(bytes / 262144)),
      gas: 80000n,
      fee: 1000000000n,
    };
  }
}

class FakeCompute {
  network = "galileo";
  async inference(args: {
    messages: { role: string; content: string }[];
    model?: string;
  }) {
    return {
      output: "ok: " + args.messages[0]?.content,
      receipt: { txHash: "0xdeadbeef", latencyMs: 12 },
      usage: { inputTokens: 4, outputTokens: 7 },
      raw: {},
    };
  }
}

class FakeDA {
  network = "galileo";
  async publish(payload: Uint8Array) {
    return {
      digest: "0xfeedface",
      gas: 0n,
      fee: BigInt(payload.length) * 1_000_000n,
    };
  }
}

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(async () => {
  disinstrument0g();
  await provider.shutdown();
  trace.disable();
});

describe("instrument0g", () => {
  it("wraps storage.upload and emits a span with 0gkit.* attributes", async () => {
    await instrument0g({
      mode: "attach",
      targets: {
        storage: { class: FakeStorage, methods: ["upload", "estimate"] },
      },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(1024));
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("0gkit.storage.upload");
    expect(spans[0]!.attributes["0gkit.op"]).toBe("storage.upload");
    expect(spans[0]!.attributes["0gkit.network"]).toBe("galileo");
    expect(spans[0]!.attributes["0gkit.size_bytes"]).toBe(1024);
    expect(spans[0]!.attributes["0gkit.dry_run"]).toBe(false);
    expect(spans[0]!.attributes["0gkit.root"]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(spans[0]!.attributes["0gkit.confirm_seconds"]).toBe(1.024);
  });

  it("wraps storage.estimate and marks it dry_run=true with segments/gas/fee", async () => {
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["estimate"] } },
    });
    const s = new FakeStorage();
    await s.estimate(524288);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("0gkit.storage.estimate");
    expect(span.attributes["0gkit.dry_run"]).toBe(true);
    expect(span.attributes["0gkit.segments"]).toBe(2);
    expect(span.attributes["0gkit.gas_native"]).toBe("80000");
    expect(span.attributes["0gkit.fee_native"]).toBe("1000000000");
  });

  it("wraps compute.inference with model + token counts + tx_hash", async () => {
    await instrument0g({
      mode: "attach",
      targets: { compute: { class: FakeCompute, methods: ["inference"] } },
    });
    const c = new FakeCompute();
    await c.inference({
      messages: [{ role: "user", content: "hi" }],
      model: "llama-3-8b",
    });
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("0gkit.compute.inference");
    expect(span.attributes["0gkit.model"]).toBe("llama-3-8b");
    expect(span.attributes["0gkit.input_tokens"]).toBe(4);
    expect(span.attributes["0gkit.output_tokens"]).toBe(7);
    expect(span.attributes["0gkit.tx_hash"]).toBe("0xdeadbeef");
  });

  it("wraps da.publish with size_bytes + fee_native", async () => {
    await instrument0g({
      mode: "attach",
      targets: { da: { class: FakeDA, methods: ["publish"] } },
    });
    const da = new FakeDA();
    await da.publish(new Uint8Array(2048));
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("0gkit.da.publish");
    expect(span.attributes["0gkit.size_bytes"]).toBe(2048);
    expect(span.attributes["0gkit.fee_native"]).toBe("2048000000");
    expect(span.attributes["0gkit.root"]).toBe("0xfeedface");
  });

  it("disinstrument0g restores the original method", async () => {
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    disinstrument0g();
    const s = new FakeStorage();
    await s.upload(new Uint8Array(0));
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
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: BadStorage, methods: ["upload"] } },
    });
    const s = new BadStorage();
    await s.upload().catch(() => {});
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.error_code"]).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span.status.message).toBe("over quota");
  });

  it("does not double-wrap on a second instrument0g call", async () => {
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(1));
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it("ignores methods that don't exist on the target", async () => {
    await instrument0g({
      mode: "attach",
      targets: {
        storage: {
          class: FakeStorage,
          methods: ["upload", "nonexistentMethod" as never],
        },
      },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(1));
    // Only the real method gets a span.
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  it("skips primitives whose target entry is not configured", async () => {
    // Only storage configured; compute + da spans should never appear.
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorage, methods: ["upload"] } },
    });
    const s = new FakeStorage();
    await s.upload(new Uint8Array(8));
    const c = new FakeCompute();
    await c.inference({ messages: [{ role: "user", content: "x" }] });
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("0gkit.storage.upload");
  });

  it("falls back to 'unknown' network when the instance has none", async () => {
    class NoNetStorage {
      async upload(bytes: Uint8Array) {
        return { root: "0x" + "00".repeat(32), tx: { latencyMs: bytes.length } };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: NoNetStorage, methods: ["upload"] } },
    });
    await new NoNetStorage().upload(new Uint8Array(1));
    expect(exporter.getFinishedSpans()[0]!.attributes["0gkit.network"]).toBe("unknown");
  });
});

describe("instrument0g — attestation", () => {
  it("wraps a fake attestation client when given an explicit target", async () => {
    class FakeAttestationClient {
      network = "galileo";
      async verifyEnvelope(_signed: unknown, _signer: string) {
        return { ok: true } as const;
      }
    }
    await instrument0g({
      mode: "attach",
      targets: {
        attestation: { class: FakeAttestationClient, methods: ["verifyEnvelope"] },
      },
    });
    await new FakeAttestationClient().verifyEnvelope({}, "0x0");
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("0gkit.attestation.verifyEnvelope");
    expect(span.attributes["0gkit.network"]).toBe("galileo");
  });
});

describe("instrument0g — compute estimate + da estimate", () => {
  it("compute.estimate carries dry_run + breakdown tokens", async () => {
    class FakeComputeEst {
      network = "galileo";
      async estimate(args: { model?: string }) {
        return {
          kind: "compute" as const,
          gas: 0n,
          fee: 500_000_000n,
          breakdown: { inputTokens: 12, outputTokensMax: 512, model: args.model },
        };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { compute: { class: FakeComputeEst, methods: ["estimate"] } },
    });
    await new FakeComputeEst().estimate({ model: "llama-3-8b" });
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.dry_run"]).toBe(true);
    expect(span.attributes["0gkit.input_tokens"]).toBe(12);
    expect(span.attributes["0gkit.output_tokens"]).toBe(512);
    expect(span.attributes["0gkit.fee_native"]).toBe("500000000");
    expect(span.attributes["0gkit.model"]).toBe("llama-3-8b");
  });

  it("da.estimate carries size_bytes + fee from a numeric arg", async () => {
    class FakeDAEst {
      network = "galileo";
      async estimate(bytes: number) {
        return {
          kind: "da" as const,
          sizeBytes: bytes,
          gas: 0n,
          fee: BigInt(bytes) * 1_000_000n,
        };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { da: { class: FakeDAEst, methods: ["estimate"] } },
    });
    await new FakeDAEst().estimate(4096);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.size_bytes"]).toBe(4096);
    expect(span.attributes["0gkit.fee_native"]).toBe("4096000000");
    expect(span.attributes["0gkit.dry_run"]).toBe(true);
  });

  it("storage.download records the root and result size", async () => {
    class FakeStorageDl {
      network = "galileo";
      async download(_root: string) {
        return new Uint8Array(64);
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorageDl, methods: ["download"] } },
    });
    await new FakeStorageDl().download("0x" + "ab".repeat(32));
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.root"]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(span.attributes["0gkit.size_bytes"]).toBe(64);
  });

  it("storage.exists records the queried root", async () => {
    class FakeStorageExists {
      network = "galileo";
      async exists(_root: string) {
        return true;
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorageExists, methods: ["exists"] } },
    });
    await new FakeStorageExists().exists("0x" + "cd".repeat(32));
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("0gkit.storage.exists");
    expect(span.attributes["0gkit.root"]).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("storage.upload honours { dryRun: true } in the second arg", async () => {
    class FakeStorageDry {
      network = "galileo";
      async upload(_data: Uint8Array, opts?: { dryRun?: boolean }) {
        return opts?.dryRun
          ? { dryRun: true, estimate: {}, result: { root: "0x" + "11".repeat(32) } }
          : { root: "0x" + "22".repeat(32), tx: { latencyMs: 1 } };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeStorageDry, methods: ["upload"] } },
    });
    await new FakeStorageDry().upload(new Uint8Array(8), { dryRun: true });
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.dry_run"]).toBe(true);
    expect(span.attributes["0gkit.root"]).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// NOTE: the no-targets / auto path (defaultTargets() + setupSdkIfRequested)
// dynamically imports `@foundryprotocol/0gkit-storage` et al. Those aren't
// dependencies of THIS package (the whole point is to avoid a static edge),
// so vitest's resolver can't fetch them inside this suite. The auto path is
// exercised end-to-end by the `tee-attested-api` template's tests instead.
// See docs/DECISIONS.md D32.

describe("wrap.ts — edge cases", () => {
  it("records exception with String(err) fallback when err.message is undefined", async () => {
    class WeirdError extends Error {
      // Force message to be undefined-ish at runtime.
      override get message() {
        return undefined as unknown as string;
      }
    }
    class WeirdStorage {
      network = "galileo";
      async upload(): Promise<never> {
        const e = new WeirdError() as Error & { code: string };
        e.code = "STORAGE_UPLOAD_FAILED";
        throw e;
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: WeirdStorage, methods: ["upload"] } },
    });
    await new WeirdStorage().upload().catch(() => {});
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.status.code).toBe(2);
    expect(span.attributes["0gkit.error_code"]).toBe("STORAGE_UPLOAD_FAILED");
  });

  it("records exception with no error code attribute when err.code is non-string", async () => {
    class NoCodeStorage {
      network = "galileo";
      async upload(): Promise<never> {
        // Code is a non-string — wrapper should skip setting 0gkit.error_code.
        const e = new Error("plain") as Error & { code: number };
        e.code = 42;
        throw e;
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: NoCodeStorage, methods: ["upload"] } },
    });
    await new NoCodeStorage().upload().catch(() => {});
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.status.code).toBe(2);
    expect(span.attributes["0gkit.error_code"]).toBeUndefined();
  });

  it("DA.publish accepts a string payload and records its length", async () => {
    class StringDA {
      network = "galileo";
      async publish(payload: string) {
        return { digest: "0x00", gas: 0n, fee: BigInt(payload.length) * 100n };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { da: { class: StringDA, methods: ["publish"] } },
    });
    await new StringDA().publish("hello-da-payload");
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.size_bytes"]).toBe("hello-da-payload".length);
  });

  it("maybeBigintString handles bigint, string, and number gas/fee values", async () => {
    class MixedStorage {
      network = "galileo";
      async estimate(_bytes: number) {
        return {
          kind: "storage" as const,
          sizeBytes: 0,
          segments: 1,
          gas: "80000", // string path
          fee: 1_000_000_000, // number path
        };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: MixedStorage, methods: ["estimate"] } },
    });
    await new MixedStorage().estimate(0);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["0gkit.gas_native"]).toBe("80000");
    expect(span.attributes["0gkit.fee_native"]).toBe("1000000000");
  });

  it("wrapMethod is a no-op when target is missing the method", async () => {
    // Direct exercise of the !target || typeof target[method] !== "function"
    // guard. We re-use the same FakeStorage but ask for a method that
    // doesn't exist — the wrapper does nothing, and no span is emitted on
    // the unrelated upload() call.
    await instrument0g({
      mode: "attach",
      targets: {
        storage: {
          class: FakeStorage,
          methods: ["nonexistentMethod" as never],
        },
      },
    });
    await new FakeStorage().upload(new Uint8Array(1));
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});

describe("instrument + trace-sink JSONL mirror", () => {
  const ENV_KEY = "OGKIT_TRACE_DIR";
  let dir: string;
  let original: string | undefined;

  beforeEach(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    dir = await mkdtemp(join(tmpdir(), "ogkit-instrument-sink-"));
    original = process.env[ENV_KEY];
    process.env[ENV_KEY] = dir;
  });

  afterEach(async () => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
    disinstrument0g();
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true });
  });

  it("mirrors a successful span to <dir>/<date>-<traceId>.jsonl when OGKIT_TRACE_DIR is set", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    class LocalFakeStorage {
      network = "galileo";
      async upload(_b: Uint8Array, _opts?: { dryRun?: boolean }) {
        return {
          root: "0xabc",
          tx: { hash: "0xdef", blockNumber: 1, latencyMs: 1 },
        };
      }
    }
    const provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(new InMemorySpanExporter()));
    trace.setGlobalTracerProvider(provider);
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: LocalFakeStorage, methods: ["upload"] } },
    });
    await new LocalFakeStorage().upload(new Uint8Array([1, 2, 3]));
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]!).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]+\.jsonl$/);
    const content = await readFile(join(dir, files[0]!), "utf8");
    const rec = JSON.parse(content.trim());
    expect(rec.name).toBe("0gkit.storage.upload");
    expect(rec.status).toBe("ok");
    expect(rec.attributes["0gkit.op"]).toBe("storage.upload");
    expect(rec.attributes["0gkit.size_bytes"]).toBe(3);
  });

  it("mirrors an errored span with status=error", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    class BrokenStorage {
      network = "galileo";
      async upload(_b: Uint8Array) {
        const err = new Error("nope") as Error & { code?: string };
        err.code = "STORAGE_UPLOAD_FAILED";
        throw err;
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: BrokenStorage, methods: ["upload"] } },
    });
    await expect(new BrokenStorage().upload(new Uint8Array([9]))).rejects.toThrow(
      /nope/
    );
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const rec = JSON.parse((await readFile(join(dir, files[0]!), "utf8")).trim());
    expect(rec.status).toBe("error");
    expect(rec.attributes["0gkit.error_code"]).toBe("STORAGE_UPLOAD_FAILED");
  });

  it("does NOT mirror when OGKIT_TRACE_DIR is unset", async () => {
    const { readdir } = await import("node:fs/promises");
    delete process.env[ENV_KEY];
    class FakeS {
      network = "galileo";
      async upload(_b: Uint8Array) {
        return { root: "0x", tx: { hash: "0x", blockNumber: 0, latencyMs: 0 } };
      }
    }
    await instrument0g({
      mode: "attach",
      targets: { storage: { class: FakeS, methods: ["upload"] } },
    });
    await new FakeS().upload(new Uint8Array([1]));
    expect(await readdir(dir)).toEqual([]);
  });
});
