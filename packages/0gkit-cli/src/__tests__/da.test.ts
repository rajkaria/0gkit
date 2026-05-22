import { describe, it, expect, vi } from "vitest";
import { DA } from "@foundryprotocol/0gkit-da";
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

describe("0g da publish --dry-run", () => {
  // A fetch implementation that throws — DA.publish({ dryRun: true }) must
  // never call the encoder.
  const noFetch = (async () => {
    throw new Error("--dry-run must not POST to the encoder");
  }) as unknown as typeof fetch;

  function dryRunDeps() {
    const lines: string[] = [];
    const makeDA = (cfg: ConstructorParameters<typeof DA>[0]) =>
      new DA({ ...cfg, fetch: noFetch });
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
      makeDA: vi.fn(makeDA),
      attest: {
        parseEnvelope: vi.fn(),
        verifyEnvelope: vi.fn(),
        reportEnvelope: vi.fn(),
      },
      loadFoundry: vi.fn(async () => null),
      fs: {
        readFile: vi.fn(async () => new Uint8Array(16)),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(async () => []),
        exists: vi.fn(async () => false),
      },
      readStdin: vi.fn(async () => new Uint8Array()),
      cwd: () => "/w",
      env: {},
      isTTY: false,
      noColor: true,
      write: (s: string) => lines.push(s),
    } as unknown as ProgramDeps;
    return { d: base, lines };
  }

  it("does not POST and returns a structured DryRunResult (--json)", async () => {
    const { d, lines } = dryRunDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["da", "publish", "./blob.bin", "--dry-run", "--json"], {
      from: "user",
    });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.dryRun).toBe(true);
    expect(out.estimate.kind).toBe("da");
    expect(typeof out.estimate.gas).toBe("string");
    expect(typeof out.estimate.fee).toBe("string");
    expect(out.result.digest).toMatch(/^0x[0-9a-f]+$/);
  });

  it("prints [dry-run] human lines by default", async () => {
    const { d, lines } = dryRunDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["da", "publish", "./blob.bin", "--dry-run"], {
      from: "user",
    });
    const out = lines.join("\n");
    expect(out).toContain("[dry-run] would publish ./blob.bin");
    expect(out).toContain("kind        da");
    expect(out).toMatch(/digest 0x[0-9a-f]+/);
  });
});
