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

  it("renders errors as red+hint in human mode", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: false,
      isTTY: true,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.failure({
      code: "CONFIG",
      message: "missing key",
      hint: "set ZEROG_PRIVATE_KEY",
    });
    expect(lines.join("\n")).toContain("missing key");
    expect(lines.join("\n")).toContain("set ZEROG_PRIVATE_KEY");
  });

  it("renders errors as ok:false JSON in --json mode", () => {
    const lines: string[] = [];
    const out = createOutput({
      json: true,
      isTTY: false,
      noColor: true,
      write: (s) => lines.push(s),
    });
    out.failure({ code: "NETWORK", message: "down", hint: "retry" });
    expect(JSON.parse(lines[0])).toEqual({
      ok: false,
      error: { code: "NETWORK", message: "down", hint: "retry" },
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
    out.failure({ code: "CONFIG", message: "x", hint: "y" });
    expect(lines.join("")).toContain("\x1b[");
  });
});
