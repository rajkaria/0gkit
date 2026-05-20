import { describe, it, expect } from "vitest";
import { renderBanner } from "../banner.js";

describe("renderBanner", () => {
  it("includes cd + dev command + 0g dev hint when local", () => {
    const out = renderBanner({
      name: "demo",
      packageManager: "pnpm",
      network: "local",
      template: "storage-app",
    });
    expect(out).toContain("cd demo");
    expect(out).toContain("pnpm dev");
    expect(out).toContain("0g dev");
    expect(out).toContain("storage-app");
    expect(out).toContain("Tip:");
  });

  it("omits 0g dev hint when galileo", () => {
    const out = renderBanner({
      name: "demo",
      packageManager: "npm",
      network: "galileo",
      template: "react-app",
    });
    expect(out).not.toContain("0g dev");
    expect(out).toContain("npm run dev");
    expect(out).toContain("faucet.0g.ai");
  });

  it("renders the right dev command for yarn", () => {
    const out = renderBanner({
      name: "x",
      packageManager: "yarn",
      network: "galileo",
      template: "inference-app",
    });
    expect(out).toContain("yarn dev");
  });

  it("renders the right dev command for bun", () => {
    const out = renderBanner({
      name: "x",
      packageManager: "bun",
      network: "galileo",
      template: "mcp-agent",
    });
    expect(out).toContain("bun run dev");
  });
});
