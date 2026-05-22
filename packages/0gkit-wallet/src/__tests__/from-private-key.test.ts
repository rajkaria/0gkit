import { describe, it, expect } from "vitest";
import { recoverMessageAddress, recoverTypedDataAddress, verifyMessage } from "viem";
import { fromPrivateKey } from "../from-private-key.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil account #1

describe("fromPrivateKey", () => {
  it("returns the matching address", async () => {
    const s = await fromPrivateKey(PK);
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(s.source).toBe("private-key");
    expect(s.privateKey).toBe(PK);
  });

  it("accepts a 0x-less private key", async () => {
    const s = await fromPrivateKey(PK.slice(2));
    expect(s.address.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it("signMessage produces a recoverable signature (bytes)", async () => {
    const s = await fromPrivateKey(PK);
    const sig = await s.signMessage(new TextEncoder().encode("gm"));
    const ok = await verifyMessage({
      address: s.address,
      message: "gm",
      signature: sig,
    });
    expect(ok).toBe(true);
  });

  it("signMessage accepts a string overload", async () => {
    const s = await fromPrivateKey(PK);
    const sig = await s.signMessage("gm");
    const recovered = await recoverMessageAddress({ message: "gm", signature: sig });
    expect(recovered.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("signTypedData round-trips", async () => {
    const s = await fromPrivateKey(PK);
    const args = {
      domain: { name: "0gkit", version: "1", chainId: 16602 },
      types: { Mail: [{ name: "body", type: "string" }] },
      primaryType: "Mail" as const,
      message: { body: "hello" },
    };
    const sig = await s.signTypedData(args);
    const recovered = await recoverTypedDataAddress({ ...args, signature: sig });
    expect(recovered.toLowerCase()).toBe(s.address.toLowerCase());
  });

  it("signMessage accepts a { raw } object overload", async () => {
    const s = await fromPrivateKey(PK);
    const raw = "0xdeadbeef01020304" as `0x${string}`;
    const sig = await s.signMessage({ raw });
    // signature must be 65-byte hex (130 hex chars + 0x prefix)
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/i);
  });

  it("sendTransaction throws ConfigError", async () => {
    const s = await fromPrivateKey(PK);
    await expect(s.sendTransaction({})).rejects.toMatchObject({
      code: "CONFIG_INVALID_ARGUMENT",
    });
  });

  it("rejects garbage", async () => {
    await expect(fromPrivateKey("0xnotahex")).rejects.toThrow(/private key/i);
    await expect(fromPrivateKey("")).rejects.toThrow(/private key/i);
  });
});
