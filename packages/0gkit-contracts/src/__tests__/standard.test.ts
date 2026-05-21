import { describe, it, expect } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import {
  standardContracts,
  standardContractsMeta,
  KNOWN_ADDRESSES,
} from "../standard/index.js";

const TOKEN_ADDRESS = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`;

describe("standardContracts.erc20", () => {
  it("builds a typed handle when address is supplied", () => {
    const c = standardContracts.erc20({ address: TOKEN_ADDRESS, network: "galileo" });
    expect(c.address).toBe(TOKEN_ADDRESS);
    expect(typeof c.read).toBe("object");
    expect(typeof c.write.transfer).toBe("function");
    expect(typeof c.events.Transfer).toBe("function");
  });

  it("throws ConfigError when address is missing", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => standardContracts.erc20({ network: "galileo" })).toThrow(ConfigError);
  });
});

describe("standardContracts.erc721", () => {
  it("builds a typed handle when address is supplied", () => {
    const c = standardContracts.erc721({ address: TOKEN_ADDRESS });
    expect(c.address).toBe(TOKEN_ADDRESS);
    expect(typeof c.write.safeTransferFrom).toBe("function");
    expect(typeof c.events.ApprovalForAll).toBe("function");
  });

  it("throws ConfigError when address is missing", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => standardContracts.erc721({})).toThrow(ConfigError);
  });
});

describe("standardContracts.multicall3", () => {
  it("defaults to the universal multicall3 address per network", () => {
    const c = standardContracts.multicall3({ network: "galileo" });
    expect(c.address).toBe(KNOWN_ADDRESSES.multicall3.galileo);
  });

  it("allows an address override", () => {
    const custom = "0x1111111111111111111111111111111111111111" as `0x${string}`;
    const c = standardContracts.multicall3({ address: custom });
    expect(c.address).toBe(custom);
  });
});

describe("standardContracts.registry", () => {
  it("throws ConfigError when the network address is not pinned", () => {
    expect(() => standardContracts.registry({ network: "galileo" })).toThrow(
      ConfigError
    );
  });

  it("works when address is supplied explicitly", () => {
    const c = standardContracts.registry({
      address: "0x2222222222222222222222222222222222222222",
      network: "galileo",
    });
    expect(c.address).toBe("0x2222222222222222222222222222222222222222");
    expect(typeof c.read.getProvider).toBe("function");
  });
});

describe("standardContracts.attestationVerifier", () => {
  it("throws ConfigError when the network address is not pinned", () => {
    expect(() => standardContracts.attestationVerifier({ network: "galileo" })).toThrow(
      ConfigError
    );
  });

  it("works when address is supplied explicitly", () => {
    const c = standardContracts.attestationVerifier({
      address: "0x3333333333333333333333333333333333333333",
      network: "galileo",
    });
    expect(c.address).toBe("0x3333333333333333333333333333333333333333");
    expect(typeof c.write.submitAttestation).toBe("function");
  });
});

describe("standardContractsMeta", () => {
  it("exposes all five contracts with method + event lists", () => {
    expect(Object.keys(standardContractsMeta).sort()).toEqual([
      "attestationVerifier",
      "erc20",
      "erc721",
      "multicall3",
      "registry",
    ]);
    expect(standardContractsMeta.erc20!.methods).toContain("transfer");
    expect(standardContractsMeta.erc721!.events).toContain("Transfer");
    expect(standardContractsMeta.multicall3!.methods).toContain("aggregate3");
    expect(standardContractsMeta.registry!.events).toContain("ProviderRegistered");
    expect(standardContractsMeta.attestationVerifier!.events).toContain(
      "AttestationSubmitted"
    );
  });
});
