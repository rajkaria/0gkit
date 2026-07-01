import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { create0gMcpServer } from "../server.js";
import type { McpDeps } from "../tools.js";
import type { FoundryPlugin } from "../foundry-plugin.js";
import type { McpToolPlugin } from "../plugin.js";

function stubDeps(env: Record<string, string | undefined> = {}): McpDeps {
  return {
    createClient: (() => ({})) as any,
    getNetwork: ((n: string) => ({ name: n })) as any,
    faucet: (async () => ({ txHash: "0xfee" })) as any,
    balance: (async () => 0n) as any,
    attachExplorerUrl: ((tx: any) => tx) as any,
    makeStorage: () => ({}) as any,
    makeCompute: () => ({}) as any,
    makeDA: () =>
      ({
        publish: async () => ({ digest: "0xd", mode: "local", latencyMs: 1 }),
      }) as any,
    attest: {
      parseEnvelope: ((v: unknown) => v) as any,
      verifyEnvelope: (async () => ({})) as any,
      reportEnvelope: (() => "") as any,
    },
    env,
  };
}

async function connect(server: Awaited<ReturnType<typeof create0gMcpServer>>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("create0gMcpServer (neutral, no foundry)", () => {
  it("lists exactly the nine og_* tools", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
    });
    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.every((t) => t.name.startsWith("og_"))).toBe(true);
  });

  it("drives a primitive end-to-end over MCP", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
    });
    const client = await connect(server);
    const res: any = await client.callTool({
      name: "og_da_publish",
      arguments: { payload: "hello" },
    });
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      digest: "0xd",
      mode: "local",
    });
  });

  it("unknown tool → error result mentioning foundry is opt-in", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
    });
    const client = await connect(server);
    const res: any = await client.callTool({
      name: "list_ingots",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).hint).toMatch(/opt-in/);
  });

  it("foundry plugin absent by default (ZEROG_FOUNDRY unset)", async () => {
    const server = await create0gMcpServer({ deps: stubDeps() });
    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools.every((t) => t.name.startsWith("og_"))).toBe(true);
  });
});

describe("create0gMcpServer (foundry plugin opt-in)", () => {
  const fakePlugin: FoundryPlugin = {
    name: "foundry",
    tools: [
      {
        name: "list_ingots",
        description: "fake",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    call: async (name) => ({
      content: [{ type: "text", text: JSON.stringify({ called: name }) }],
    }),
  };

  it("merges plugin tools and routes calls to it", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: fakePlugin,
    });
    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10);
    expect(tools.some((t) => t.name === "list_ingots")).toBe(true);

    const res: any = await client.callTool({
      name: "list_ingots",
      arguments: {},
    });
    expect(JSON.parse(res.content[0].text)).toEqual({ called: "list_ingots" });
  });

  it("neutral tools still win when names do not collide", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: fakePlugin,
    });
    const client = await connect(server);
    const res: any = await client.callTool({
      name: "og_da_publish",
      arguments: { payload: "x" },
    });
    expect(JSON.parse(res.content[0].text).digest).toBe("0xd");
  });
});

describe("create0gMcpServer (plugins[] seam)", () => {
  const fakePlugin: McpToolPlugin = {
    name: "test-kit",
    tools: [
      {
        name: "x_tool",
        description: "a fake plugin tool",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    call: async (name) => ({
      content: [{ type: "text", text: JSON.stringify({ pluginCalled: name }) }],
    }),
  };

  it("merges plugin tools: ListTools returns 9 neutral + plugin tools", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
      plugins: [fakePlugin],
    });
    const client = await connect(server);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10); // 9 neutral + 1 plugin
    expect(tools.some((t) => t.name === "x_tool")).toBe(true);
    expect(tools.filter((t) => t.name.startsWith("og_"))).toHaveLength(9);
  });

  it("CallTool for a plugin tool routes to plugin.call", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
      plugins: [fakePlugin],
    });
    const client = await connect(server);
    const res: any = await client.callTool({ name: "x_tool", arguments: {} });
    expect(JSON.parse(res.content[0].text)).toEqual({ pluginCalled: "x_tool" });
  });

  it("neutral tool still routes correctly when plugins are present", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
      plugins: [fakePlugin],
    });
    const client = await connect(server);
    const res: any = await client.callTool({
      name: "og_chain_balance",
      arguments: { address: "0x1234567890abcdef1234567890abcdef12345678" },
    });
    // neutral tool returns ok result, not plugin result
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveProperty("address");
    expect(res.isError).toBeFalsy();
  });

  it("unknown tool with plugins present lists known tools (not the foundry opt-in hint)", async () => {
    const server = await create0gMcpServer({
      deps: stubDeps(),
      foundryPlugin: null,
      plugins: [fakePlugin],
    });
    const client = await connect(server);
    const res: any = await client.callTool({ name: "nope_tool", arguments: {} });
    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toContain("nope_tool");
    // plugins are wired, so the hint must enumerate known tools — including the
    // plugin's — rather than telling the user to opt into Foundry.
    expect(parsed.hint).toContain("x_tool");
    expect(parsed.hint).not.toContain("ZEROG_FOUNDRY");
  });
});
