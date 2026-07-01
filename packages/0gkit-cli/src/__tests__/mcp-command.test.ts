/**
 * Tests for `0g mcp init <agent>` (K6 T3-B).
 *
 * Key invariants:
 * - `@foundryprotocol/0gkit-mcp` is lazy-imported (D39 / D88). Tests
 *   inject `deps.mcpConfig` to bypass the real dynamic import entirely —
 *   mirrors how `0g test` injects `deps.runConformance`.
 * - `homedir` is available on ProgramDeps and is injected with a test value.
 * - Invalid agents surface as ConfigError (exitCode=1).
 * - With kitted mcp-agent project (fake readAppliedKits), the command
 *   writes the LOCAL npm-start server entry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { buildProgram, type ProgramDeps } from "../program.js";

// ---------------------------------------------------------------------------
// Inline stubs for mcpConfig seam (avoid importing @foundryprotocol/0gkit-mcp
// which is not a dep of this package; the production path lazy-imports it).
// ---------------------------------------------------------------------------

type McpServerEntry = { command: string; args: string[]; env?: Record<string, string> };
type BuiltMcpConfig = {
  path: string;
  json: { mcpServers: Record<string, McpServerEntry> };
  mode: "neutral" | "local";
  kits: string[];
};

const AGENTS = ["cursor", "claude", "windsurf", "codex"] as const;
type AgentName = (typeof AGENTS)[number];

const PATHS: Record<AgentName, { project: string; global: string }> = {
  cursor: { project: ".cursor/mcp.json", global: ".cursor/mcp.json" },
  claude: { project: ".mcp.json", global: ".claude/mcp.json" },
  windsurf: {
    project: ".windsurf/mcp.json",
    global: ".codeium/windsurf/mcp_config.json",
  },
  codex: { project: ".codex/mcp.json", global: ".codex/mcp.json" },
};

function stubBuildMcpConfig(opts: {
  agent: string;
  scope: "project" | "global";
  home: string;
  cwd: string;
  applied?: { applied: string[]; base: string } | null;
}): BuiltMcpConfig {
  if (!(AGENTS as readonly string[]).includes(opts.agent)) {
    throw new ConfigError(
      `Unknown agent '${opts.agent}'.`,
      `Use one of: ${AGENTS.join(", ")}.`
    );
  }
  const agent = opts.agent as AgentName;
  const rel = PATHS[agent][opts.scope];
  const base = opts.scope === "global" ? opts.home : opts.cwd;
  const path = `${base}/${rel}`;
  const useLocal =
    opts.scope === "project" &&
    opts.applied?.base === "mcp-agent" &&
    (opts.applied?.applied.length ?? 0) > 0;
  const entry: McpServerEntry = useLocal
    ? { command: "npm", args: ["--prefix", opts.cwd, "start"] }
    : { command: "npx", args: ["-y", "@foundryprotocol/0gkit-mcp"] };
  return {
    path,
    json: { mcpServers: { "0gkit": entry } },
    mode: useLocal ? "local" : "neutral",
    kits: useLocal ? [...(opts.applied?.applied ?? [])] : [],
  };
}

async function stubReadAppliedKits(
  cwd: string,
  fs: { readFile(path: string): Promise<Uint8Array | string> }
): Promise<{ applied: string[]; base: string } | null> {
  try {
    const raw = await fs.readFile(`${cwd}/.0gkit/kits.json`);
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>).applied) &&
      typeof (parsed as Record<string, unknown>).base === "string"
    ) {
      return {
        applied: (parsed as Record<string, unknown>).applied as string[],
        base: (parsed as Record<string, unknown>).base as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const defaultMcpConfig = {
  buildMcpConfig: stubBuildMcpConfig,
  readAppliedKits: stubReadAppliedKits,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(over: Partial<ProgramDeps> = {}): {
  d: ProgramDeps;
  lines: string[];
  errLines: string[];
  writes: Array<{ path: string; data: string }>;
  mkdirs: string[];
} {
  const lines: string[] = [];
  const errLines: string[] = [];
  const writes: Array<{ path: string; data: string }> = [];
  const mkdirs: string[] = [];

  const base: ProgramDeps = {
    createClient: vi.fn(),
    getNetwork: vi.fn(),
    faucet: vi.fn(),
    balance: vi.fn(),
    waitForReceipt: vi.fn(),
    attachExplorerUrl: vi.fn((r) => r),
    explorerUrl: vi.fn(() => "https://x/tx/0x"),
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
      isRunning: vi.fn(async () => false),
      readState: vi.fn(() => null),
      clearState: vi.fn(),
    },
    loadFoundry: vi.fn(async () => null),
    contracts: {
      generate: vi.fn(),
      listStandard: vi.fn(() => []),
      getStandard: vi.fn(() => null),
      estimate: vi.fn(),
    },
    jobsBackendFactory: vi.fn(),
    storageEstimate: vi.fn(),
    computeEstimate: vi.fn(),
    daEstimate: vi.fn(),
    tracesReader: {
      defaultTraceDir: vi.fn(() => null),
      listTraceFiles: vi.fn(async () => []),
      readTraceFile: vi.fn(async () => []),
      summarizeTrace: vi.fn(() => ({ id: "", spans: [] })),
    },
    fs: {
      readFile: vi.fn(async () => {
        throw new Error("ENOENT");
      }),
      writeFile: vi.fn(async (p: string, d: string | Uint8Array) => {
        writes.push({
          path: p,
          data: typeof d === "string" ? d : new TextDecoder().decode(d),
        });
      }),
      mkdir: vi.fn(async (p: string) => {
        mkdirs.push(p);
      }),
      readdir: vi.fn(async () => []),
      exists: vi.fn(async () => false),
    },
    readStdin: vi.fn(async () => new Uint8Array()),
    fetch: vi.fn(async () => ({ status: 200 })),
    cwd: () => "/fake/project",
    homedir: () => "/fake/home",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    argv: [],
    writeErr: (s: string) => errLines.push(s),
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    loadKitsEngine: vi.fn(async () => ({
      applyKit: vi.fn(),
      listKits: vi.fn(() => []),
      getKit: vi.fn(() => undefined),
      detectBase: vi.fn(() => "node"),
    })),
    runConformance: vi.fn(async () => []),
    conformanceDeps: vi.fn(() => ({
      makeStorage: vi.fn(),
      makeCompute: vi.fn(),
      makeDA: vi.fn(),
      testWallet: vi.fn(),
    })),
    runKitConformance: vi.fn(async () => []),
    // D39 seam: inject inline stubs so no real 0gkit-mcp import occurs.
    mcpConfig: defaultMcpConfig,
    ...over,
  } as unknown as ProgramDeps;

  return { d: base, lines, errLines, writes, mkdirs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("0g mcp init", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });
  afterEach(() => {
    process.exitCode = 0;
  });

  it("writes .cursor/mcp.json with neutral npx server for 'cursor' (project scope)", async () => {
    const { d, lines, writes, mkdirs } = makeDeps();

    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["mcp", "init", "cursor"], { from: "user" });

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("/fake/project/.cursor/mcp.json");
    const json = JSON.parse(writes[0].data) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(json.mcpServers["0gkit"].command).toBe("npx");
    expect(json.mcpServers["0gkit"].args).toContain("@foundryprotocol/0gkit-mcp");
    // mkdir called for parent dir
    expect(mkdirs.length).toBeGreaterThanOrEqual(1);
    expect(mkdirs[0]).toBe("/fake/project/.cursor");
    const output = lines.join("\n");
    expect(output).toContain(".cursor/mcp.json");
  });

  it("--global writes to <homedir>/.claude/mcp.json for 'claude'", async () => {
    const { d, writes } = makeDeps();

    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["mcp", "init", "claude", "--global"], { from: "user" });

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("/fake/home/.claude/mcp.json");
  });

  it("invalid agent surfaces ConfigError and sets exitCode=1", async () => {
    const { d, lines } = makeDeps();

    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["mcp", "init", "vscode", "--json"], { from: "user" });

    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(lines.at(-1)!) as {
      ok: boolean;
      error: { message: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/vscode/);
    process.exitCode = 0;
  });

  it("kitted mcp-agent project → local npm-start server entry + lists kits", async () => {
    const kitsJson = JSON.stringify({
      applied: ["agent-memory"],
      base: "mcp-agent",
      at: "2026-01-01T00:00:00.000Z",
    });
    const writes: Array<{ path: string; data: string }> = [];
    const { d, lines } = makeDeps({
      fs: {
        readFile: vi.fn(async (p: string) => {
          if (p.endsWith("kits.json")) return new TextEncoder().encode(kitsJson);
          throw new Error("ENOENT");
        }),
        writeFile: vi.fn(async (p: string, data: string | Uint8Array) => {
          writes.push({
            path: p,
            data: typeof data === "string" ? data : new TextDecoder().decode(data),
          });
        }),
        mkdir: vi.fn(async () => {}),
        readdir: vi.fn(async () => []),
        exists: vi.fn(async () => false),
      } as unknown as ProgramDeps["fs"],
    });

    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["mcp", "init", "cursor"], { from: "user" });

    expect(writes).toHaveLength(1);
    const json = JSON.parse(writes[0].data) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(json.mcpServers["0gkit"].command).toBe("npm");
    expect(json.mcpServers["0gkit"].args).toEqual([
      "--prefix",
      "/fake/project",
      "start",
    ]);

    const output = lines.join("\n");
    expect(output).toContain("agent-memory");
  });
});
