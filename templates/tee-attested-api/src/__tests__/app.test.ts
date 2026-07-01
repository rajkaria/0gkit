import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { mockComputeClient } from "@foundryprotocol/0gkit-testing";
import type { ChatMessage } from "@foundryprotocol/0gkit-testing";
import { buildApp } from "../app.js";

const TRACER_NAME = "tee-attested-api";

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
  await provider.shutdown();
  trace.disable();
});

function makeDeps() {
  const client = mockComputeClient({
    receiptOverride: { txHash: "0x1234", latencyMs: 1 },
  });
  return {
    compute: {
      router: (args: { messages: ChatMessage[] }) => client.inference(args),
    },
    getAttestation: vi
      .fn()
      .mockResolvedValue({ v: 1, signer: "0x0", signature: "0xbeef" }),
    // No explicit `tracer` — the middleware falls back to the global tracer
    // we set up in beforeEach, so we exercise that code path by default.
  };
}

describe("buildApp", () => {
  it("returns 200 + X-0G-Attestation header on /health", async () => {
    const app = buildApp(makeDeps());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const att = res.headers.get("X-0G-Attestation");
    expect(att).toBeTruthy();
    expect(JSON.parse(att as string)).toMatchObject({ v: 1 });
  });

  it("returns 200 + attestation header + reply on /chat", async () => {
    const app = buildApp(makeDeps());
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-0G-Attestation")).toBeTruthy();
    const body = (await res.json()) as { reply: string; txHash: string | null };
    expect(body.reply).toMatch(/echo/);
    expect(body.txHash).toBe("0x1234");
  });

  it("returns 400 when /chat is called without a prompt", async () => {
    const app = buildApp(makeDeps());
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body to /chat", async () => {
    const app = buildApp(makeDeps());
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("emits an OTel span per request with http.* attributes", async () => {
    const app = buildApp(makeDeps());
    await app.request("/health");
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("GET /health");
    expect(spans[0]!.attributes["http.method"]).toBe("GET");
    expect(spans[0]!.attributes["http.route"]).toBe("/health");
    expect(spans[0]!.attributes["http.status_code"]).toBe(200);
    expect(typeof spans[0]!.attributes["http.duration_ms"]).toBe("number");
  });

  it("records the response status_code on /chat (200)", async () => {
    const app = buildApp(makeDeps());
    await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["http.status_code"]).toBe(200);
    expect(span.attributes["http.route"]).toBe("/chat");
    expect(span.attributes["http.method"]).toBe("POST");
  });

  it("supports an explicit tracer dep override (for offline tests)", async () => {
    const localExporter = new InMemorySpanExporter();
    const localProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(localExporter)],
    });
    const app = buildApp({
      ...makeDeps(),
      tracer: localProvider.getTracer(TRACER_NAME),
    });
    await app.request("/health");
    expect(localExporter.getFinishedSpans()).toHaveLength(1);
    await localProvider.shutdown();
  });

  it("falls back to X-0G-Attestation-Error when the provider throws", async () => {
    const deps = makeDeps();
    deps.getAttestation = vi.fn().mockRejectedValue(new Error("boom"));
    const app = buildApp(deps);
    const res = await app.request("/health");
    expect(res.headers.get("X-0G-Attestation")).toBeNull();
    expect(res.headers.get("X-0G-Attestation-Error")).toBe("boom");
  });
});
