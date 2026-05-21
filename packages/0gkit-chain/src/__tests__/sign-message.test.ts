import { describe, it, expect } from "vitest";
import { fromPrivateKey } from "@foundryprotocol/0gkit-wallet";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { signMessageWith } from "../sign-message.js";

describe("signMessageWith", () => {
  it("signs a string message and the recovered address matches", async () => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    const signer = await fromPrivateKey(pk);

    const sig = await signMessageWith(signer, "gm");

    const recovered = await recoverMessageAddress({ message: "gm", signature: sig });
    expect(recovered.toLowerCase()).toBe(addr.toLowerCase());
  });

  it("signs a Uint8Array payload and recovers correctly", async () => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    const signer = await fromPrivateKey(pk);
    const bytes = new TextEncoder().encode("0g is live");

    const sig = await signMessageWith(signer, bytes);

    const recovered = await recoverMessageAddress({
      message: { raw: bytes },
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(addr.toLowerCase());
  });

  it("signs a { raw } hex payload and recovers correctly", async () => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    const signer = await fromPrivateKey(pk);
    const raw = "0xdeadbeef" as `0x${string}`;

    const sig = await signMessageWith(signer, { raw });

    const recovered = await recoverMessageAddress({
      message: { raw },
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(addr.toLowerCase());
  });
});
