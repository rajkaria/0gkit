import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { testWallet } from "@foundryprotocol/0gkit-testing";
import { signWebhookBody, verifyWebhook } from "../webhook.js";
import { MemoryBackend } from "../backends/memory.js";
import { JobRunner } from "../runner.js";
import { jobs } from "../index.js";

const SECRET = "wh-secret-please-change";

describe("webhook HMAC", () => {
  it("signWebhookBody returns a stable hex digest", () => {
    const sig = signWebhookBody('{"jobId":"x"}', SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Stable across calls.
    expect(signWebhookBody('{"jobId":"x"}', SECRET)).toBe(sig);
  });

  it("verifyWebhook accepts a body matching its signature", () => {
    const body = JSON.stringify({ jobId: "abc", newState: "done" });
    const signature = `sha256=${signWebhookBody(body, SECRET)}`;
    expect(verifyWebhook({ body, signature, secret: SECRET })).toBe(true);
  });

  it("verifyWebhook rejects mismatched body", () => {
    const body = JSON.stringify({ jobId: "abc", newState: "done" });
    const signature = `sha256=${signWebhookBody(body, SECRET)}`;
    expect(verifyWebhook({ body: body + " ", signature, secret: SECRET })).toBe(false);
  });

  it("verifyWebhook rejects wrong secret", () => {
    const body = "x";
    const signature = `sha256=${signWebhookBody(body, SECRET)}`;
    expect(verifyWebhook({ body, signature, secret: "wrong" })).toBe(false);
  });

  it("verifyWebhook tolerates the 'sha256=' prefix and bare hex", () => {
    const body = "y";
    const hex = signWebhookBody(body, SECRET);
    expect(verifyWebhook({ body, signature: hex, secret: SECRET })).toBe(true);
    expect(verifyWebhook({ body, signature: `sha256=${hex}`, secret: SECRET })).toBe(
      true
    );
  });

  it("verifyWebhook returns false on garbage input without throwing", () => {
    expect(verifyWebhook({ body: "x", signature: "garbage", secret: SECRET })).toBe(
      false
    );
    expect(verifyWebhook({ body: "x", signature: "", secret: SECRET })).toBe(false);
  });
});

describe("JobRunner webhook integration", () => {
  it("posts a signed state-change event to the configured webhook url", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("ok", { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const backend = new MemoryBackend();
      const runner = new JobRunner({
        backend,
        signer: testWallet({ index: 0 }),
        webhook: { url: "https://example.test/hook", secret: SECRET, retries: 0 },
      });
      const Def = jobs.define({
        name: "wh",
        input: z.unknown(),
        output: z.object({ ok: z.boolean() }),
        handler: async () => ({ ok: true }),
      });
      runner.register(Def);
      const id = await runner.enqueue(Def, {});
      await runner.start();
      await runner.waitFor(id, { timeoutMs: 1000 });
      await runner.stop();

      expect(calls.length).toBeGreaterThanOrEqual(1);
      const call = calls[0];
      expect(call.url).toBe("https://example.test/hook");
      const headers = call.init.headers as Record<string, string>;
      expect(headers["x-0gkit-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(headers["x-0gkit-job-id"]).toBe(id);
      // Verify the signature round-trips against the body.
      const body = call.init.body as string;
      expect(
        verifyWebhook({ body, signature: headers["x-0gkit-signature"], secret: SECRET })
      ).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries webhook delivery on non-2xx response", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      return new Response("nope", { status: 500 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const backend = new MemoryBackend();
      const runner = new JobRunner({
        backend,
        signer: testWallet({ index: 0 }),
        webhook: { url: "https://example.test/hook", secret: SECRET, retries: 2 },
      });
      const Def = jobs.define({
        name: "wh-retry",
        input: z.unknown(),
        output: z.unknown(),
        handler: async () => ({}),
      });
      runner.register(Def);
      const id = await runner.enqueue(Def, {});
      await runner.start();
      await runner.waitFor(id, { timeoutMs: 3000 });
      await runner.stop();

      // 1 initial + 2 retries = 3
      expect(attempts).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
