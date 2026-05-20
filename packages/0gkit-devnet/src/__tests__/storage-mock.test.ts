import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStorageMock, type StorageMockHandle } from "../storage-mock.js";

describe("storage-mock", () => {
  let dir: string;
  let mock: StorageMockHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "devnet-storage-"));
    mock = await startStorageMock({ port: 0, stateDir: dir });
  });

  afterEach(async () => {
    await mock.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads bytes and returns a 0x-prefixed root", async () => {
    const r = await fetch(`${mock.url}/upload`, {
      method: "POST",
      body: new TextEncoder().encode("hello 0g"),
    });
    expect(r.status).toBe(200);
    const { root, size } = (await r.json()) as { root: string; size: number };
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(size).toBe(8);
  });

  it("download round-trips bytes by root", async () => {
    const body = new TextEncoder().encode("round trip");
    const up = await fetch(`${mock.url}/upload`, { method: "POST", body });
    const { root } = (await up.json()) as { root: string };
    const dl = await fetch(`${mock.url}/download/${root}`);
    expect(dl.status).toBe(200);
    const got = new Uint8Array(await dl.arrayBuffer());
    expect(new TextDecoder().decode(got)).toBe("round trip");
  });

  it("returns 404 for unknown root", async () => {
    const r = await fetch(`${mock.url}/download/0x${"0".repeat(64)}`);
    expect(r.status).toBe(404);
  });

  it("/exists/<root> reports availability", async () => {
    const up = await fetch(`${mock.url}/upload`, {
      method: "POST",
      body: new TextEncoder().encode("e"),
    });
    const { root } = (await up.json()) as { root: string };
    const yes = await fetch(`${mock.url}/exists/${root}`);
    expect(await yes.json()).toEqual({ exists: true });
    const no = await fetch(`${mock.url}/exists/0x${"0".repeat(64)}`);
    expect(await no.json()).toEqual({ exists: false });
  });
});
