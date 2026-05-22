import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const writes: Record<string, string> = {};
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
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(async (p: string, d: Uint8Array | string) => {
        writes[p] = typeof d === "string" ? d : Buffer.from(d).toString();
      }),
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    cwd: () => "/work",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines, writes };
}

describe("0g init", () => {
  it("scaffolds a runnable galileo project (json reports files)", async () => {
    const { d, lines, writes } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["init", "my-app", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.dir).toBe("/work/my-app");
    expect(out.files.sort()).toEqual(
      [".env.example", ".gitignore", "README.md", "index.mjs", "package.json"].sort()
    );
    expect(writes["/work/my-app/.env.example"]).toContain("ZEROG_NETWORK=galileo");
    expect(writes["/work/my-app/index.mjs"]).toContain(
      'from "@foundryprotocol/0gkit-core"'
    );
    expect(JSON.parse(writes["/work/my-app/package.json"]).dependencies).toHaveProperty(
      "@foundryprotocol/0gkit-core"
    );
  });

  it("refuses to overwrite a non-empty directory", async () => {
    const { d, lines } = deps({
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(async () => ["existing.txt"]),
        exists: vi.fn(async () => true),
      } as any,
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["init", "occupied", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(out.error.hint).toContain("empty");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("defaults the directory name to 0g-app", async () => {
    const { d, lines } = deps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["init", "--json"], { from: "user" });
    expect(JSON.parse(lines.at(-1)!).dir).toBe("/work/0g-app");
    process.exitCode = 0;
  });
});
