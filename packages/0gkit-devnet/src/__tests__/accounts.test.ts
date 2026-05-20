import { describe, it, expect } from "vitest";
import { deriveAccounts, DEFAULT_DEV_MNEMONIC } from "../accounts.js";

describe("deriveAccounts", () => {
  it("produces 10 deterministic addresses by default", () => {
    const a = deriveAccounts();
    const b = deriveAccounts();
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
  });

  it("respects custom count", () => {
    const a = deriveAccounts({ count: 3 });
    expect(a).toHaveLength(3);
    expect(a[0].index).toBe(0);
    expect(a[2].index).toBe(2);
  });

  it("returns 0x-prefixed addresses and 32-byte private keys", () => {
    const accts = deriveAccounts({ count: 2 });
    for (const a of accts) {
      expect(a.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(a.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it("different mnemonic ⇒ different addresses", () => {
    const a = deriveAccounts({
      count: 1,
      mnemonic:
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
    });
    const b = deriveAccounts({ count: 1, mnemonic: DEFAULT_DEV_MNEMONIC });
    expect(a[0].address).not.toBe(b[0].address);
  });

  it("matches the standard anvil dev account 0 for the default mnemonic", () => {
    // Well-known: anvil's default account 0 with the "test test ... junk" mnemonic
    // is 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266.
    const accts = deriveAccounts({ count: 1 });
    expect(accts[0].address.toLowerCase()).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    );
  });
});
