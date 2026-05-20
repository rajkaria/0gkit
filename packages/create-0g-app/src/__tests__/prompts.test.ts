import { describe, it, expect } from "vitest";
import { validateProjectName } from "../prompts.js";

describe("validateProjectName", () => {
  it.each<[string, boolean]>([
    ["my-app", true],
    ["MY_APP", true],
    ["my-app-2", true],
    ["a", true],
    ["", false],
    [".", false],
    ["..", false],
    ["my app", false], // no spaces
    ["a/b", false], // no slashes
    ["../escape", false], // no path escape
    ["/abs/path", false], // no absolute path
    ["my.app", false], // dots blocked (would defeat the . / .. heuristic by encoding)
    ["my-very-long-".repeat(20), false], // 200+ chars rejected
  ])("'%s' → ok=%s", (input, expected) => {
    expect(validateProjectName(input).ok).toBe(expected);
  });

  it("includes a reason on failure", () => {
    const r = validateProjectName("");
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("accepts a 64-char name", () => {
    const name = "a".repeat(64);
    expect(validateProjectName(name).ok).toBe(true);
  });

  it("rejects a 65-char name", () => {
    const name = "a".repeat(65);
    expect(validateProjectName(name).ok).toBe(false);
  });
});
