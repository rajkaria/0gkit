import { describe, expect, it } from "vitest";
import {
  ZeroGError,
  ConfigError,
  NetworkError,
  ChainError,
  AttestationError,
} from "../errors.js";

describe("ZeroGError", () => {
  it("requires a canonical code and exposes helpUrl", () => {
    const e = new ZeroGError(
      "STORAGE_QUOTA_EXCEEDED",
      "over quota",
      "raise quota or shrink upload"
    );
    expect(e.code).toBe("STORAGE_QUOTA_EXCEEDED");
    expect(e.helpUrl).toBe("https://0gkit.com/errors/STORAGE_QUOTA_EXCEEDED");
    expect(e.hint).toBe("raise quota or shrink upload");
    expect(e.message).toBe("over quota");
    expect(e.name).toBe("ZeroGError");
    expect(e instanceof Error).toBe(true);
  });

  it("toJSON serialises code, message, hint, helpUrl", () => {
    const e = new ZeroGError("CHAIN_RPC_UNREACHABLE", "rpc down", "check connectivity");
    expect(e.toJSON()).toEqual({
      name: "ZeroGError",
      code: "CHAIN_RPC_UNREACHABLE",
      message: "rpc down",
      hint: "check connectivity",
      helpUrl: "https://0gkit.com/errors/CHAIN_RPC_UNREACHABLE",
    });
  });
});

describe("subclasses", () => {
  it("ConfigError defaults to CONFIG_INVALID_ARGUMENT when no code given", () => {
    const e = new ConfigError("bad", "fix");
    expect(e.code).toBe("CONFIG_INVALID_ARGUMENT");
    expect(e).toBeInstanceOf(ZeroGError);
    expect(e.name).toBe("ConfigError");
  });

  it("ConfigError accepts an explicit code in the CONFIG_* namespace", () => {
    const e = new ConfigError("missing", "set FOO", "CONFIG_MISSING_ENV");
    expect(e.code).toBe("CONFIG_MISSING_ENV");
  });

  it("NetworkError defaults to CHAIN_RPC_UNREACHABLE", () => {
    const e = new NetworkError("rpc", "retry");
    expect(e.code).toBe("CHAIN_RPC_UNREACHABLE");
  });

  it("ChainError defaults to CHAIN_TX_REVERTED", () => {
    const e = new ChainError("revert", "check args");
    expect(e.code).toBe("CHAIN_TX_REVERTED");
  });

  it("AttestationError defaults to ATTESTATION_BAD_SIGNATURE", () => {
    const e = new AttestationError("bad sig", "regenerate");
    expect(e.code).toBe("ATTESTATION_BAD_SIGNATURE");
  });
});
