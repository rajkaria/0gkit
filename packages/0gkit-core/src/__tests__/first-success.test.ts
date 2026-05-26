import { describe, expect, it } from "vitest";
import { printFirstSuccess, FIRST_SUCCESS_MARKER } from "../index.js";

describe("printFirstSuccess", () => {
  it("prints a banner with the marker token, op, and id", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "storage.upload", id: "0xabc123" }, (line) =>
      out.push(line)
    );
    const blob = out.join("\n");
    expect(blob).toContain(FIRST_SUCCESS_MARKER);
    expect(blob).toContain("storage.upload");
    expect(blob).toContain("0xabc123");
  });

  it("draws a unicode box around the content", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "compute.inference", id: "tx-1" }, (line) =>
      out.push(line)
    );
    expect(out.some((l) => l.includes("┌") && l.includes("┐"))).toBe(true);
    expect(out.some((l) => l.includes("└") && l.includes("┘"))).toBe(true);
  });

  it("only renders once per call (idempotent at the helper level is the caller's job)", () => {
    const out: string[] = [];
    const sink = (line: string) => out.push(line);
    printFirstSuccess({ op: "da.publish", id: "0xfeed" }, sink);
    printFirstSuccess({ op: "da.publish", id: "0xfeed" }, sink);
    const marker = out.filter((l) => l.includes(FIRST_SUCCESS_MARKER));
    expect(marker.length).toBe(2);
  });

  it("FIRST_SUCCESS_MARKER is the documented contract token", () => {
    expect(FIRST_SUCCESS_MARKER).toBe("[0gkit:first-success]");
  });

  it("renders the optional note line when provided", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "x", id: "y", note: "saved 12 gas" }, (line) =>
      out.push(line)
    );
    expect(out.some((l) => l.includes("saved 12 gas"))).toBe(true);
  });

  it("all banner lines have equal visual width", () => {
    const out: string[] = [];
    printFirstSuccess({ op: "compute.inference", id: "tx-1", note: "ok" }, (line) =>
      out.push(line)
    );
    const widths = new Set(out.map((l) => [...l].length));
    expect(widths.size).toBe(1);
  });

  it("sanitizes newlines in op/id/note so the box stays intact", () => {
    const out: string[] = [];
    printFirstSuccess(
      { op: "storage.upload", id: "0xabc\n0xdef", note: "line1\nline2" },
      (line) => out.push(line)
    );
    for (const l of out) {
      // every emitted "line" must actually be one terminal line
      expect(l).not.toContain("\n");
    }
  });
});
