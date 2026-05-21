import {
  ConfigError,
  NetworkError,
  canonicalJsonStringify,
  type Signer,
} from "@foundryprotocol/0gkit-core";
import { keccak256, toHex, type Hex } from "viem";

const ENCODERS = {
  aristotle: "https://da-encoder.0g.network",
  galileo: "https://da-encoder-testnet.0g.ai",
} as const;

export interface DAConfig {
  network?: "aristotle" | "galileo";
  encoderUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
  /**
   * Optional Signer — currently unused (DA writes don't sign).
   * Accepted for ctor symmetry with other primitives; reserved for future
   * authenticated DA endpoints.
   */
  signer?: Signer;
}

export interface DAPublishResult {
  digest: Hex;
  daRef?: string;
  blobId?: string;
  mode: "live" | "local";
  latencyMs: number;
  raw?: unknown;
}

export class DA {
  private readonly encoderUrl?: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  /** Reserved for future authenticated DA endpoints; currently unused. */
  readonly signer?: Signer;

  constructor(config: DAConfig) {
    this.encoderUrl =
      config.encoderUrl ?? (config.network ? ENCODERS[config.network] : undefined);
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.signer = config.signer;
  }

  private toBytes(payload: unknown): Uint8Array<ArrayBuffer> {
    if (payload instanceof Uint8Array) return new Uint8Array(payload);
    if (typeof payload === "string") return new TextEncoder().encode(payload);
    return new TextEncoder().encode(canonicalJsonStringify(payload));
  }

  /**
   * keccak256 of the exact bytes that go on the wire:
   * - object → keccak of the canonical-JSON encoding (identical to
   *   @foundryprotocol/0gkit-core digestJson, the on-chain anchor)
   * - string → keccak of the raw UTF-8 bytes
   * - Uint8Array → keccak of the raw bytes
   * This matches the upstream 0G storage/DA SDK's serialize+digest contract
   * for all three payload kinds (objects, strings, bytes).
   */
  private digestOf(payload: unknown): Hex {
    return keccak256(toHex(this.toBytes(payload)));
  }

  digest(payload: unknown): Hex {
    return this.digestOf(payload);
  }

  async publish(payload: unknown): Promise<DAPublishResult> {
    const startedAt = Date.now();
    const digest = this.digestOf(payload);
    if (!this.encoderUrl) {
      return { digest, mode: "local", latencyMs: Date.now() - startedAt };
    }
    const body = this.toBytes(payload);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.encoderUrl}/blob`, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(
        `DA encoder request failed: ${msg}`,
        `Check the encoder is reachable, or omit encoderUrl for local digest mode.`
      );
    }
    if (!res.ok) {
      throw new NetworkError(
        `DA encoder returned HTTP ${res.status}.`,
        `Verify the encoder URL/API key, or use local digest mode.`
      );
    }
    const raw = (await res.json().catch(() => ({}))) as {
      blobId?: string;
      ref?: string;
    };
    return {
      digest,
      blobId: raw.blobId,
      daRef: raw.ref ?? raw.blobId,
      mode: "live",
      latencyMs: Date.now() - startedAt,
      raw,
    };
  }

  verify(payload: unknown, expectedDigest: string): boolean {
    if (!/^0x[0-9a-fA-F]{64}$/.test(expectedDigest)) {
      throw new ConfigError(
        `expectedDigest is not a 32-byte 0x hex string.`,
        `Pass the value returned by da.digest()/publish().digest.`
      );
    }
    return this.digestOf(payload).toLowerCase() === expectedDigest.toLowerCase();
  }
}
