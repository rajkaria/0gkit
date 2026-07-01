import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

/**
 * Minimal deps for the `0g contracts import` wiring tests. Only the seams the
 * import command touches are real spies; everything else is a stub. `contracts`
 * carries the three seams: `fetchExplorerAbi` (chainscan), `writeTempAbi`
 * (wrap-in-`{abi}` → temp file), and the existing `generate` codegen.
 */
function makeDeps(over: Partial<ProgramDeps["contracts"]> = {}) {
  const lines: string[] = [];
  const abi = [{ type: "function", name: "balanceOf", inputs: [], outputs: [] }];
  const generate = vi.fn(async (o: { name?: string }) => ({
    name: o.name ?? "Contract",
    outputPath: `./0gkit/contracts/${o.name ?? "Contract"}.ts`,
    bytesWritten: 123,
  }));
  const fetchExplorerAbi = vi.fn(async () => abi as unknown[]);
  const writeTempAbi = vi.fn(async () => "/tmp/0gkit-abi.json");
  const deps = {
    getNetwork: vi.fn(),
    contracts: { generate, fetchExplorerAbi, writeTempAbi, ...over },
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    writeErr: () => {},
    argv: [],
    packageVersions: () => [],
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    _lines: lines,
    _abi: abi,
  } as unknown as ProgramDeps & { _lines: string[]; _abi: unknown[] };
  return { deps, generate, fetchExplorerAbi, writeTempAbi, lines };
}

async function run(deps: ProgramDeps, argv: string[]) {
  const program = buildProgram(deps);
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  await program.parseAsync(argv, { from: "user" });
}

beforeEach(() => {
  process.exitCode = 0;
});

describe("0g contracts import", () => {
  it("address path: fetches the ABI, wraps it to a temp artifact, then codegens", async () => {
    const { deps, generate, fetchExplorerAbi, writeTempAbi } = makeDeps();
    await run(deps, ["contracts", "import", "0xAbC", "--name", "MyToken"]);

    expect(fetchExplorerAbi).toHaveBeenCalledWith("0xAbC", "galileo");
    expect(writeTempAbi).toHaveBeenCalledWith(
      (deps as never as { _abi: unknown[] })._abi,
      "MyToken"
    );
    expect(generate).toHaveBeenCalledWith({
      abiPath: "/tmp/0gkit-abi.json",
      outDir: "./0gkit/contracts",
      name: "MyToken",
    });
    expect(process.exitCode).toBe(0);
  });

  it("--abi path: skips the fetch and codegens the artifact directly", async () => {
    const { deps, generate, fetchExplorerAbi, writeTempAbi } = makeDeps();
    await run(deps, ["contracts", "import", "--abi", "./x.json", "--name", "MyToken"]);

    expect(fetchExplorerAbi).not.toHaveBeenCalled();
    expect(writeTempAbi).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith({
      abiPath: "./x.json",
      outDir: "./0gkit/contracts",
      name: "MyToken",
    });
  });

  it("honors --out for the output directory", async () => {
    const { deps, generate } = makeDeps();
    await run(deps, [
      "contracts",
      "import",
      "0xAbC",
      "--name",
      "MyToken",
      "--out",
      "./src/gen",
    ]);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ outDir: "./src/gen" })
    );
  });

  it("errors when neither <address> nor --abi is given", async () => {
    const { deps, generate } = makeDeps();
    await run(deps, ["contracts", "import", "--name", "MyToken", "--json"]);
    const payload = JSON.parse((deps as never as { _lines: string[] })._lines.at(-1)!);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/address|--abi/i);
    expect(generate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("errors when importing by address without --name (getabi yields no name)", async () => {
    const { deps, fetchExplorerAbi, generate } = makeDeps();
    await run(deps, ["contracts", "import", "0xAbC", "--json"]);
    const payload = JSON.parse((deps as never as { _lines: string[] })._lines.at(-1)!);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toMatch(/--name/i);
    expect(fetchExplorerAbi).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
