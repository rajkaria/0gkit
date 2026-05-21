import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { parseFoundryArtifact } from "./parser.js";
import { emitContract } from "./emit.js";

export interface GenerateOptions {
  /** Path to a Foundry artifact JSON (output of `forge build`). */
  abiPath: string;
  /** Output directory; created if missing. */
  outDir: string;
  /** Optional override for the contract name (and generated TS filename). */
  name?: string;
  /** DI seam for tests — defaults to node:fs/promises. */
  fs?: GenerateFs;
}

export interface GenerateFs {
  readFile(path: string, encoding: "utf-8"): Promise<string>;
  writeFile(path: string, content: string, encoding: "utf-8"): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<unknown>;
}

export interface GenerateResult {
  /** Contract name resolved from artifact / --name. */
  name: string;
  /** Absolute or repo-relative path of the written `.ts` file. */
  outputPath: string;
  bytesWritten: number;
}

const defaultFs: GenerateFs = {
  readFile: (p, enc) => fs.readFile(p, enc),
  writeFile: (p, c, enc) => fs.writeFile(p, c, enc),
  mkdir: (p, o) => fs.mkdir(p, o),
};

/**
 * One-shot Foundry-artifact → typed-TS-client codegen.
 *
 * Reads the artifact, parses + validates it, emits a deterministic TS file,
 * writes it to `outDir/<Name>.ts`. The directory is created if missing.
 */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const f = opts.fs ?? defaultFs;
  const raw = await f.readFile(opts.abiPath, "utf-8");
  const parsed = parseFoundryArtifact(raw, opts.name);
  const source = emitContract(parsed);
  await f.mkdir(dirname(join(opts.outDir, `${parsed.name}.ts`)), { recursive: true });
  const outputPath = join(opts.outDir, `${parsed.name}.ts`);
  await f.writeFile(outputPath, source, "utf-8");
  return {
    name: parsed.name,
    outputPath,
    bytesWritten: source.length,
  };
}

// Re-export for consumers who want to compose the steps.
export { parseFoundryArtifact } from "./parser.js";
export { emitContract } from "./emit.js";
