import { describe, expect, it, vi } from "vitest";
import type { InferenceResult } from "@foundryprotocol/0gkit-compute";
import { buildApp } from "../app.js";

function makeDeps(opts: { logFn?: (m: string) => void } = {}) {
  const inference = vi.fn(
    async (_args: { messages: { role: string; content: string }[] }) =>
      ({
        output: "echo: hello",
        receipt: { txHash: "0x1234", latencyMs: 1 },
        raw: { mock: true },
      }) as InferenceResult
  );
  return {
    compute: { inference },
    getAttestation: vi
      .fn()
      .mockResolvedValue({ v: 1, signer: "0x0", signature: "0xbeef" }),
    log: opts.logFn ?? vi.fn(),
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

  it("emits an access-log line per request", async () => {
    const log = vi.fn();
    const app = buildApp(makeDeps({ logFn: log }));
    await app.request("/health");
    expect(log).toHaveBeenCalled();
    const line = log.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/GET \/health 200/);
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
