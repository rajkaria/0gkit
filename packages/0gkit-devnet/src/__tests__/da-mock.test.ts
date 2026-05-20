import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startDaMock, type DaMockHandle } from "../da-mock.js";

describe("da-mock", () => {
  let mock: DaMockHandle;
  beforeEach(async () => {
    mock = await startDaMock({ port: 0 });
  });
  afterEach(async () => {
    await mock.stop();
  });

  it("publish returns a 0x-prefixed digest", async () => {
    const r = await fetch(`${mock.url}/publish`, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });
    expect(r.status).toBe(200);
    const { digest, size } = (await r.json()) as { digest: string; size: number };
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(size).toBe(3);
  });

  it("verify returns true for a known digest, false otherwise", async () => {
    const up = await fetch(`${mock.url}/publish`, {
      method: "POST",
      body: new Uint8Array([9, 8, 7]),
    });
    const { digest } = (await up.json()) as { digest: string };
    const yes = await fetch(`${mock.url}/verify/${digest}`);
    expect(await yes.json()).toEqual({ available: true });
    const no = await fetch(`${mock.url}/verify/0x${"0".repeat(64)}`);
    expect(await no.json()).toEqual({ available: false });
  });

  it("fetch returns the published bytes", async () => {
    const data = new Uint8Array([42, 43, 44, 45]);
    const up = await fetch(`${mock.url}/publish`, { method: "POST", body: data });
    const { digest } = (await up.json()) as { digest: string };
    const dl = await fetch(`${mock.url}/fetch/${digest}`);
    expect(dl.status).toBe(200);
    const got = new Uint8Array(await dl.arrayBuffer());
    expect(Array.from(got)).toEqual([42, 43, 44, 45]);
  });
});
