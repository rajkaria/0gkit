import { describe, it, expect, vi } from "vitest";

vi.mock("viem/accounts", () => ({
  mnemonicToAccount: () => ({
    address: "0x0000000000000000000000000000000000000001",
    getHdKey: () => ({ privateKey: null }),
  }),
}));

describe("testWallet error codes", () => {
  it("throws WALLET_NO_PRIVATE_KEY when hdKey.privateKey is missing", async () => {
    const { testWallet } = await import("../test-wallet.js");
    try {
      testWallet({ index: 0 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_NO_PRIVATE_KEY");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_NO_PRIVATE_KEY"
      );
      expect(e).toBeInstanceOf(Error);
    }
  });
});
