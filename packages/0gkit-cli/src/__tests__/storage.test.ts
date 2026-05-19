import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const written: Record<string, Uint8Array | string> = {};
  const storage = {
    upload: vi.fn(async () => ({
      root: "0xroot",
      tx: { txHash: "0xtx", latencyMs: 5 },
      raw: {},
    })),
    download: vi.fn(async () => new Uint8Array([104, 105])), // "hi"
    exists: vi.fn(async () => true),
  };
  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(() => ({ name: "galileo", explorer: "https://e" })),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r, _n) => ({ ...r, explorerUrl: "https://e/tx/0xtx" })),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(() => storage),
    makeCompute: vi.fn(),
    makeDA: vi.fn(),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
      writeFile: vi.fn(async (p: string, d: Uint8Array | string) => {
        written[p] = d;
      }),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    cwd: () => "/w",
    env: { ZEROG_PRIVATE_KEY: "0x" + "1".repeat(64) },
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines, storage, written };
}

describe("0g storage", () => {
  it("put uploads file bytes and attaches the explorer link", async () => {
    const { d, lines, storage } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["storage", "put", "./f.bin", "--json"], { from: "user" });
    expect(storage.upload).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      root: "0xroot",
      txHash: "0xtx",
      explorerUrl: "https://e/tx/0xtx",
    });
  });

  it("put errors with a hint when no signer key is set", async () => {
    const { d, lines } = deps({ env: {} });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["storage", "put", "./f.bin", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG");
    expect(out.error.hint).toContain("ZEROG_PRIVATE_KEY");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("get writes downloaded bytes to the out path", async () => {
    const { d, lines, written } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["storage", "get", "0xroot", "./out.bin", "--json"], {
      from: "user",
    });
    expect(written["/w/out.bin"]).toEqual(new Uint8Array([104, 105]));
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ ok: true, bytes: 2 });
  });

  it("exists reports a boolean", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["storage", "exists", "0xroot", "--json"], { from: "user" });
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ ok: true, exists: true });
  });

  it("rejects --network local for storage with a clear hint", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["storage", "exists", "0xroot", "--network", "local", "--json"],
      {
        from: "user",
      }
    );
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.hint).toContain("galileo");
    process.exitCode = 0;
  });
});
