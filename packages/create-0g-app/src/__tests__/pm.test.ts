import { describe, it, expect } from "vitest";
import { detectPackageManager, installCommand, devCommand } from "../pm.js";

describe("detectPackageManager", () => {
  it("returns pnpm when npm_config_user_agent indicates pnpm", () => {
    expect(
      detectPackageManager({
        env: { npm_config_user_agent: "pnpm/9.12.0 npm/? node/v22.0.0" },
      })
    ).toBe("pnpm");
  });

  it("returns yarn when yarn", () => {
    expect(
      detectPackageManager({
        env: { npm_config_user_agent: "yarn/4.0.0 npm/? node/v22.0.0" },
      })
    ).toBe("yarn");
  });

  it("returns bun when bun", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "bun/1.1.0" } })).toBe(
      "bun"
    );
  });

  it("falls back to npm", () => {
    expect(detectPackageManager({ env: {} })).toBe("npm");
  });

  it("returns npm for npm user agent", () => {
    expect(
      detectPackageManager({
        env: { npm_config_user_agent: "npm/10.0.0 node/v22.0.0" },
      })
    ).toBe("npm");
  });
});

describe("installCommand", () => {
  it("yields the correct install argv per package manager", () => {
    expect(installCommand("pnpm")).toEqual(["pnpm", "install"]);
    expect(installCommand("yarn")).toEqual(["yarn"]);
    expect(installCommand("bun")).toEqual(["bun", "install"]);
    expect(installCommand("npm")).toEqual(["npm", "install"]);
  });
});

describe("devCommand", () => {
  it("formats the run-script command per package manager", () => {
    expect(devCommand("pnpm")).toBe("pnpm dev");
    expect(devCommand("yarn")).toBe("yarn dev");
    expect(devCommand("bun")).toBe("bun run dev");
    expect(devCommand("npm")).toBe("npm run dev");
  });

  it("respects a custom script name", () => {
    expect(devCommand("pnpm", "start")).toBe("pnpm start");
    expect(devCommand("npm", "start")).toBe("npm run start");
  });
});
