import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

const SIGNED = {
  envelope: {
    kind: "foundry/eval-result/v1",
    forge: "0xforge",
    scores: [1, 2],
    baseline: 1,
    teeAttestation: "0xtee",
    coordinator: "0xcoord",
    timestamp: 1700000000,
  },
  digest: "0x" + "d".repeat(64),
  signature: "0x" + "s".repeat(130),
};
const SIGNER = "0x2222222222222222222222222222222222222222";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
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
    makeDA: vi.fn(),
    attest: {
      parseEnvelope: vi.fn((e) => e.envelope ?? e),
      verifyEnvelope: vi.fn(async () => ({
        ok: true,
        checks: { digest: true, signer: true },
        signer: SIGNER,
      })),
      reportEnvelope: vi.fn(
        () => "attestation foundry/eval-result/v1\n  forge 0xforge"
      ),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(async () => new TextEncoder().encode(JSON.stringify(SIGNED))),
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
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

describe("0g attest", () => {
  it("verify a valid signed envelope → ok:true with checks", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["attest", "verify", "./signed.json", "--signer", SIGNER, "--json"],
      { from: "user" }
    );
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({
      ok: true,
      verified: true,
      checks: { digest: true, signer: true },
      signer: SIGNER,
    });
  });

  it("verify a tampered envelope → ok:false, exit 1", async () => {
    const { d, lines } = deps({
      attest: {
        parseEnvelope: vi.fn((e) => e.envelope ?? e),
        verifyEnvelope: vi.fn(async () => ({
          ok: false,
          checks: { digest: false, signer: false },
          signer: "0x0000000000000000000000000000000000000000",
        })),
        reportEnvelope: vi.fn(() => "report"),
      } as any,
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      ["attest", "verify", "./bad.json", "--signer", SIGNER, "--json"],
      { from: "user" }
    );
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true); // command itself succeeded…
    expect(out.verified).toBe(false); // …but verification failed
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("verify requires --signer", async () => {
    const { d } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    p.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    await expect(
      p.parseAsync(["attest", "verify", "./signed.json", "--json"], { from: "user" })
    ).rejects.toThrow(/required option/i);
    process.exitCode = 0;
  });

  it("report prints the human envelope summary", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["attest", "report", "./signed.json"], { from: "user" });
    expect(lines.join("\n")).toContain("attestation foundry/eval-result/v1");
  });
});
