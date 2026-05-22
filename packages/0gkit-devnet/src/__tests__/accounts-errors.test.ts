import { describe, it, expect, vi } from "vitest";

// vi.mock("viem/accounts", ...) + dynamic import is hoisted, but the cold
// ESM transform of viem/accounts races with accounts.test.ts in the same
// vitest run. Bumping testTimeout keeps the assertion intact while the
// transform finishes.
vi.mock("viem/accounts", () => ({
  mnemonicToAccount: () => ({
    address: "0x0000000000000000000000000000000000000001",
    getHdKey: () => ({ privateKey: null }),
  }),
}));

describe("deriveAccounts error codes", () => {
  it("throws WALLET_NO_PRIVATE_KEY when hdKey.privateKey is missing", async () => {
    const { deriveAccounts } = await import("../accounts.js");
    try {
      deriveAccounts({ count: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("WALLET_NO_PRIVATE_KEY");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/WALLET_NO_PRIVATE_KEY"
      );
      expect(e instanceof Error).toBe(true);
    }
  }, 30_000);
});
