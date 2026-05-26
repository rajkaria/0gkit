import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("ai-agent 0g.config", () => {
  it("server slot includes ZEROG_NETWORK, BROKER_KEY, optional MODEL", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      BROKER_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
    expect(parsed.MODEL).toBeUndefined();
  });

  it("rejects missing BROKER_KEY", () => {
    expect(() => config.server({})).toThrow();
  });
});
