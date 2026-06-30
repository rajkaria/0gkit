import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectBase, isReactBase, REACT_BASES } from "../bases.js";

const scratch = join(tmpdir(), "0gkit-bases-test-" + process.pid);

function makeDir(subdir: string): string {
  const dir = join(scratch, subdir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writePkg(
  dir: string,
  deps: Record<string, string>,
  devDeps?: Record<string, string>
): void {
  const pkg: Record<string, unknown> = { name: "test-app", version: "0.0.0" };
  if (Object.keys(deps).length) pkg.dependencies = deps;
  if (devDeps && Object.keys(devDeps).length) pkg.devDependencies = devDeps;
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
}

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("REACT_BASES", () => {
  it("contains react-app and chat", () => {
    expect(REACT_BASES.has("react-app")).toBe(true);
    expect(REACT_BASES.has("chat")).toBe(true);
  });

  it("does not contain node or mcp-agent", () => {
    expect(REACT_BASES.has("node")).toBe(false);
    expect(REACT_BASES.has("mcp-agent")).toBe(false);
  });
});

describe("isReactBase", () => {
  it("returns true for react-app", () => {
    expect(isReactBase("react-app")).toBe(true);
  });

  it("returns true for chat", () => {
    expect(isReactBase("chat")).toBe(true);
  });

  it("returns false for tee-attested-api", () => {
    expect(isReactBase("tee-attested-api")).toBe(false);
  });

  it("returns false for node", () => {
    expect(isReactBase("node")).toBe(false);
  });

  it("returns false for mcp-agent", () => {
    expect(isReactBase("mcp-agent")).toBe(false);
  });
});

describe("detectBase", () => {
  it('returns "react-app" when deps include next', () => {
    const dir = makeDir("with-next");
    writePkg(dir, { next: "14.0.0", react: "18.0.0" });
    expect(detectBase(dir)).toBe("react-app");
  });

  it('returns "react-app" when next is in devDependencies', () => {
    const dir = makeDir("with-next-dev");
    writePkg(dir, {}, { next: "14.0.0" });
    expect(detectBase(dir)).toBe("react-app");
  });

  it('returns "mcp-agent" when deps include @modelcontextprotocol/sdk', () => {
    const dir = makeDir("with-mcp");
    writePkg(dir, { "@modelcontextprotocol/sdk": "^1.0.0" });
    expect(detectBase(dir)).toBe("mcp-agent");
  });

  it('returns "mcp-agent" when @modelcontextprotocol/sdk is in devDependencies', () => {
    const dir = makeDir("with-mcp-dev");
    writePkg(dir, {}, { "@modelcontextprotocol/sdk": "^1.0.0" });
    expect(detectBase(dir)).toBe("mcp-agent");
  });

  it('returns "node" when neither next nor @modelcontextprotocol/sdk are present', () => {
    const dir = makeDir("plain-node");
    writePkg(dir, { express: "^4.0.0" });
    expect(detectBase(dir)).toBe("node");
  });

  it('returns "node" when package.json is missing', () => {
    const dir = makeDir("no-pkg");
    expect(detectBase(dir)).toBe("node");
  });

  it('returns "node" when package.json is unreadable/malformed', () => {
    const dir = makeDir("bad-pkg");
    writeFileSync(join(dir, "package.json"), "not valid json {{{");
    expect(detectBase(dir)).toBe("node");
  });

  it('prefers "react-app" over "mcp-agent" when both next and @modelcontextprotocol/sdk are present', () => {
    const dir = makeDir("both");
    writePkg(dir, { next: "14.0.0", "@modelcontextprotocol/sdk": "^1.0.0" });
    expect(detectBase(dir)).toBe("react-app");
  });
});
