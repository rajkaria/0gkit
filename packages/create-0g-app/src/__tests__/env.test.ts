import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeEnvExample, envFor } from "../env.js";

describe("envFor", () => {
  it("local network points all URLs at localhost ports", () => {
    const env = envFor("local");
    expect(env.NETWORK).toBe("local");
    expect(env.RPC_URL).toBe("http://127.0.0.1:8545");
    expect(env.STORAGE_URL).toBe("http://127.0.0.1:5678");
    expect(env.COMPUTE_URL).toBe("http://127.0.0.1:5679");
    expect(env.DA_URL).toBe("http://127.0.0.1:5680");
    expect(env.PRIVATE_KEY).toBe("");
  });

  it("galileo network points to real endpoints", () => {
    const env = envFor("galileo");
    expect(env.NETWORK).toBe("galileo");
    expect(env.RPC_URL).toMatch(/^https?:\/\//);
    expect(env.STORAGE_URL).toMatch(/^https?:\/\//);
    expect(env.PRIVATE_KEY).toBe("");
  });
});

describe("writeEnvExample", () => {
  it("writes a .env.example with comments for local", () => {
    const dir = mkdtempSync(join(tmpdir(), "cga-env-"));
    writeEnvExample({ network: "local", dest: dir });
    const out = readFileSync(join(dir, ".env.example"), "utf8");
    expect(out).toContain("NETWORK=local");
    expect(out).toContain("RPC_URL=http://127.0.0.1:8545");
    expect(out).toContain("# Paste a private key from `0g dev` output");
    expect(out).toContain("PRIVATE_KEY=");
    expect(out).toMatch(/\n$/); // trailing newline
  });

  it("writes a .env.example with a galileo comment", () => {
    const dir = mkdtempSync(join(tmpdir(), "cga-env-"));
    writeEnvExample({ network: "galileo", dest: dir });
    const out = readFileSync(join(dir, ".env.example"), "utf8");
    expect(out).toContain("NETWORK=galileo");
    expect(out).toContain("# Paste a Galileo-funded private key");
    expect(out).not.toContain("0g dev");
  });
});
