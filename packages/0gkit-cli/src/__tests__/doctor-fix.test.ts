import { describe, it, expect, vi } from "vitest";
import {
  genEnvFromConfig,
  bumpStalePins,
  rpcFallbackCmd,
  type DoctorFixDeps,
} from "../commands/doctor-fix.js";

function makeDeps(over: Partial<DoctorFixDeps> = {}): DoctorFixDeps {
  return {
    fs: {
      exists: vi.fn(async () => false),
      writeFile: vi.fn(async () => {}),
    },
    loadProjectConfig: vi.fn(async () => null),
    readProjectPins: vi.fn(async () => ({})),
    latestVersion: vi.fn(async () => "1.6.0"),
    ...over,
  };
}

describe("genEnvFromConfig", () => {
  it("writes .env.example and .env.local when config present and .env.local absent", async () => {
    const body = "ZEROG_RPC_URL=\n";
    const cfg = { envExample: () => body };
    const d = makeDeps({
      loadProjectConfig: vi.fn(async () => cfg),
      fs: {
        exists: vi.fn(async () => false),
        writeFile: vi.fn(async () => {}),
      },
    });
    const result = await genEnvFromConfig("/proj", d);
    expect(result).toContain(".env.example");
    expect(result).toContain(".env.local");
    expect(d.fs.writeFile).toHaveBeenCalledWith("/proj/.env.example", body);
    expect(d.fs.writeFile).toHaveBeenCalledWith("/proj/.env.local", body);
  });

  it("skips .env.local if it already exists (idempotent)", async () => {
    const body = "ZEROG_RPC_URL=\n";
    const cfg = { envExample: () => body };
    const d = makeDeps({
      loadProjectConfig: vi.fn(async () => cfg),
      fs: {
        exists: vi.fn(async () => true), // .env.local exists
        writeFile: vi.fn(async () => {}),
      },
    });
    await genEnvFromConfig("/proj", d);
    const calls = (d.fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    const paths = calls.map((c: unknown[]) => c[0]);
    expect(paths).toContain("/proj/.env.example");
    expect(paths).not.toContain("/proj/.env.local");
  });

  it("returns null when config cannot be loaded", async () => {
    const d = makeDeps({ loadProjectConfig: vi.fn(async () => null) });
    const result = await genEnvFromConfig("/proj", d);
    expect(result).toBeNull();
  });
});

describe("bumpStalePins", () => {
  it("returns npm install line for stale 0gkit-* pins", async () => {
    const d = makeDeps({
      readProjectPins: vi.fn(async () => ({
        "@foundryprotocol/0gkit-core": "1.5.0",
        "@foundryprotocol/0gkit-cli": "1.5.0",
        "some-other-pkg": "1.0.0",
      })),
      latestVersion: vi.fn(async () => "1.6.0"),
    });
    const result = await bumpStalePins("/proj", d);
    expect(result).toContain("npm install");
    expect(result).toContain("@foundryprotocol/0gkit-core@latest");
    expect(result).toContain("@foundryprotocol/0gkit-cli@latest");
    expect(result).not.toContain("some-other-pkg");
  });

  it("returns null when all pins are current", async () => {
    const d = makeDeps({
      readProjectPins: vi.fn(async () => ({
        "@foundryprotocol/0gkit-core": "1.6.0",
      })),
      latestVersion: vi.fn(async () => "1.6.0"),
    });
    const result = await bumpStalePins("/proj", d);
    expect(result).toBeNull();
  });

  it("ignores non-0gkit packages", async () => {
    const d = makeDeps({
      readProjectPins: vi.fn(async () => ({
        react: "17.0.0",
        "some-lib": "2.0.0",
      })),
      latestVersion: vi.fn(async () => "99.0.0"),
    });
    const result = await bumpStalePins("/proj", d);
    expect(result).toBeNull();
  });
});

describe("rpcFallbackCmd", () => {
  it("returns a 0g dev command string for galileo", () => {
    const cmd = rpcFallbackCmd("galileo");
    expect(cmd).toContain("0g dev");
    expect(cmd).toContain("galileo");
  });

  it("returns a 0g dev command string for any network", () => {
    const cmd = rpcFallbackCmd("aristotle");
    expect(cmd).toContain("0g dev");
    expect(cmd).toContain("aristotle");
  });
});
