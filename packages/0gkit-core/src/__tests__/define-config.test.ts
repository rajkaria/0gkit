import { describe, expect, it } from "vitest";
import { z } from "zod";
import { define0GConfig, ConfigError } from "../index.js";

describe("define0GConfig", () => {
  it("returns parsed server config from process.env", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
        PRIVATE_KEY: z.string().min(64),
      },
    });
    const out = cfg.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "a".repeat(64),
    });
    expect(out.ZEROG_NETWORK).toBe("galileo");
    expect(out.PRIVATE_KEY.length).toBe(64);
  });

  it("applies schema defaults", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]).default("galileo"),
      },
    });
    expect(cfg.server({}).ZEROG_NETWORK).toBe("galileo");
  });

  it("throws ConfigError with field path when required env missing", () => {
    const cfg = define0GConfig({
      server: {
        PRIVATE_KEY: z.string().min(64),
      },
    });
    expect(() => cfg.server({})).toThrow(ConfigError);
    try {
      cfg.server({});
    } catch (e) {
      expect((e as ConfigError).code).toBe("CONFIG_INVALID_ARGUMENT");
      expect((e as ConfigError).message).toMatch(/PRIVATE_KEY/);
    }
  });

  it("client slot filters to NEXT_PUBLIC_* keys only", () => {
    const cfg = define0GConfig({
      client: {
        NEXT_PUBLIC_ZEROG_NETWORK: z.string(),
      },
    });
    const out = cfg.client({
      NEXT_PUBLIC_ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "should-not-appear",
    });
    expect(out.NEXT_PUBLIC_ZEROG_NETWORK).toBe("galileo");
    expect(Object.keys(out)).toEqual(["NEXT_PUBLIC_ZEROG_NETWORK"]);
  });

  it("client slot rejects non-NEXT_PUBLIC_* schema keys at definition time", () => {
    expect(() =>
      define0GConfig({
        client: {
          PRIVATE_KEY: z.string(),
        },
      })
    ).toThrow(/NEXT_PUBLIC_/);
  });

  it("edge slot parses but does not allow process.env-style fallback when given undefined", () => {
    const cfg = define0GConfig({
      edge: {
        ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]),
      },
    });
    expect(() => cfg.edge({})).toThrow(ConfigError);
    expect(cfg.edge({ ZEROG_NETWORK: "galileo" }).ZEROG_NETWORK).toBe("galileo");
  });

  it("envExample() emits a stringified .env.example from server + client slots", () => {
    const cfg = define0GConfig({
      server: {
        ZEROG_NETWORK: z
          .enum(["galileo", "aristotle", "local"])
          .default("galileo")
          .describe("Which 0G network to target."),
        PRIVATE_KEY: z.string().describe("Funds 0G transactions."),
      },
      client: {
        NEXT_PUBLIC_ZEROG_NETWORK: z.string().default("galileo"),
      },
    });
    const out = cfg.envExample();
    expect(out).toContain("# Which 0G network to target.");
    expect(out).toContain("ZEROG_NETWORK=galileo");
    expect(out).toContain("# Funds 0G transactions.");
    expect(out).toContain("PRIVATE_KEY=");
    expect(out).toContain("NEXT_PUBLIC_ZEROG_NETWORK=galileo");
  });

  it("envExample() omits secrets' defaults", () => {
    const cfg = define0GConfig({
      server: {
        PRIVATE_KEY: z.string().describe("Funds transactions."),
      },
    });
    const out = cfg.envExample();
    expect(out).toMatch(/PRIVATE_KEY=\s*$/m);
  });

  it("falls back to process.env when called with no argument", () => {
    const cfg = define0GConfig({
      server: { ZEROG_NETWORK: z.enum(["galileo", "aristotle", "local"]) },
    });
    const prev = process.env.ZEROG_NETWORK;
    process.env.ZEROG_NETWORK = "aristotle";
    try {
      expect(cfg.server().ZEROG_NETWORK).toBe("aristotle");
    } finally {
      if (prev === undefined) delete process.env.ZEROG_NETWORK;
      else process.env.ZEROG_NETWORK = prev;
    }
  });

  it("envExample() emits the documented section headers per slot", () => {
    const cfg = define0GConfig({
      server: { ZEROG_NETWORK: z.string().default("galileo") },
      client: { NEXT_PUBLIC_ZEROG_NETWORK: z.string().default("galileo") },
      edge: { ZEROG_NETWORK: z.string().default("galileo") },
    });
    const out = cfg.envExample();
    expect(out).toContain("# --- server (Node only) ---");
    expect(out).toContain("# --- client (browser-safe, NEXT_PUBLIC_*) ---");
    expect(out).toContain("# --- edge runtime ---");
  });
});
