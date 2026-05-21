import { describe, it, expect, vi } from "vitest";
import { buildProgram, type ProgramDeps } from "../program.js";

function deps(over: Partial<ProgramDeps> = {}) {
  const lines: string[] = [];
  const generate = vi.fn(
    async (o: { abiPath: string; outDir: string; name?: string }) => ({
      name: o.name ?? "Sample",
      outputPath: `${o.outDir}/${o.name ?? "Sample"}.ts`,
      bytesWritten: 1234,
    })
  );
  const listStandard = vi.fn((_network: string) => [
    {
      name: "erc20",
      address: null,
      description: "ERC-20",
    },
    {
      name: "multicall3",
      address: "0xcA11bde05977b3631167028862bE2a173976CA11" as `0x${string}`,
      description: "Multicall3",
    },
  ]);
  const getStandard = vi.fn((name: string, _network: string) =>
    name === "erc20"
      ? {
          name: "erc20",
          address: null,
          description: "ERC-20",
          methods: ["balanceOf", "transfer"],
          events: ["Transfer"],
        }
      : null
  );
  const base = {
    contracts: { generate, listStandard, getStandard },
    cwd: () => "/w",
    env: {},
    isTTY: false,
    noColor: true,
    write: (s: string) => lines.push(s),
    ...over,
  } as unknown as ProgramDeps;
  return { d: base, lines, generate, listStandard, getStandard };
}

describe("0g contracts list", () => {
  it("prints each standard contract with its pinned address (human)", async () => {
    const { d, lines } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    await program.parseAsync(["contracts", "list"], { from: "user" });
    const out = lines.join("\n");
    expect(out).toContain("Standard contracts on network='galileo'");
    expect(out).toContain("erc20");
    expect(out).toContain("multicall3");
    expect(out).toContain("0xcA11bde05977b3631167028862bE2a173976CA11");
    expect(out).toContain("not yet pinned");
  });

  it("emits machine-readable list with --json", async () => {
    const { d, lines, listStandard } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    await program.parseAsync(["contracts", "list", "--json"], { from: "user" });
    const last = JSON.parse(lines.at(-1)!);
    expect(last.ok).toBe(true);
    expect(Array.isArray(last.contracts)).toBe(true);
    expect(last.contracts).toHaveLength(2);
    expect(listStandard).toHaveBeenCalledWith("galileo");
  });
});

describe("0g contracts info", () => {
  it("prints description + method/event summary for a known standard contract", async () => {
    const { d, lines } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    await program.parseAsync(["contracts", "info", "erc20"], { from: "user" });
    const out = lines.join("\n");
    expect(out).toContain("erc20");
    expect(out).toContain("description  ERC-20");
    expect(out).toContain("balanceOf");
    expect(out).toContain("Transfer");
  });

  it("surfaces a CONFIG error for unknown contracts", async () => {
    const { d, lines } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    await program.parseAsync(["contracts", "info", "unknown", "--json"], {
      from: "user",
    });
    const out = JSON.parse(lines.at(-1)!);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("CONFIG");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

describe("0g contracts generate", () => {
  it("calls generate with parsed args and prints the result", async () => {
    const { d, lines, generate } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    await program.parseAsync(
      [
        "contracts",
        "generate",
        "--abi",
        "/in/Greeter.json",
        "--out",
        "/out",
        "--name",
        "Greeter",
        "--json",
      ],
      { from: "user" }
    );
    expect(generate).toHaveBeenCalledWith({
      abiPath: "/in/Greeter.json",
      outDir: "/out",
      name: "Greeter",
    });
    const last = JSON.parse(lines.at(-1)!);
    expect(last.ok).toBe(true);
    expect(last.name).toBe("Greeter");
    expect(last.outputPath).toBe("/out/Greeter.ts");
  });

  it("requires --abi", async () => {
    const { d } = deps();
    const program = buildProgram(d);
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    await expect(
      program.parseAsync(["contracts", "generate", "--out", "/o"], { from: "user" })
    ).rejects.toThrow(/required option/i);
  });
});
