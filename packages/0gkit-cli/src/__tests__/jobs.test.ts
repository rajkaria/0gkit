import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";
import type { JobBackendLike } from "../commands/jobs.js";

function makeRec(
  over: Partial<{
    id: string;
    name: string;
    state: string;
    attempts: number;
    result?: unknown;
    error?: string;
  }> = {}
) {
  return {
    id: over.id ?? "abc-12345678",
    name: over.name ?? "echo",
    state: over.state ?? "done",
    input: { x: 1 },
    result: over.result,
    error: over.error,
    metadata: {
      attempts: over.attempts ?? 1,
      createdAt: 1700000000000,
      startedAt: 1700000001000,
      finishedAt: 1700000002000,
    },
  };
}

function deps(stubBackend: JobBackendLike, over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const base = {
    createClient: vi.fn(),
    getNetwork: vi.fn(() => ({ name: "galileo", explorer: "https://e" })),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn(),
    explorerUrl: vi.fn(),
    makeStorage: vi.fn(),
    makeCompute: vi.fn(),
    makeDA: vi.fn(),
    attest: {
      parseEnvelope: vi.fn(),
      verifyEnvelope: vi.fn(),
      reportEnvelope: vi.fn(),
    },
    devnet: {
      startDevnet: vi.fn(),
      stopDevnet: vi.fn(),
      isRunning: vi.fn(),
      readState: vi.fn(),
      clearState: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    contracts: {
      generate: vi.fn(),
      listStandard: vi.fn(() => []),
      getStandard: vi.fn(() => null),
      estimate: vi.fn(),
    },
    jobsBackendFactory: vi.fn(() => stubBackend),
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    fetch: vi.fn(),
    cwd: () => "/w",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines };
}

describe("0g jobs status", () => {
  it("prints the job record as JSON when --json", async () => {
    const backend: JobBackendLike = {
      status: vi.fn(async (id: string) => makeRec({ id })),
      close: vi.fn(async () => {}),
    };
    const { d, lines } = deps(backend);
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["jobs", "status", "abc-12345678", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(true);
    expect(out.id).toBe("abc-12345678");
    expect(out.state).toBe("done");
    expect(backend.close).toHaveBeenCalled();
  });

  it("emits human output by default", async () => {
    const backend: JobBackendLike = {
      status: vi.fn(async () => makeRec({ state: "running", attempts: 2 })),
      close: vi.fn(async () => {}),
    };
    const { d, lines } = deps(backend);
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["jobs", "status", "abc-12345678"], { from: "user" });
    const joined = lines.join("\n");
    expect(joined).toContain("state     running");
    expect(joined).toContain("attempts  2");
  });

  it("exits 1 with CONFIG_INVALID_ARGUMENT when the job is unknown", async () => {
    const backend: JobBackendLike = {
      status: vi.fn(async () => null),
      close: vi.fn(async () => {}),
    };
    const { d, lines } = deps(backend);
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["jobs", "status", "ghost", "--json"], { from: "user" });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(out.error.message).toContain("no job");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("rejects unknown --backend values with a clean hint", async () => {
    const backend: JobBackendLike = {
      status: vi.fn(async () => null),
      close: vi.fn(async () => {}),
    };
    const { d, lines } = deps(backend);
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["jobs", "status", "x", "--backend", "weird", "--json"], {
      from: "user",
    });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(out.error.message).toContain("unknown backend");
    process.exitCode = 0;
  });

  it("passes --backend and --path through to the factory", async () => {
    const backend: JobBackendLike = {
      status: vi.fn(async () => makeRec({})),
      close: vi.fn(async () => {}),
    };
    const factory = vi.fn(() => backend);
    const { d } = deps(backend, {
      jobsBackendFactory: factory as unknown as ProgramDeps["jobsBackendFactory"],
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      [
        "jobs",
        "status",
        "abc-12345678",
        "--backend",
        "sqlite",
        "--path",
        "/tmp/x.db",
        "--json",
      ],
      { from: "user" }
    );
    expect(factory).toHaveBeenCalledWith("sqlite", "/tmp/x.db");
  });
});
