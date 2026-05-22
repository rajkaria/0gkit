import { describe, it, expect } from "vitest";
import { createOutput } from "../output.js";

describe("createOutput", () => {
  it("renders human success lines, no color when noColor", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: false,
      isTTY: true,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.success({ human: ["root 0xabc", "tx 0xdef"], json: { root: "0xabc" } });
    expect(lines).toEqual(["root 0xabc", "tx 0xdef"]);
  });

  it("renders a single JSON object with ok:true in --json mode", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: true,
      isTTY: false,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.success({ human: ["ignored"], json: { root: "0xabc" } });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ ok: true, root: "0xabc" });
  });

  it("renders errors with hint and help URL in human mode", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: false,
      isTTY: true,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.failure({
      code: "CONFIG_MISSING_ENV",
      message: "missing key",
      hint: "set ZEROG_PRIVATE_KEY",
      helpUrl: "https://0gkit.dev/errors/CONFIG_MISSING_ENV",
    });
    const joined = lines.join("\n");
    expect(joined).toContain("missing key");
    expect(joined).toContain("set ZEROG_PRIVATE_KEY");
    expect(joined).toContain("https://0gkit.dev/errors/CONFIG_MISSING_ENV");
  });

  it("renders errors as ok:false JSON in --json mode (includes helpUrl)", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: true,
      isTTY: false,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.failure({
      code: "CHAIN_RPC_UNREACHABLE",
      message: "down",
      hint: "retry",
      helpUrl: "https://0gkit.dev/errors/CHAIN_RPC_UNREACHABLE",
    });
    expect(JSON.parse(lines[0])).toEqual({
      ok: false,
      error: {
        code: "CHAIN_RPC_UNREACHABLE",
        message: "down",
        hint: "retry",
        helpUrl: "https://0gkit.dev/errors/CHAIN_RPC_UNREACHABLE",
      },
    });
  });

  it("emits ANSI codes only when TTY and color allowed", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: false,
      isTTY: true,
      noColor: false,
      write: (s) => lines.push(s),
    });
    out.failure({
      code: "CONFIG_INVALID_ARGUMENT",
      message: "x",
      hint: "y",
      helpUrl: "https://0gkit.dev/errors/CONFIG_INVALID_ARGUMENT",
    });
    expect(lines.join("")).toContain("\x1b[");
  });
});
