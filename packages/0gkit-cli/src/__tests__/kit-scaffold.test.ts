/**
 * Tests for `0g kits new <name>` — the kit scaffolder (author-your-own-kit).
 *
 * Two layers:
 *   1. buildKitScaffold() — the pure file-generator. Tested directly so the
 *      generated manifest + tier files are provably valid without touching disk.
 *      These assertions mirror the invariants the repo's `pnpm kits:check`
 *      enforces on committed kits:
 *        - kit.json parses + has every required field
 *        - every file named in tiers.{lib,adapters,ui} exists in the output set
 *        - the lib tier imports NO @foundryprotocol/* package (neutrality)
 *   2. The `0g kits new` command — wired through buildProgram, writing via the
 *      injected FsLike (no real filesystem), so validation + IO behavior are
 *      covered end to end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";
import { buildKitScaffold, KIT_DOMAINS } from "../commands/kit-scaffold.js";

// ---------------------------------------------------------------------------
// buildKitScaffold — pure generator
// ---------------------------------------------------------------------------

describe("buildKitScaffold", () => {
  const base = {
    name: "my-feature",
    title: "My Feature",
    domain: "agent-infra",
    summary: "Does a useful thing on 0G.",
    bases: ["react-app", "mcp-agent"],
  };

  function fileMap(scaffold: ReturnType<typeof buildKitScaffold>) {
    return new Map(scaffold.files.map((f) => [f.path, f.contents]));
  }

  it("emits a kit.json that carries the supplied metadata", () => {
    const s = buildKitScaffold(base);
    const manifest = JSON.parse(fileMap(s).get("kit.json")!) as Record<string, unknown>;
    expect(manifest.name).toBe("my-feature");
    expect(manifest.title).toBe("My Feature");
    expect(manifest.domain).toBe("agent-infra");
    expect(manifest.summary).toBe("Does a useful thing on 0G.");
    expect(manifest.compatibleBases).toEqual(["react-app", "mcp-agent"]);
  });

  it("kit.json contains every schema field the engine defaults (registry-safe)", () => {
    const s = buildKitScaffold(base);
    const manifest = JSON.parse(fileMap(s).get("kit.json")!) as Record<string, unknown>;
    for (const key of [
      "tiers",
      "env",
      "dependencies",
      "devDependencies",
      "requires",
      "composes",
      "conflicts",
    ]) {
      expect(manifest, `missing ${key}`).toHaveProperty(key);
    }
  });

  it("names the lib file in tiers.lib and ships it", () => {
    const s = buildKitScaffold(base);
    const map = fileMap(s);
    const manifest = JSON.parse(map.get("kit.json")!) as {
      tiers: { lib: string[] };
    };
    expect(manifest.tiers.lib).toContain("lib/my-feature.ts");
    expect(map.has("lib/my-feature.ts")).toBe(true);
  });

  it("every file named in the manifest exists in the output (files-exist invariant)", () => {
    const s = buildKitScaffold(base);
    const map = fileMap(s);
    const manifest = JSON.parse(map.get("kit.json")!) as {
      tiers: {
        lib: string[];
        adapters?: Record<string, string[]>;
        ui?: string[];
      };
    };
    const named = [
      ...manifest.tiers.lib,
      ...Object.values(manifest.tiers.adapters ?? {}).flat(),
      ...(manifest.tiers.ui ?? []),
    ];
    for (const rel of named) {
      // adapter paths in the manifest are project-relative; on disk they live
      // under adapters/<base>/. The scaffold output keys use the on-disk paths.
      const onDisk = s.files.some((f) => f.path.endsWith(rel));
      expect(onDisk, `manifest names ${rel} but no file ships it`).toBe(true);
    }
  });

  it("the lib tier imports no @foundryprotocol package (neutrality)", () => {
    const s = buildKitScaffold(base);
    const lib = fileMap(s).get("lib/my-feature.ts")!;
    // The boundary is about IMPORTS, not prose — the lib must not import any
    // @foundryprotocol package (all 0G primitives are injected by adapters).
    expect(lib).not.toMatch(/import[^;]*@foundryprotocol/);
  });

  it("includes the UI tier when a React-capable base is present", () => {
    const s = buildKitScaffold({ ...base, bases: ["react-app"] });
    expect(s.hasUi).toBe(true);
    const map = fileMap(s);
    expect(map.has("ui/components/MyFeaturePanel.tsx")).toBe(true);
    expect(map.has("ui/hooks/useMyFeature.ts")).toBe(true);
    const manifest = JSON.parse(map.get("kit.json")!) as {
      tiers: { ui?: string[] };
    };
    expect(manifest.tiers.ui).toBeDefined();
  });

  it("omits the UI tier when no React-capable base is present", () => {
    const s = buildKitScaffold({ ...base, bases: ["mcp-agent", "node"] });
    expect(s.hasUi).toBe(false);
    const map = fileMap(s);
    expect([...map.keys()].some((k) => k.startsWith("ui/"))).toBe(false);
    const manifest = JSON.parse(map.get("kit.json")!) as {
      tiers: { ui?: string[] };
    };
    expect(manifest.tiers.ui).toBeUndefined();
  });

  it("uses the per-base adapter path convention", () => {
    const s = buildKitScaffold({
      ...base,
      bases: ["react-app", "mcp-agent", "node"],
    });
    const keys = s.files.map((f) => f.path);
    expect(keys).toContain("adapters/react-app/app/api/my-feature/route.ts");
    expect(keys).toContain("adapters/mcp-agent/src/tools/my-feature.ts");
    expect(keys).toContain("adapters/node/src/my-feature.ts");
  });

  it("derives PascalCase/camelCase identifiers from the kebab name", () => {
    const s = buildKitScaffold({ ...base, bases: ["react-app"] });
    const lib = new Map(s.files.map((f) => [f.path, f.contents])).get(
      "lib/my-feature.ts"
    )!;
    expect(lib).toMatch(/async function runMyFeature/);
    expect(lib).toMatch(/MyFeatureResult/);
  });

  it("produces a doc-page stub and a nav entry for the catalog", () => {
    const s = buildKitScaffold(base);
    expect(s.docPage.path).toBe("apps/docs/app/kits/my-feature/page.mdx");
    expect(s.docPage.contents).toMatch(/My Feature/);
    expect(s.navLine).toContain('href: "/kits/my-feature"');
  });

  it("exposes the canonical kit domains", () => {
    expect(KIT_DOMAINS).toContain("agent-infra");
    expect(KIT_DOMAINS).toContain("verifiable-ai");
    expect(KIT_DOMAINS).toContain("markets");
    expect(KIT_DOMAINS).toContain("assets");
    expect(KIT_DOMAINS).toContain("defi");
  });
});

// ---------------------------------------------------------------------------
// `0g kits new` command
// ---------------------------------------------------------------------------

function makeDeps(over: Partial<ProgramDeps> = {}): {
  d: ProgramDeps;
  lines: string[];
  writes: Array<{ path: string; data: string }>;
  mkdirs: string[];
} {
  const lines: string[] = [];
  const writes: Array<{ path: string; data: string }> = [];
  const mkdirs: string[] = [];

  const d: ProgramDeps = {
    createClient: () => undefined as never,
    getNetwork: () => undefined as never,
    faucet: () => undefined as never,
    balance: () => undefined as never,
    waitForReceipt: () => undefined as never,
    attachExplorerUrl: (r: unknown) => r,
    explorerUrl: () => "https://x/tx/0x",
    makeStorage: () => undefined as never,
    makeCompute: () => undefined as never,
    makeDA: () => undefined as never,
    attest: {
      parseEnvelope: () => undefined as never,
      verifyEnvelope: () => undefined as never,
      reportEnvelope: () => undefined as never,
    },
    devnet: {
      startDevnet: () => undefined as never,
      stopDevnet: () => undefined as never,
      isRunning: async () => false,
      readState: () => null,
      clearState: () => undefined as never,
    },
    loadFoundry: async () => null,
    contracts: {
      generate: () => undefined as never,
      listStandard: () => [],
      getStandard: () => null,
      estimate: () => undefined as never,
      fetchExplorerAbi: async () => [],
      writeTempAbi: async () => "/tmp/abi.json",
    },
    jobsBackendFactory: () => undefined as never,
    storageEstimate: () => undefined as never,
    computeEstimate: () => undefined as never,
    daEstimate: () => undefined as never,
    tracesReader: {
      defaultTraceDir: () => null,
      listTraceFiles: async () => [],
      readTraceFile: async () => [],
      summarizeTrace: () => ({ id: "", spans: [] }) as never,
    },
    fs: {
      readFile: async () => {
        throw new Error("ENOENT");
      },
      writeFile: async (p: string, data: string | Uint8Array) => {
        writes.push({
          path: p,
          data: typeof data === "string" ? data : new TextDecoder().decode(data),
        });
      },
      mkdir: async (p: string) => {
        mkdirs.push(p);
      },
      readdir: async () => [],
      exists: async () => false,
    },
    readStdin: async () => new Uint8Array(),
    fetch: (async () => ({ status: 200 })) as unknown as typeof fetch,
    cwd: () => "/work/project",
    homedir: () => "/home/user",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    argv: [],
    writeErr: () => {},
    ...over,
  } as unknown as ProgramDeps;

  return { d, lines, writes, mkdirs };
}

describe("0g kits new", () => {
  beforeEach(() => {
    process.exitCode = 0;
  });
  afterEach(() => {
    process.exitCode = 0;
  });

  it("scaffolds files under the cwd and emits [0gkit:kit-created]", async () => {
    const { d, lines, writes } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(
      [
        "kits",
        "new",
        "cool-kit",
        "--domain",
        "markets",
        "--summary",
        "A cool kit.",
        "--bases",
        "react-app",
      ],
      { from: "user" }
    );

    // kit.json lands in the default (cwd) location for a non-repo directory
    const kitJson = writes.find((w) => w.path.endsWith("cool-kit/kit.json"));
    expect(kitJson).toBeDefined();
    const manifest = JSON.parse(kitJson!.data) as { domain: string };
    expect(manifest.domain).toBe("markets");
    expect(lines.join("\n")).toContain("[0gkit:kit-created]");
  });

  it("rejects a non-kebab-case name (exitCode 1)", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["kits", "new", "CoolKit", "--json"], { from: "user" });
    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(lines.at(-1)!) as {
      ok: boolean;
      error: { message: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/kebab/i);
    process.exitCode = 0;
  });

  it("rejects an unknown domain (exitCode 1)", async () => {
    const { d, lines } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["kits", "new", "cool-kit", "--domain", "nonsense", "--json"], {
      from: "user",
    });
    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(lines.at(-1)!) as { ok: boolean };
    expect(payload.ok).toBe(false);
    process.exitCode = 0;
  });

  it("refuses to overwrite an existing kit", async () => {
    const { d, lines } = makeDeps({
      fs: {
        readFile: async () => {
          throw new Error("ENOENT");
        },
        writeFile: async () => {},
        mkdir: async () => {},
        readdir: async () => [],
        // kit.json already exists → duplicate
        exists: async (p: string) => p.endsWith("cool-kit/kit.json"),
      } as unknown as ProgramDeps["fs"],
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["kits", "new", "cool-kit", "--json"], { from: "user" });
    expect(process.exitCode).toBe(1);
    const payload = JSON.parse(lines.at(-1)!) as {
      ok: boolean;
      error: { message: string };
    };
    expect(payload.error.message).toMatch(/exists|already/i);
    process.exitCode = 0;
  });

  it("--dry-run writes nothing but reports the planned files", async () => {
    const { d, lines, writes } = makeDeps();
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["kits", "new", "cool-kit", "--dry-run"], {
      from: "user",
    });
    expect(writes).toHaveLength(0);
    const out = lines.join("\n");
    expect(out).toContain("kit.json");
    expect(out).toContain("[0gkit:kit-created]");
  });

  it("writes into templates/_kits and the docs tree when run inside the 0gkit repo", async () => {
    const { d, writes } = makeDeps({
      fs: {
        readFile: async () => {
          throw new Error("ENOENT");
        },
        writeFile: async (p: string, data: string | Uint8Array) => {
          writes.push({
            path: p,
            data: typeof data === "string" ? data : new TextDecoder().decode(data),
          });
        },
        mkdir: async () => {},
        readdir: async () => [],
        // templates/_kits exists → we're in the monorepo
        exists: async (p: string) => p.endsWith("templates/_kits"),
      } as unknown as ProgramDeps["fs"],
    });
    const p = buildProgram(d);
    p.exitOverride();
    await p.parseAsync(["kits", "new", "cool-kit", "--bases", "react-app"], {
      from: "user",
    });
    expect(
      writes.some((w) => w.path.endsWith("templates/_kits/cool-kit/kit.json"))
    ).toBe(true);
    expect(
      writes.some((w) => w.path.endsWith("apps/docs/app/kits/cool-kit/page.mdx"))
    ).toBe(true);
  });
});
