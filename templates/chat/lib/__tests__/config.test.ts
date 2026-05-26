import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("chat 0g.config", () => {
  it("server slot accepts a valid env", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "0x" + "a".repeat(64),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
  });

  it("client slot returns NEXT_PUBLIC_* only", () => {
    const parsed = config.client({
      NEXT_PUBLIC_ZEROG_NETWORK: "galileo",
      NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS: "0x" + "0".repeat(40),
    });
    expect(parsed.NEXT_PUBLIC_ZEROG_NETWORK).toBe("galileo");
    expect(parsed.NEXT_PUBLIC_MESSAGE_REGISTRY_ADDRESS.startsWith("0x")).toBe(true);
  });
});
