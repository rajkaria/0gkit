import { describe, expect, it } from "vitest";
import { config } from "../../0g.config.js";

describe("nft-with-storage 0g.config", () => {
  it("server slot parses a valid env", () => {
    const parsed = config.server({
      ZEROG_NETWORK: "galileo",
      PRIVATE_KEY: "0x" + "a".repeat(64),
      NFT_ADDRESS: "0x" + "1".repeat(40),
    });
    expect(parsed.ZEROG_NETWORK).toBe("galileo");
    expect(parsed.NFT_ADDRESS.startsWith("0x")).toBe(true);
  });

  it("rejects malformed NFT_ADDRESS", () => {
    expect(() =>
      config.server({
        PRIVATE_KEY: "0x" + "a".repeat(64),
        NFT_ADDRESS: "not-an-address",
      })
    ).toThrow();
  });

  it("rejects missing PRIVATE_KEY", () => {
    expect(() =>
      config.server({
        NFT_ADDRESS: "0x" + "1".repeat(40),
      })
    ).toThrow();
  });
});
