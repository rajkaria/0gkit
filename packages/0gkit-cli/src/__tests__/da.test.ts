import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const da = {
    publish: vi.fn(async () => ({
      digest: "0x" + "a".repeat(64),
      daRef: "ref-1",
      blobId: "blob-1",
      mode: "live" as const,
      latencyMs: 7,
      raw: {},
    })),
    verify: vi.fn(() => true),
    digest: vi.fn(() => "0x" + "a".repeat(64)),
  };
  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(),
    makeCompute: vi.fn(),
    makeDA: vi.fn(() => da),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(async () => new Uint8Array([120])), // "x"
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array([121])), // "y"
    cwd: () => "/w",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines, da };
}

describe("0g da", () => {
  it("publish reads a file and prints digest/daRef/mode", async () => {
    const { d, lines, da } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["da", "publish", "./blob.bin", "--json"], { from: "user" });
    expect(da.publish).toHaveBeenCalledWith(new Uint8Array([120]));
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      digest: "0x" + "a".repeat(64),
      daRef: "ref-1",
      mode: "live",
    });
  });

  it("publish reads stdin when file is '-'", async () => {
    const { d, da } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["da", "publish", "-", "--json"], { from: "user" });
    expect(da.publish).toHaveBeenCalledWith(new Uint8Array([121]));
  });

  it("verify reports true/false against an expected digest", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["da", "verify", "./blob.bin", "0x" + "a".repeat(64), "--json"],
      { from: "user" }
    );
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ ok: true, verified: true });
  });
});
