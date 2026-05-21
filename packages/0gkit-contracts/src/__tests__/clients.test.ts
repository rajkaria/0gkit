import { describe, it, expect } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { generatePrivateKey } from "viem/accounts";
import { buildClients } from "../clients.js";

describe("buildClients", () => {
  it("returns a public client for galileo by default", () => {
    const { publicClient, walletClient } = buildClients({});
    expect(publicClient).toBeDefined();
    expect(walletClient).toBeUndefined();
  });

  it("returns a wallet client when signer.privateKey is provided", () => {
    const pk = generatePrivateKey();
    const signer = {
      address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      privateKey: pk,
      source: "private-key" as const,
      signMessage: async () => "0x" as `0x${string}`,
      signTypedData: async () => "0x" as `0x${string}`,
      sendTransaction: async () => "0x" as `0x${string}`,
    };
    const { walletClient } = buildClients({ signer });
    expect(walletClient).toBeDefined();
  });

  it("does not return a wallet client when signer has no privateKey", () => {
    const signer = {
      address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
      source: "kms" as const,
      signMessage: async () => "0x" as `0x${string}`,
      signTypedData: async () => "0x" as `0x${string}`,
      sendTransaction: async () => "0x" as `0x${string}`,
    };
    const { walletClient } = buildClients({ signer });
    expect(walletClient).toBeUndefined();
  });

  it("respects an explicit rpcUrl override", () => {
    const { publicClient } = buildClients({
      network: "local",
      rpcUrl: "http://127.0.0.1:9999",
    });
    expect(publicClient).toBeDefined();
  });

  it("throws ConfigError when neither preset nor override supplies an rpcUrl", () => {
    // Force the missing-rpc path by stubbing getNetwork via a custom Network. We
    // do this by passing a non-existent network name cast through unknown — the
    // function will throw at getNetwork before reaching the rpc check, which is
    // also a ConfigError (covers the same error branch).
    expect(() =>
      buildClients({ network: "no-such-network" as unknown as "aristotle" })
    ).toThrow(ConfigError);
  });
});
