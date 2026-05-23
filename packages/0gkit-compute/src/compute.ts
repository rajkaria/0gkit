import {
  ConfigError,
  NetworkError,
  type DryRunResult,
  type Receipt,
  type Signer,
} from "@foundryprotocol/0gkit-core";
import { makeComputeEstimate, type ComputeEstimate } from "./estimate.js";

const DEFAULT_RPC = "https://evmrpc.0g.ai";
const PKG_NEW = "@0gfoundation/0g-compute-ts-sdk";
const PKG_OLD = "@0glabs/0g-serving-broker";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ComputeConfig {
  network?: "aristotle" | "galileo";
  brokerRpc?: string;
  /**
   * Preferred: pass a Signer from `@foundryprotocol/0gkit-wallet`.
   * Loaders that hold the plaintext key (`fromPrivateKey`, `fromFile`, `fromEnv`)
   * expose `signer.privateKey` — the SDK adapter uses that for now.
   * KMS-backed signers don't expose `privateKey`; they are accepted here but
   * writes will throw a clear ConfigError until the SDK adapter is updated.
   */
  signer?: Signer;
  /**
   * @deprecated Pass `{ signer }` from `@foundryprotocol/0gkit-wallet` instead.
   * Will be removed in v0.3.
   */
  brokerKey?: string;
  provider?: string;
  model?: string;
  fetch?: typeof fetch;
  loadBroker?: (name: string) => Promise<unknown>;
  loadEthers?: () => Promise<typeof import("ethers")>;
}

/** @internal — exposed only for test isolation; not part of the public API. */
export let __resetDeprecationWarning: () => void;

let warnedBrokerKey = false;
__resetDeprecationWarning = () => {
  warnedBrokerKey = false;
};

export interface InferenceResult {
  output: string;
  receipt: Receipt;
  raw: unknown;
}

interface BrokerInference {
  acknowledgeProviderSigner(p: string): Promise<void>;
  getServiceMetadata(p: string): Promise<{ endpoint: string; model: string }>;
  getRequestHeaders(p: string, content?: string): Promise<Record<string, string>>;
  processResponse(
    p: string,
    content?: string
  ): Promise<{ valid?: boolean; txHash?: string } | boolean | null>;
  listService(): Promise<unknown[]>;
}

export class Compute {
  private readonly cfg: ComputeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly resolvedBrokerKey?: string;
  private broker?: { inference: BrokerInference };

  constructor(config: ComputeConfig) {
    this.cfg = config;
    this.fetchImpl = config.fetch ?? globalThis.fetch;

    if (config.signer) {
      // signer.privateKey may be undefined for KMS-backed signers — intentional.
      // The getBroker() path will throw a clear ConfigError if a key is needed.
      this.resolvedBrokerKey = config.signer.privateKey;
    } else if (config.brokerKey !== undefined) {
      if (!warnedBrokerKey) {
        console.warn(
          "@foundryprotocol/0gkit-compute: `{ brokerKey }` is deprecated and will be removed in v2.\n" +
            "  Migrate to `{ signer: await fromEnv() }` (or fromPrivateKey/fromKMS) from @foundryprotocol/0gkit-wallet."
        );
        warnedBrokerKey = true;
      }
      this.resolvedBrokerKey = config.brokerKey;
    }
  }

  async estimate(args: {
    messages: ChatMessage[];
    model?: string;
    maxOutputTokens?: number;
  }): Promise<ComputeEstimate> {
    return makeComputeEstimate({
      messages: args.messages,
      model: args.model ?? this.cfg.model,
      maxOutputTokens: args.maxOutputTokens,
    });
  }

