import { describe, it, expect, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type RunDeps } from "../index.js";
import type { CreateOptions } from "../types.js";
import type { KitManifest, ApplyResult } from "@foundryprotocol/0gkit-kits";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal agent-memory manifest — compatible with react-app, has lib files. */
const AGENT_MEMORY_MANIFEST: KitManifest = {
  name: "agent-memory",
  title: "Agent Memory",
  domain: "agent-infra",
  summary: "Persistent agent memory on 0G Storage.",
  compatibleBases: ["react-app", "chat", "storage-app", "mcp-agent"],
  tiers: {
    lib: ["lib/agent-memory.ts"],
    adapters: {
      "react-app": ["app/api/memory/route.ts"],
    },
    ui: ["components/MemoryPanel.tsx"],
  },
  env: [],
  dependencies: {},
  devDependencies: {},
  requires: [],
  composes: [],
  conflicts: [],
};

/** A manifest that is NOT compatible with react-app. */
const REACT_INCOMPATIBLE_MANIFEST: KitManifest = {
  name: "tee-verifier",
  title: "TEE Verifier",
  domain: "verifiable-ai",
  summary: "TEE attestation verifier.",
  compatibleBases: ["tee-attested-api"],
  tiers: { lib: ["lib/tee.ts"] },
  env: [],
  dependencies: {},
  devDependencies: {},
  requires: [],
  composes: [],
  conflicts: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(
  extra: Partial<RunDeps> & { cwd: string }
): RunDeps & { logs: string[]; errs: string[] } {
  const logs: string[] = [];
  const errs: string[] = [];
  const base: RunDeps = {
    log: (m) => logs.push(m),
    err: (m) => errs.push(m),
    fetchTemplate: async ({ dest }) => {
      writeFileSync(join(dest, "package.json"), '{"name":"x"}');
      mkdirSync(join(dest, "src"), { recursive: true });
      writeFileSync(join(dest, "src/index.ts"), "// hi\n");
    },
    runInstall: async () => {},
    initGit: async () => ({ ok: true }),
    prompts: async () => null,
  };
  return { ...base, ...extra, logs, errs };
}

const argv = (...rest: string[]) => ["node", "create-0g-app", ...rest];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("run() — --kits flag", () => {
  it("calls applyKit once with correct args when --kits agent-memory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-"));
    const applyKitSpy = vi.fn().mockResolvedValue({
      applied: ["agent-memory"],
      filesWritten: ["lib/agent-memory.ts"],
      envAdded: [],
      notes: ["Add OG_STORAGE_NAMESPACE to your .env"],
      token: "[0gkit:kit-applied]" as const,
    });

    const deps = makeDeps({
      cwd,
      applyKit: applyKitSpy,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: (name) => (name === "agent-memory" ? AGENT_MEMORY_MANIFEST : undefined),
    });

    const code = await run(
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "agent-memory",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(code).toBe(0);
    expect(applyKitSpy).toHaveBeenCalledTimes(1);
    expect(applyKitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kit: "agent-memory",
        base: "react-app",
        dest: join(cwd, "my-app"),
      })
    );
  });

  it("surfaces kit notes in CLI output", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-notes-"));
    const applyKitSpy = vi.fn().mockResolvedValue({
      applied: ["agent-memory"],
      filesWritten: [],
      envAdded: [],
      notes: ["Remember to set OG_STORAGE_NAMESPACE"],
      token: "[0gkit:kit-applied]" as const,
    });

    const deps = makeDeps({
      cwd,
      applyKit: applyKitSpy,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: (name) => (name === "agent-memory" ? AGENT_MEMORY_MANIFEST : undefined),
    });

    await run(
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "agent-memory",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(deps.logs.join("\n")).toContain("Remember to set OG_STORAGE_NAMESPACE");
  });

  it("applies multiple kits when comma-separated", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-multi-"));
    const kitB: KitManifest = {
      name: "kit-b",
      title: "Kit B",
      domain: "agent-infra",
      summary: "B.",
      compatibleBases: ["react-app"],
      tiers: { lib: ["lib/b.ts"] },
      env: [],
      dependencies: {},
      devDependencies: {},
      requires: [],
      composes: [],
      conflicts: [],
    };

    const applyKitSpy = vi.fn().mockResolvedValue({
      applied: [],
      filesWritten: [],
      envAdded: [],
      notes: [],
      token: "[0gkit:kit-applied]" as const,
    });

    const allKits = [AGENT_MEMORY_MANIFEST, kitB];
    const deps = makeDeps({
      cwd,
      applyKit: applyKitSpy,
      listKits: () => allKits,
      getKit: (name) => allKits.find((k) => k.name === name),
    });

    const code = await run(
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "agent-memory,kit-b",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(code).toBe(0);
    expect(applyKitSpy).toHaveBeenCalledTimes(2);
    expect(applyKitSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kit: "agent-memory" })
    );
    expect(applyKitSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kit: "kit-b" })
    );
  });
});

