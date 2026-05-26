import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("storage-app 0g.config", () => {
  it("exposes a server slot with ZEROG_NETWORK + PRIVATE_KEY", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
  });

  it("rejects a missing PRIVATE_KEY", () => {
    expect(() => config.server({})).toThrow();
  });

  it("envExample() includes both ZEROG_NETWORK and PRIVATE_KEY", () => {
    const ex = config.envExample();
    expect(ex).toContain("ZEROG_NETWORK=galileo");
    expect(ex).toContain("PRIVATE_KEY=");
  });
});
