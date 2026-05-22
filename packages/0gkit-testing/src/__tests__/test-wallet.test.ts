import { describe, it, expect } from "vitest";
import { verifyMessage } from "viem";
import { testWallet, TEST_MNEMONIC } from "../test-wallet.js";

describe("testWallet", () => {
  it("derives anvil dev account 0 at index 0", () => {
    const w = testWallet({ index: 0 });
    expect(w.address.toLowerCase()).toBe("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
    expect(w.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(w.source).toBe("test-wallet");
  });

  it("derives a different address per index", () => {
    const w0 = testWallet({ index: 0 });
    const w1 = testWallet({ index: 1 });
    expect(w0.address).not.toBe(w1.address);
  });

  it("signs a message that recovers to the expected address", async () => {
    const w = testWallet({ index: 2 });
    const message = "hello from 0gkit-testing";
    const signature = await w.signMessage(message);
    const ok = await verifyMessage({
      address: w.address,
      message,
      signature,
    });
    expect(ok).toBe(true);
  });

  it("produces a different address when the mnemonic is overridden", () => {
    const w = testWallet({
      mnemonic:
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
    });
    expect(w.address).not.toBe(testWallet({ index: 0 }).address);
  });

  it("exposes the canonical anvil dev mnemonic", () => {
    expect(TEST_MNEMONIC).toBe(
      "test test test test test test test test test test test junk"
    );
  });

  it("throws CONFIG_INVALID_ARGUMENT when sendTransaction is called (not implemented in v0)", async () => {
    const w = testWallet({ index: 0 });
    try {
      await w.sendTransaction({});
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("CONFIG_INVALID_ARGUMENT");
      expect((e as { helpUrl?: string }).helpUrl).toBe(
        "https://0gkit.dev/errors/CONFIG_INVALID_ARGUMENT"
      );
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("signs typed data deterministically", async () => {
    const w = testWallet({ index: 0 });
    const sig = await w.signTypedData({
      domain: { name: "0gkit-testing", version: "1", chainId: 1 },
      types: { Mail: [{ name: "contents", type: "string" }] },
      primaryType: "Mail",
      message: { contents: "hi" },
    });
    expect(sig).toMatch(/^0x[0-9a-f]+$/i);
  });
});