  private async loadBrokerMod(): Promise<{
    createZGComputeNetworkBroker: (signer: unknown) => Promise<unknown>;
  }> {
    // The optional broker SDK is resolved at runtime, never bundled. The
    // specifier is a variable *and* carries bundler-ignore magic comments so
    // every toolchain leaves it alone: esbuild/vite skip the unresolvable
    // `import(var)`, vitest consumers don't try to resolve a peer that isn't
    // installed, and Turbopack (the playground's bundler) honours
    // `turbopackIgnore` instead of hard-failing on a dynamic specifier.
    const load =
      this.cfg.loadBroker ??
      ((name: string) =>
        import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ name as string
        ) as Promise<unknown>);
    try {
      return (await load(PKG_NEW)) as never;
    } catch {
      try {
        return (await load(PKG_OLD)) as never;
      } catch (err) {
        throw new ConfigError(
          `0G compute SDK not found (${PKG_NEW} or ${PKG_OLD}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          `Install it: npm install ${PKG_NEW} ethers`
        );
      }
    }
  }

  private async getBroker(): Promise<{ inference: BrokerInference }> {
    if (this.broker) return this.broker;
    if (!this.resolvedBrokerKey) {
      throw new ConfigError(
        `Compute requires a signer or brokerKey.`,
        `Pass { signer: await fromPrivateKey(key) } from @foundryprotocol/0gkit-wallet to the constructor.`
      );
    }
    let ethers: typeof import("ethers");
    try {
      ethers = this.cfg.loadEthers
        ? await this.cfg.loadEthers()
        : ((await import("ethers" as string)) as typeof import("ethers"));
    } catch (err) {
      throw new ConfigError(
        `ethers could not be loaded: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Install it: npm install ethers`
      );
    }
    const provider = new ethers.JsonRpcProvider(this.cfg.brokerRpc ?? DEFAULT_RPC);
    const wallet = new ethers.Wallet(this.resolvedBrokerKey, provider);
    const mod = await this.loadBrokerMod();
    if (typeof mod.createZGComputeNetworkBroker !== "function") {
      throw new ConfigError(
        `0G compute SDK loaded but 'createZGComputeNetworkBroker' is not exported.`,
        `The installed SDK version may be incompatible. Try: npm install ${PKG_NEW}@latest`
      );
    }
    this.broker = (await mod.createZGComputeNetworkBroker(wallet)) as {
      inference: BrokerInference;
    };
    return this.broker;
  }

  private requireProvider(): string {
    if (!this.cfg.provider) {
      throw new ConfigError(
        `Compute requires a provider address.`,
        `Pass { provider } (the on-chain 0G inference provider address).`
      );
    }
    return this.cfg.provider;
  }

  async listProviders(): Promise<unknown[]> {
    const broker = await this.getBroker();
    try {
      return await broker.inference.listService();
    } catch (err) {
      throw new NetworkError(
        `Failed to list 0G compute providers: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Check your RPC endpoint and network connectivity.`
      );
    }
  }

  async inference(args: {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<InferenceResult>;
  async inference(
    args: {
      model?: string;
      messages: ChatMessage[];
      temperature?: number;
      maxOutputTokens?: number;
    },
    opts: { dryRun: true }
  ): Promise<DryRunResult<InferenceResult>>;
  async inference(
    args: {
      model?: string;
      messages: ChatMessage[];
      temperature?: number;
      maxOutputTokens?: number;
    },
    opts?: { dryRun?: boolean }
  ): Promise<InferenceResult | DryRunResult<InferenceResult>> {
    if (opts?.dryRun) {
      const estimate = await this.estimate(args);
      const result: InferenceResult = {
        output: "",
        receipt: { latencyMs: 0 },
        raw: { dryRun: true },
      };
      return { dryRun: true, estimate, result };
    }
    // `maxOutputTokens` is accepted for API uniformity with `.estimate()` but
    // is not forwarded to the broker SDK — the broker reads its own provider
    // metadata for actual generation limits.
    void args.maxOutputTokens;
    const provider = this.requireProvider();
    const broker = await this.getBroker();
    try {
      await broker.inference.acknowledgeProviderSigner(provider);
    } catch {
      /* already acknowledged — non-fatal */
    }
    let endpoint: string;
    let model: string;
    try {
      ({ endpoint, model } = await broker.inference.getServiceMetadata(provider));
    } catch (err) {
      throw new NetworkError(
        `Failed to fetch service metadata for provider ${provider}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Verify the provider address is registered and the broker is funded.`
      );
    }
    const body = {
      model: args.model ?? this.cfg.model ?? model,
      messages: args.messages,
      ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
    };
    let headers: Record<string, string>;
    try {
      headers = await broker.inference.getRequestHeaders(
        provider,
        JSON.stringify(args.messages)
      );
    } catch (err) {
      throw new NetworkError(
        `Failed to get request headers for provider ${provider}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Check broker key permissions and ledger balance.`
      );
    }
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(
        `0G compute request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Check the provider endpoint and broker balance.`
      );
    }
    if (!res.ok) {
      throw new NetworkError(
        `0G compute provider returned HTTP ${res.status}.`,
        `Verify the provider address and that the broker ledger is funded.`
      );
    }
    const raw = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const output = raw.choices?.[0]?.message?.content ?? "";
    let txHash: string | undefined;
    try {
      const pr = await broker.inference.processResponse(provider, output);
      if (pr && typeof pr === "object" && "txHash" in pr) {
        txHash = (pr as { txHash?: string }).txHash;
      }
    } catch {
      /* fee settlement best-effort — non-fatal */
    }
    return {
      output,
      receipt: { txHash, latencyMs: Date.now() - startedAt },
      raw,
    };
  }

  openai() {
    const self = this;
    return {
      chat: {
        completions: {
          async create(params: {
            model?: string;
            messages: ChatMessage[];
            temperature?: number;
          }) {
            const r = await self.inference(params);
            return {
              id: `0g-${Date.now()}`,
              object: "chat.completion" as const,
              model: params.model ?? self.cfg.model ?? "",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant" as const, content: r.output },
                  finish_reason: "stop" as const,
                },
              ],
              _0gReceipt: r.receipt,
            };
          },
        },
      },
    };
  }

  async raw(): Promise<{ inference: BrokerInference }> {
    return this.getBroker();
  }
}
