/**
 * Unit tests for the inft-studio portable core.
 *
 * Uses pure in-memory mocks for all injected deps — NO network, NO real 0gkit.
 * Run via:
 *   ./packages/0gkit-kits/node_modules/.bin/vitest run --root templates/_kits/inft-studio
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  mintInft,
  type StorageClient,
  type Erc721MintClient,
  type Attestor,
  type MintDeps,
  type MintInput,
} from "../inft.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockStorage(
  root = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
): StorageClient & { uploads: Uint8Array[] } {
  const uploads: Uint8Array[] = [];
  return {
    uploads,
    async upload(bytes: Uint8Array) {
      uploads.push(bytes);
      return { root };
    },
  };
}

function mockErc721(): Erc721MintClient & {
  calls: Array<{ to: string; metadataRoot: string }>;
} {
  const calls: Array<{ to: string; metadataRoot: string }> = [];
  let nextTokenId = 1n;
  return {
    calls,
    async mint(to: string, metadataRoot: string) {
      calls.push({ to, metadataRoot });
      const tokenId = nextTokenId++;
      return { tokenId, txHash: "0xtxhash" };
    },
  };
}

function mockAttestor(): Attestor & { lastReceipt: unknown } {
  let lastReceipt: unknown = null;
  return {
    get lastReceipt() {
      return lastReceipt;
    },
    async sign(receipt: unknown) {
      lastReceipt = receipt;
      return { digest: "0xdeadbeef", signature: "0xsignature" };
    },
    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ) {
      const okDigest = signed.digest === "0xdeadbeef";
      return { ok: okDigest && expectedSigner === "0xsigner", signer: expectedSigner };
    },
  };
}

// A round-trip attestor backed by HMAC-SHA256 for tamper-detection tests
function makeRoundTripAttestor(signerAddress: string): Attestor {
  const secret = "inft-test-secret";
  function hmac(obj: unknown): string {
    return (
      "0x" + createHmac("sha256", secret).update(JSON.stringify(obj)).digest("hex")
    );
  }
  return {
    async sign(receipt: unknown) {
      const digest = hmac(receipt);
      return { digest, signature: digest };
    },
    async verify(
      receipt: unknown,
      signed: { digest: string; signature: string },
      expectedSigner: string
    ) {
      const recomputed = hmac(receipt);
      const ok =
        recomputed.toLowerCase() === signed.digest.toLowerCase() &&
        expectedSigner.toLowerCase() === signerAddress.toLowerCase();
      return { ok, signer: signerAddress };
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_INPUT: MintInput = {
  to: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  metadata: { name: "My iNFT #1", description: "AI-generated NFT", image: "" },
  media: new Uint8Array([1, 2, 3, 4, 5]),
};

function makeDeps(overrides?: Partial<MintDeps>): MintDeps {
  return {
    storage: mockStorage(),
    erc721: mockErc721(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: mint without provenance
// ---------------------------------------------------------------------------

describe("mintInft — basic mint (no attestation)", () => {
  it("returns tokenId, tokenUri, contentHash", async () => {
    const result = await mintInft(SAMPLE_INPUT, makeDeps());

    expect(typeof result.tokenId).toBe("bigint");
    expect(result.tokenId).toBe(1n);
    expect(typeof result.tokenUri).toBe("string");
    expect(result.tokenUri.length).toBeGreaterThan(0);
    expect(typeof result.contentHash).toBe("string");
    expect(result.contentHash.length).toBeGreaterThan(0);
  });

  it("uploads media to storage and derives contentHash from media root", async () => {
    const storage = mockStorage("0xmediaroot");
    const deps = makeDeps({ storage });
    const result = await mintInft(SAMPLE_INPUT, deps);

    // Media is uploaded
    expect(storage.uploads.length).toBeGreaterThanOrEqual(1);
    // contentHash is the media root
    expect(result.contentHash).toBe("0xmediaroot");
  });

  it("uploads metadata JSON to storage and uses metadata root as tokenUri basis", async () => {
    const storage = mockStorage("0xmetaroot");
    const deps = makeDeps({ storage });
    const result = await mintInft(SAMPLE_INPUT, deps);

    // At least two uploads: media + metadata
    expect(storage.uploads.length).toBeGreaterThanOrEqual(2);
    // tokenUri reflects the metadata root
    expect(result.tokenUri).toContain("0xmetaroot");
  });

  it("calls erc721.mint with the recipient address and a bytes32-compatible metadata root", async () => {
    const erc721 = mockErc721();
    const deps = makeDeps({ erc721 });
    await mintInft(SAMPLE_INPUT, deps);

    expect(erc721.calls.length).toBe(1);
    expect(erc721.calls[0].to).toBe(SAMPLE_INPUT.to);
    // metadataRoot should be a 0x-prefixed string (hex bytes32)
    expect(erc721.calls[0].metadataRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("provenance is undefined when attestProvenance is falsy", async () => {
    const result = await mintInft(SAMPLE_INPUT, makeDeps());
    expect(result.provenance).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: mint with provenance attestation
// ---------------------------------------------------------------------------

describe("mintInft — with attestProvenance", () => {
  it("provenance is defined when attestor is provided and attestProvenance=true", async () => {
    const attestor = mockAttestor();
    const result = await mintInft(
      {
        ...SAMPLE_INPUT,
        attestProvenance: true,
        model: "test-model",
        prompt: "test prompt",
      },
      { ...makeDeps(), attestor }
    );

    expect(result.provenance).toBeDefined();
  });

  it("provenance carries model, prompt, contentHash", async () => {
    const attestor = mockAttestor();
    const result = await mintInft(
      {
        ...SAMPLE_INPUT,
        attestProvenance: true,
        model: "llama-3.1-70b",
        prompt: "paint a surreal castle",
      },
      { ...makeDeps(), attestor }
    );

    expect(result.provenance!.model).toBe("llama-3.1-70b");
    expect(result.provenance!.prompt).toBe("paint a surreal castle");
    expect(typeof result.provenance!.contentHash).toBe("string");
  });

  it("provenance carries a signed attestation (digest + signature)", async () => {
    const attestor = mockAttestor();
    const result = await mintInft(
      { ...SAMPLE_INPUT, attestProvenance: true },
      { ...makeDeps(), attestor }
    );

    expect(result.provenance!.attestation).toBeDefined();
    expect(result.provenance!.attestation!.digest).toBe("0xdeadbeef");
    expect(result.provenance!.attestation!.signature).toBe("0xsignature");
  });

  it("attestor.sign is called with a receipt containing model/prompt/contentHash", async () => {
    const attestor = mockAttestor();
    await mintInft(
      { ...SAMPLE_INPUT, attestProvenance: true, model: "m1", prompt: "p1" },
      { ...makeDeps(), attestor }
    );

    const receipt = attestor.lastReceipt as Record<string, unknown>;
    expect(receipt.model).toBe("m1");
    expect(receipt.prompt).toBe("p1");
    expect(typeof receipt.contentHash).toBe("string");
  });

  it("throws when attestProvenance=true but no attestor is injected", async () => {
    await expect(
      mintInft(
        { ...SAMPLE_INPUT, attestProvenance: true },
        makeDeps() // no attestor
      )
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Round-trip attestor tests
// ---------------------------------------------------------------------------

describe("provenance round-trip", () => {
  const SIGNER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  it("verify(provenance.receipt, provenance.attestation, signer) returns ok=true", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await mintInft(
      { ...SAMPLE_INPUT, attestProvenance: true, model: "m", prompt: "p" },
      { ...makeDeps(), attestor }
    );

    const { ok, signer } = await attestor.verify(
      result.provenance!.receipt,
      result.provenance!.attestation!,
      SIGNER
    );

    expect(ok).toBe(true);
    expect(signer.toLowerCase()).toBe(SIGNER.toLowerCase());
  });

  it("verify with tampered receipt returns ok=false", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await mintInft(
      { ...SAMPLE_INPUT, attestProvenance: true, model: "m", prompt: "p" },
      { ...makeDeps(), attestor }
    );

    const tampered = { ...result.provenance!.receipt, contentHash: "0xtampered" };
    const { ok } = await attestor.verify(
      tampered,
      result.provenance!.attestation!,
      SIGNER
    );
    expect(ok).toBe(false);
  });

  it("verify with wrong expectedSigner returns ok=false", async () => {
    const attestor = makeRoundTripAttestor(SIGNER);
    const result = await mintInft(
      { ...SAMPLE_INPUT, attestProvenance: true, model: "m", prompt: "p" },
      { ...makeDeps(), attestor }
    );

    const { ok } = await attestor.verify(
      result.provenance!.receipt,
      result.provenance!.attestation!,
      "0x0000000000000000000000000000000000000001"
    );
    expect(ok).toBe(false);
  });
});
