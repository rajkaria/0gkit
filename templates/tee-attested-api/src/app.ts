import type { Tracer } from "@opentelemetry/api";
import { Hono } from "hono";
import type { ChatMessage, InferenceResult } from "@foundryprotocol/0gkit-compute";
import {
  withAttestation,
  withAccessLog,
  type AttestationProvider,
} from "./middleware.js";

export interface AppDeps extends AttestationProvider {
  compute: {
    /**
     * Narrow form of `Compute.inference` — production wires the real client,
     * tests inject a fake. The dry-run overload isn't exposed by the API so
     * the type stays simple.
     */
    inference(args: { messages: ChatMessage[] }): Promise<InferenceResult>;
  };
  /**
   * Optional OTel tracer override. Production passes nothing — the global
   * tracer set up by `instrument0g({...})` is picked up automatically. Tests
   * pass an in-memory exporter's tracer for offline assertion.
   */
  tracer?: Tracer;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", withAccessLog({ tracer: deps.tracer }));
  app.use("*", withAttestation(deps));

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/chat", async (c) => {
    let body: { prompt?: string };
    try {
      body = (await c.req.json()) as { prompt?: string };
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    if (!body.prompt || typeof body.prompt !== "string") {
      return c.json({ error: "missing prompt" }, 400);
    }
    const result = await deps.compute.inference({
      messages: [{ role: "user", content: body.prompt }],
    });
    return c.json({ reply: result.output, txHash: result.receipt.txHash ?? null });
  });

  return app;
}
