import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { runMintFlow } from "../mint-flow.js";
import type { Receipt } from "@foundryprotocol/0gkit-core";

function sha256Hex(bytes: Uint8Array): string {
  return "0x" + createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function fakeStorage() {
  return {
    upload: async (data: Uint8Array) => ({
      root: sha256Hex(data),
      tx: { txHash: "0xfeed", latencyMs: 7 } as Receipt,
    }),
  };
}

describe("runMintFlow", () => {
  it("uploads media + metadata and calls mint with the metadata root", async () => {
    const storage = fakeStorage();
    const mintCalls: { to: string; metadataRoot: string }[] = [];
    const result = await runMintFlow(
      {
        recipient: "0x0000000000000000000000000000000000000001",
        name: "Genesis",
        description: "First mint.",
        media: new Uint8Array([1, 2, 3, 4]),
      },
      {
        storage,
        mint: async (to, root) => {
          mintCalls.push({ to, metadataRoot: root });
          return { txHash: "0xmint", latencyMs: 3 };
        },
        log: () => undefined,
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mintTx).toBe("0xmint");
    expect(result.metadataRoot).toMatch(/^0x[0-9a-f]+$/);
    expect(mintCalls).toHaveLength(1);
    expect(mintCalls[0]?.metadataRoot).toBe(result.metadataRoot);
  });

  it("returns an error when the media upload fails", async () => {
    const storage = {
      upload: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const result = await runMintFlow(
      {
        recipient: "0x0000000000000000000000000000000000000001",
        name: "X",
        description: "Y",
        media: new Uint8Array([1]),
      },
      {
        storage,
        mint: async () => ({ txHash: "0x", latencyMs: 1 }),
        log: () => undefined,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/media upload/);
  });

  it("returns an error when the metadata upload fails", async () => {
    let calls = 0;
    const storage = {
      upload: async (data: Uint8Array) => {
        calls += 1;
        if (calls === 1) {
          return { root: sha256Hex(data), tx: { txHash: "0x", latencyMs: 1 } as Receipt };
        }
        throw new Error("oom");
      },
    };
    const result = await runMintFlow(
      {
        recipient: "0x0000000000000000000000000000000000000001",
        name: "X",
        description: "Y",
        media: new Uint8Array([1]),
      },
      {
        storage,
        mint: async () => ({ txHash: "0x", latencyMs: 1 }),
        log: () => undefined,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/metadata upload/);
  });

  it("returns an error when the mint tx fails", async () => {
    const storage = fakeStorage();
    const result = await runMintFlow(
      {
        recipient: "0x0000000000000000000000000000000000000001",
        name: "X",
        description: "Y",
        media: new Uint8Array([1, 2]),
      },
      {
        storage,
        mint: async () => {
          throw new Error("revert: not owner");
        },
        log: () => undefined,
      }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/mint failed.*revert/);
  });

  it("logs each step", async () => {
    const storage = fakeStorage();
    const lines: string[] = [];
    await runMintFlow(
      {
        recipient: "0x0000000000000000000000000000000000000001",
        name: "X",
        description: "Y",
        media: new Uint8Array([1, 2]),
      },
      {
        storage,
        mint: async () => ({ txHash: "0xa", latencyMs: 1 }),
        log: (m) => lines.push(m),
      }
    );
    expect(lines.some((l) => l.startsWith("Media uploaded"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Metadata uploaded"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Minted to"))).toBe(true);
  });
});
