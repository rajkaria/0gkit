import { describe, it, expect, vi } from "vitest";
import { adaptWagmi } from "../wagmi-signer.js";

describe("adaptWagmi", () => {
  it("returns null when no address", () => {
    expect(
      adaptWagmi({
        address: undefined,
        signMessageAsync: vi.fn(),
        signTypedDataAsync: vi.fn(),
        sendTransactionAsync: vi.fn(),
      })
    ).toBeNull();
  });

  it("forwards signMessage(string)", async () => {
    const signMessageAsync = vi.fn().mockResolvedValue("0xsig");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync,
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    const sig = await s.signMessage("gm");
    expect(sig).toBe("0xsig");
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "gm" });
    expect(s.source).toBe("wagmi");
  });

  it("forwards signMessage(Uint8Array) as decoded string", async () => {
    const signMessageAsync = vi.fn().mockResolvedValue("0xsig");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync,
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    await s.signMessage(new TextEncoder().encode("hi"));
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "hi" });
  });

  it("forwards signMessage({raw}) as the raw hex value", async () => {
    const signMessageAsync = vi.fn().mockResolvedValue("0xsig");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync,
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    await s.signMessage({ raw: "0xdeadbeef" });
    expect(signMessageAsync).toHaveBeenCalledWith({ message: "0xdeadbeef" });
  });

  it("forwards signTypedData", async () => {
    const signTypedDataAsync = vi.fn().mockResolvedValue("0xtyped");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync: vi.fn(),
      signTypedDataAsync,
      sendTransactionAsync: vi.fn(),
    })!;
    const args = {
      domain: { name: "Test", chainId: 1 },
      types: { Greeting: [{ name: "message", type: "string" }] },
      primaryType: "Greeting",
      message: { message: "gm" },
    };
    const sig = await s.signTypedData(args);
    expect(sig).toBe("0xtyped");
    expect(signTypedDataAsync).toHaveBeenCalledWith(args);
  });

  it("forwards sendTransaction", async () => {
    const sendTransactionAsync = vi.fn().mockResolvedValue("0xtxhash");
    const s = adaptWagmi({
      address: "0x1111111111111111111111111111111111111111",
      signMessageAsync: vi.fn(),
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync,
    })!;
    const tx = {
      to: "0x2222222222222222222222222222222222222222" as `0x${string}`,
      value: 1n,
    };
    const hash = await s.sendTransaction(tx);
    expect(hash).toBe("0xtxhash");
    expect(sendTransactionAsync).toHaveBeenCalledWith(tx);
  });

  it("exposes the connected address", () => {
    const s = adaptWagmi({
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      signMessageAsync: vi.fn(),
      signTypedDataAsync: vi.fn(),
      sendTransactionAsync: vi.fn(),
    })!;
    expect(s.address).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  });
});
