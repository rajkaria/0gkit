import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startComputeMock, type ComputeMockHandle } from "../compute-mock.js";

describe("compute-mock (stub mode)", () => {
  let mock: ComputeMockHandle;
  beforeEach(async () => {
    mock = await startComputeMock({ port: 0, mode: "stub" });
  });
  afterEach(async () => {
    await mock.stop();
  });

  it("/v1/models returns a list", async () => {
    const r = await fetch(`${mock.url}/v1/models`);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { data: { id: string }[] };
    expect(j.data.length).toBeGreaterThan(0);
    expect(j.data[0].id).toBe("0g/stub");
  });

  it("/v1/chat/completions echoes the last user message with [MOCK] prefix", async () => {
    const r = await fetch(`${mock.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "0g/stub",
        messages: [
          { role: "system", content: "ignore me" },
          { role: "user", content: "ping" },
        ],
      }),
    });
    expect(r.status).toBe(200);
    const j = (await r.json()) as {
      choices: { message: { role: string; content: string }; finish_reason: string }[];
      usage: { total_tokens: number };
    };
    expect(j.choices[0].message.role).toBe("assistant");
    expect(j.choices[0].message.content).toContain("[MOCK]");
    expect(j.choices[0].message.content).toContain("ping");
    expect(j.choices[0].finish_reason).toBe("stop");
    expect(j.usage.total_tokens).toBeGreaterThan(0);
  });

  it("returns 404 for unknown routes", async () => {
    const r = await fetch(`${mock.url}/whatever`);
    expect(r.status).toBe(404);
  });
});
