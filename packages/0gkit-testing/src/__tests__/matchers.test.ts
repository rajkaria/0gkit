import { describe, it, expect } from "vitest";
import { ConfigError } from "@foundryprotocol/0gkit-core";
import { toBeConfirmedOn0G } from "../matchers/to-be-confirmed-on-0g.js";
import { toHaveRootMatching } from "../matchers/to-have-root-matching.js";
import { toBeValidAttestation } from "../matchers/to-be-valid-attestation.js";
import { toBeZeroGError } from "../matchers/to-be-zero-g-error.js";
import { fixtureReceipt } from "../fixtures/receipt.js";
import { fixtureAttestation } from "../fixtures/attestation.js";

// All four matchers self-register on import via src/matchers/*.ts so we don't
// need a separate `import "@foundryprotocol/0gkit-testing/matchers"` here.
import "../matchers/index.js";

describe("toBeConfirmedOn0G", () => {
  it("passes for a valid Receipt fixture", () => {
    const r = toBeConfirmedOn0G(fixtureReceipt());
    expect(r.pass).toBe(true);
  });

  it("fails for a non-object", () => {
    const r = toBeConfirmedOn0G(undefined);
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/Expected a 0G Receipt/);
  });

  it("fails on a malformed txHash", () => {
    const r = toBeConfirmedOn0G({ txHash: "0xshort", blockNumber: 1n, latencyMs: 0 });
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/32-byte hex/);
  });

  it("fails on missing blockNumber", () => {
    const r = toBeConfirmedOn0G({
      txHash: "0x" + "ab".repeat(32),
      blockNumber: undefined,
      latencyMs: 0,
    });
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/blockNumber/);
  });

  it("fails on negative latencyMs", () => {
    const r = toBeConfirmedOn0G({
      txHash: "0x" + "ab".repeat(32),
      blockNumber: 1n,
      latencyMs: -1,
    });
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/latencyMs/);
  });
});

describe("toHaveRootMatching", () => {
  it("passes when root matches the regex", () => {
    const root = "0x" + "ab".repeat(32);
    const r = toHaveRootMatching(root, /^0xab/);
    expect(r.pass).toBe(true);
  });

  it("fails for a non-string", () => {
    const r = toHaveRootMatching(123, /^0x/);
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/root string/);
  });

  it("fails when the value isn't a 32-byte hex root", () => {
    const r = toHaveRootMatching("0xshort", /^0x/);
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/32-byte hex root/);
  });

  it("fails when the regex doesn't match", () => {
    const root = "0x" + "00".repeat(32);
    const r = toHaveRootMatching(root, /deadbeef/);
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/did not/);
  });

  it("accepts a string pattern", () => {
    const root = "0x" + "ab".repeat(32);
    const r = toHaveRootMatching(root, "^0xab");
    expect(r.pass).toBe(true);
  });
});

describe("toBeValidAttestation", () => {
  it("fails for a non-object", async () => {
    const r = await toBeValidAttestation(undefined);
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/SignedEnvelope/);
  });

  it("fails for missing fields", async () => {
    const r = await toBeValidAttestation({ envelope: { kind: "x" } });
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/digest|signature/);
  });
  // The happy-path round-trip through @foundryprotocol/0gkit-attestation
  // is covered by the migrated test in `0gkit-attestation/__tests__/fixture.test.ts`.
  // Keeping it there (not here) avoids a turbo build cycle between the two
  // packages while still proving the matcher works against real envelopes.
});

describe("toBeZeroGError", () => {
  it("passes for a matching ZeroGError code", () => {
    const err = new ConfigError("oops", "fix it");
    const r = toBeZeroGError(err, "CONFIG");
    expect(r.pass).toBe(true);
  });

  it("fails on a wrong code", () => {
    const err = new ConfigError("oops", "fix it");
    const r = toBeZeroGError(err, "CHAIN");
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/CHAIN.*CONFIG|CONFIG.*CHAIN/);
  });

  it("fails for a non-ZeroGError", () => {
    const r = toBeZeroGError(new Error("vanilla"), "CONFIG");
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/ZeroGError/);
  });

  it("fails for an unknown code argument", () => {
    const err = new ConfigError("x", "y");
    const r = toBeZeroGError(err, "NOPE");
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/not a known/);
  });
});

describe("matchers self-register on import", () => {
  it("expect.toBeConfirmedOn0G is callable after importing matchers/index", () => {
    expect(fixtureReceipt()).toBeConfirmedOn0G();
  });
  it("expect.toBeZeroGError is callable", () => {
    expect(new ConfigError("x", "y")).toBeZeroGError("CONFIG");
  });
});
