import { describe, it, expect, vi } from "vitest";
import { collectToolPlugin } from "../plugin.js";

describe("collectToolPlugin", () => {
  it("returns a plugin with the correct name and collected tools", () => {
    const plugin = collectToolPlugin("agent-memory", (s) => {
      s.tool(
        "memory_remember",
        "desc",
        { type: "object" },
        async () => ({ content: [{ type: "text", text: "ok" }] })
      );
    });

    expect(plugin.name).toBe("agent-memory");
    expect(plugin.tools).toHaveLength(1);
    expect(plugin.tools[0]).toMatchObject({
      name: "memory_remember",
      description: "desc",
      inputSchema: { type: "object" },
    });
  });

  it("plugin.call invokes the captured handler and returns ToolCallResult", async () => {
    const plugin = collectToolPlugin("agent-memory", (s) => {
      s.tool(
        "memory_remember",
        "desc",
        { type: "object" },
        async () => ({ content: [{ type: "text", text: "ok" }] })
      );
    });

    const result = await plugin.call("memory_remember", {});
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("plugin.call for an unknown tool returns an isError result", async () => {
    const plugin = collectToolPlugin("agent-memory", (s) => {
      s.tool(
        "memory_remember",
        "desc",
        { type: "object" },
        async () => ({ content: [{ type: "text", text: "ok" }] })
      );
    });

    const result = await plugin.call("nope", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nope");
  });

  it("passes opts through to the register function", () => {
    const capturedOpts: unknown[] = [];
    collectToolPlugin(
      "test-kit",
      (s, opts) => {
        capturedOpts.push(opts);
      },
      { privateKey: "0xabc", rpc: "https://rpc.example.com" }
    );

    expect(capturedOpts).toHaveLength(1);
    expect(capturedOpts[0]).toEqual({ privateKey: "0xabc", rpc: "https://rpc.example.com" });
  });
});
