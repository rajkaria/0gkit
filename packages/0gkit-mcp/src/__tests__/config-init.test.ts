import { describe, it, expect, vi } from "vitest";
import { buildMcpConfig, readAppliedKits } from "../config-init.js";

// ---------------------------------------------------------------------------
// buildMcpConfig
// ---------------------------------------------------------------------------

describe("buildMcpConfig — neutral (npx) mode", () => {
  it("cursor project scope → .cursor/mcp.json with npx neutral server", () => {
    const result = buildMcpConfig({
      agent: "cursor",
      scope: "project",
      home: "/h",
      cwd: "/p",
    });
    expect(result.path).toBe("/p/.cursor/mcp.json");
    expect(result.json.mcpServers["0gkit"].command).toBe("npx");
    expect(result.json.mcpServers["0gkit"].args).toContain(
      "@foundryprotocol/0gkit-mcp"
    );
    expect(result.mode).toBe("neutral");
    expect(result.kits).toEqual([]);
  });

  it("claude global scope → <home>/.claude/mcp.json", () => {
    const result = buildMcpConfig({
      agent: "claude",
      scope: "global",
      home: "/h",
      cwd: "/p",
    });
    expect(result.path).toBe("/h/.claude/mcp.json");
  });

  it("windsurf global scope → <home>/.codeium/windsurf/mcp_config.json", () => {
    const result = buildMcpConfig({
      agent: "windsurf",
      scope: "global",
      home: "/h",
      cwd: "/p",
    });
    expect(result.path).toBe("/h/.codeium/windsurf/mcp_config.json");
  });

  it("codex project scope → .codex/mcp.json", () => {
    const result = buildMcpConfig({
      agent: "codex",
      scope: "project",
      home: "/h",
      cwd: "/p",
    });
    expect(result.path).toBe("/p/.codex/mcp.json");
  });
});

describe("buildMcpConfig — unknown agent throws ConfigError", () => {
  it("throws ConfigError for an unknown agent", () => {
    expect(() =>
      buildMcpConfig({
        agent: "vscode" as never,
        scope: "project",
        home: "/h",
        cwd: "/p",
      })
    ).toThrow();
  });
});

describe("buildMcpConfig — local mode", () => {
  it("project scope + mcp-agent base + applied kits → local npm start server", () => {
    const result = buildMcpConfig({
      agent: "cursor",
      scope: "project",
      home: "/h",
      cwd: "/p",
      applied: { applied: ["agent-memory"], base: "mcp-agent" },
    });
    expect(result.mode).toBe("local");
    expect(result.json.mcpServers["0gkit"].command).toBe("npm");
    expect(result.json.mcpServers["0gkit"].args).toEqual(["--prefix", "/p", "start"]);
    expect(result.kits).toEqual(["agent-memory"]);
  });

  it("global scope + mcp-agent base + kits → neutral (not local)", () => {
    const result = buildMcpConfig({
      agent: "cursor",
      scope: "global",
      home: "/h",
      cwd: "/p",
      applied: { applied: ["agent-memory"], base: "mcp-agent" },
    });
    expect(result.mode).toBe("neutral");
    expect(result.json.mcpServers["0gkit"].command).toBe("npx");
  });

  it("project scope + non-mcp-agent base + kits → neutral", () => {
    const result = buildMcpConfig({
      agent: "cursor",
      scope: "project",
      home: "/h",
      cwd: "/p",
      applied: { applied: ["agent-memory"], base: "react-app" },
    });
    expect(result.mode).toBe("neutral");
  });

  it("project scope + mcp-agent base + empty applied kits → neutral (no kits applied)", () => {
    const result = buildMcpConfig({
      agent: "cursor",
      scope: "project",
      home: "/h",
      cwd: "/p",
      applied: { applied: [], base: "mcp-agent" },
    });
    expect(result.mode).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// readAppliedKits
// ---------------------------------------------------------------------------

describe("readAppliedKits", () => {
  it("returns {applied, base} from valid JSON bytes", async () => {
    const data = JSON.stringify({
      applied: ["x"],
      base: "mcp-agent",
      at: "2026-01-01T00:00:00Z",
    });
    const reader = { readFile: vi.fn(async () => new TextEncoder().encode(data)) };
    const result = await readAppliedKits("/cwd", reader);
    expect(result).toEqual({ applied: ["x"], base: "mcp-agent" });
  });

  it("returns null when the reader throws (file not found)", async () => {
    const reader = {
      readFile: vi.fn(async () => {
        throw new Error("ENOENT");
      }),
    };
    const result = await readAppliedKits("/cwd", reader);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    const reader = {
      readFile: vi.fn(async () => new TextEncoder().encode("not-json")),
    };
    const result = await readAppliedKits("/cwd", reader);
    expect(result).toBeNull();
  });

  it("returns null for valid JSON but wrong shape (missing applied array)", async () => {
    const reader = {
      readFile: vi.fn(async () => new TextEncoder().encode('{"base":"mcp-agent"}')),
    };
    const result = await readAppliedKits("/cwd", reader);
    expect(result).toBeNull();
  });
});