describe("run() — --kits validation errors (early exit)", () => {
  it("exits 1 on unknown kit WITHOUT calling fetchTemplate or applyKit", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-unknown-"));
    const fetchTemplateSpy = vi.fn();
    const applyKitSpy = vi.fn();

    const deps = makeDeps({
      cwd,
      fetchTemplate: fetchTemplateSpy,
      applyKit: applyKitSpy,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: () => undefined, // nothing found
    });

    const code = await run(
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "does-not-exist",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(code).toBe(1);
    expect(fetchTemplateSpy).not.toHaveBeenCalled();
    expect(applyKitSpy).not.toHaveBeenCalled();
    expect(deps.errs.join("\n")).toMatch(/Unknown kit.*does-not-exist/);
  });

  it("prints the list of valid kits when an unknown kit is given", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-list-"));
    const deps = makeDeps({
      cwd,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: () => undefined,
    });

    await run(
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "does-not-exist",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(deps.errs.join("\n")).toContain("agent-memory");
  });

  it("exits 1 on kit incompatible with the chosen base WITHOUT calling fetchTemplate", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-incompat-"));
    const fetchTemplateSpy = vi.fn();

    const deps = makeDeps({
      cwd,
      fetchTemplate: fetchTemplateSpy,
      listKits: () => [], // no kits for this base
      getKit: (name) =>
        name === "tee-verifier" ? REACT_INCOMPATIBLE_MANIFEST : undefined,
    });

    const code = await run(
      // tee-verifier is only compatible with tee-attested-api, not react-app
      argv(
        "my-app",
        "--template",
        "react-app",
        "--kits",
        "tee-verifier",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(code).toBe(1);
    expect(fetchTemplateSpy).not.toHaveBeenCalled();
    expect(deps.errs.join("\n")).toMatch(/incompatible|not compatible|no.*files/i);
  });
});

describe("run() — interactive path with kits from prompts", () => {
  it("calls applyKit with kits selected interactively via prompts", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-interactive-"));
    const applyKitSpy = vi.fn().mockResolvedValue({
      applied: ["agent-memory"],
      filesWritten: [],
      envAdded: [],
      notes: [],
      token: "[0gkit:kit-applied]" as const,
    });

    const final: CreateOptions = {
      name: "from-prompt",
      template: "react-app",
      network: "local",
      packageManager: "npm",
      install: false,
      git: false,
      ci: "none",
      kits: ["agent-memory"],
      dest: "",
      example: true,
    };

    const deps = makeDeps({
      cwd,
      prompts: async () => final,
      applyKit: applyKitSpy,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: (name) => (name === "agent-memory" ? AGENT_MEMORY_MANIFEST : undefined),
    });

    const code = await run(argv(), deps);

    expect(code).toBe(0);
    expect(applyKitSpy).toHaveBeenCalledTimes(1);
    expect(applyKitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kit: "agent-memory",
        base: "react-app",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Fix 3 regression: kit env keys must survive into the final .env.example
// (writeEnvExample must run BEFORE applyKit so the kit's appendEnv appends
// to the base file rather than being overwritten by a later writeEnvExample)
// ---------------------------------------------------------------------------

describe("run() — kit env vars survive into .env.example (Fix 3 regression)", () => {
  it("kit env keys are present in .env.example after scaffolding with --kits", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cga-kits-env-"));

    // Simulate a real applyKit that appends kit env keys to the .env.example
    // file that already exists in dest (written by writeEnvExample before the
    // kit apply loop).
    const applyKitSpy = vi
      .fn()
      .mockImplementation(async ({ dest }: { dest: string }): Promise<ApplyResult> => {
        const envPath = join(dest, ".env.example");
        // .env.example must already exist (written by writeEnvExample before us)
        const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
        // Append kit-specific env keys (mirrors appendEnv behaviour)
        const kitEnvLines = [
          "",
          "# agent-memory kit",
          "OG_STORAGE_NAMESPACE=agent-memory",
          "OG_PRIVATE_KEY=0x...",
          "OG_RPC_URL=https://evmrpc-testnet.0g.ai",
        ].join("\n");
        writeFileSync(envPath, existing + kitEnvLines + "\n");
        return {
          applied: ["agent-memory"],
          filesWritten: ["lib/agent-memory.ts"],
          envAdded: ["OG_STORAGE_NAMESPACE", "OG_PRIVATE_KEY", "OG_RPC_URL"],
          notes: [],
          token: "[0gkit:kit-applied]" as const,
        };
      });

    const deps = makeDeps({
      cwd,
      applyKit: applyKitSpy,
      listKits: () => [AGENT_MEMORY_MANIFEST],
      getKit: (name) => (name === "agent-memory" ? AGENT_MEMORY_MANIFEST : undefined),
    });

    const code = await run(
      argv(
        "my-env-app",
        "--template",
        "react-app",
        "--kits",
        "agent-memory",
        "--no-install",
        "--no-git"
      ),
      deps
    );

    expect(code).toBe(0);

    const envContent = readFileSync(join(cwd, "my-env-app", ".env.example"), "utf8");

    // Base keys from writeEnvExample must be present
    expect(envContent).toContain("NETWORK=local");
    expect(envContent).toContain("RPC_URL=");

    // Kit-added keys must also be present (not clobbered by writeEnvExample)
    expect(envContent).toContain("OG_STORAGE_NAMESPACE=agent-memory");
    expect(envContent).toContain("OG_PRIVATE_KEY=0x...");
    expect(envContent).toContain("OG_RPC_URL=");
  });
});
