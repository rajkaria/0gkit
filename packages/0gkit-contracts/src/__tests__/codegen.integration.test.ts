import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { generate } from "../codegen/index.js";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/foundry-artifact.json", import.meta.url)
);

describe("codegen integration", () => {
  it("writes a syntactically-coherent typed client from a real Foundry artifact", async () => {
    const out = await mkdtemp(join(tmpdir(), "0gkit-contracts-codegen-"));
    const result = await generate({ abiPath: FIXTURE, outDir: out });
    expect(result.name).toBe("TinyToken");
    expect(result.outputPath).toBe(join(out, "TinyToken.ts"));
    const written = await readFile(result.outputPath, "utf-8");

    // Output is well-formed TS.
    expect(written).toContain("export const TinyTokenAbi = [");
    expect(written).toContain("export function attachTinyToken(");
    expect(written).toContain("export const TinyToken = {");
    expect(written).toContain(
      'import type { Signer } from "@foundryprotocol/0gkit-core";'
    );

    // Byte-deterministic on a second run.
    const out2 = await mkdtemp(join(tmpdir(), "0gkit-contracts-codegen-"));
    const result2 = await generate({ abiPath: FIXTURE, outDir: out2 });
    const written2 = await readFile(result2.outputPath, "utf-8");
    expect(written2).toBe(written);
  });

  it("supports a name override via --name", async () => {
    const out = await mkdtemp(join(tmpdir(), "0gkit-contracts-codegen-"));
    const result = await generate({ abiPath: FIXTURE, outDir: out, name: "MyToken" });
    expect(result.name).toBe("MyToken");
    expect(result.outputPath).toBe(join(out, "MyToken.ts"));
    const written = await readFile(result.outputPath, "utf-8");
    expect(written).toContain("export const MyTokenAbi = [");
    expect(written).toContain("export function attachMyToken(");
  });

  it("uses an injected fs implementation when provided", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const fakeFs = {
      readFile: async () =>
        JSON.stringify({
          contractName: "Inj",
          abi: [
            {
              type: "function",
              name: "foo",
              stateMutability: "view",
              inputs: [],
              outputs: [],
            },
          ],
        }),
      writeFile: async (path: string, content: string) => {
        writes.push({ path, content });
      },
      mkdir: async () => undefined,
    };
    const result = await generate({
      abiPath: "ignored",
      outDir: "/virtual",
      fs: fakeFs,
    });
    expect(result.name).toBe("Inj");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe("/virtual/Inj.ts");
    expect(writes[0]!.content).toContain("export const InjAbi");
  });
});
