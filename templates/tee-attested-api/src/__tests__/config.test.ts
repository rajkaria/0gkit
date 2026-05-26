import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("tee-attested-api 0g.config", () => {
  it("PORT coerces to number", () => {
    const parsed = config.server({
      PRIVATE_KEY: "0x" + "a".repeat(64),
      PORT: "9090",
    });
    expect(parsed.PORT).toBe(9090);
  });

  it("PORT defaults to 8787 when omitted", () => {
    const parsed = config.server({
      PRIVATE_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.PORT).toBe(8787);
  });

  it("rejects missing PRIVATE_KEY", () => {
    expect(() => config.server({})).toThrow();
  });
});
