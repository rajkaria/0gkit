import {
  ConfigError,
  NetworkError,
  type DryRunResult,
  type Receipt,
  type Signer,
} from "@foundryprotocol/0gkit-core";
import { makeComputeEstimate, type ComputeEstimate } from "./estimate.js";
import {
  selectProviders,
  toProviderInfo,
  type ProviderInfo,
} from "./router-select.js";

const DEFAULT_RPC = "https://evmrpc.0g.ai";
const PKG_NEW = "@0gfoundation/0g-compute-ts-sdk";
const PKG_OLD = "@0glabs/0g-serving-broker";

// Real 0G Router endpoints (T0 research gate, VERIFIED —
// docs/research/2026-07-01-0g-router-api.md). OpenAI-compatible HTTP.
const ROUTER_URL_MAINNET = "https://router-api.0g.ai/v1";
const ROUTER_URL_TESTNET = "https://router-api-testnet.integratenetwork.work/v1";

function defaultRouterUrl(network?: "aristotle" | "galileo"): string {
  return network === "aristotle" ? ROUTER_URL_MAINNET : ROUTER_URL_TESTNET;
}

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
  /**
   * 0G Router API key (from the pc.0g.ai Web UI). When set, `router()` uses the
   * real, OpenAI-compatible 0G Router endpoint. When unset, `router()` falls
   * back to honest client-side selection over `listProviders()`.
   */
  routerApiKey?: string;
  /**
   * Override the 0G Router base URL. Defaults by `network`: galileo → testnet,
   * aristotle → mainnet.
   */
  routerUrl?: string;
  fetch?: typeof fetch;
  loadBroker?: (name: string) => Promise<unknown>;
  loadEthers?: () => Promise<typeof import("ethers")>;
}

/** Arguments for {@link Compute.router}. */
export interface RouterArgs {
  /**
   * Model to route to. Required when hitting the real 0G Router endpoint;
   * optional on the client-side fallback (omit to try every provider in turn).
   */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Pin a provider: hoisted to the head of the fallback candidate list. */
  prefer?: string;
  /** Routing knob passed to the real 0G Router endpoint (e.g. cheapest wins). */
  sort?: "price";
  /** Max candidates the client-side fallback will try before giving up. */
  maxAttempts?: number;
}

/** Result of {@link Compute.router} — identical shape to `inference()`. */
export type RouterResult = InferenceResult;

/** @internal — exposed only for test isolation; not part of the public API. */
export let __resetDeprecationWarning: () => void;

let warnedBrokerKey = false;
let warnedClientRouting = false;
__resetDeprecationWarning = () => {
  warnedBrokerKey = false;
  warnedClientRouting = false;
};

export interface InferenceResult {
  output: string;
  receipt: Receipt;
  raw: unknown;
}

/** Arguments for {@link Compute.inference} / {@link Compute.direct}. */
export interface InferenceArgs {
  /**
   * Provider to call for this request. Overrides the constructor `provider`
   * when set — `router()` uses this to try candidates in turn. Additive; the
   * published `inference()` behaviour is unchanged when omitted (D13).
   */
  provider?: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
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

  private requireProvider(override?: string): string {
    const provider = override ?? this.cfg.provider;
    if (!provider) {
      throw new ConfigError(
        `Compute requires a provider address.`,
        `Pass { provider } (the on-chain 0G inference provider address), or use router() to select one.`
      );
    }
    return provider;
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

  async inference(args: InferenceArgs): Promise<InferenceResult>;
  async inference(
    args: InferenceArgs,
    opts: { dryRun: true }
  ): Promise<DryRunResult<InferenceResult>>;
  async inference(
    args: InferenceArgs,
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
    const provider = this.requireProvider(args.provider);
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

  /**
   * Model-first inference that picks a provider for you, with retries and
   * fallback — so app code stops hard-coding a provider address.
   *
   * Primary path: if a `routerApiKey` is configured, this calls the real,
   * OpenAI-compatible **0G Router** endpoint (`router-api.0g.ai/v1`), which
   * selects a provider server-side and settles from a single balance.
   *
   * Fallback path: with no `routerApiKey`, it selects client-side over
   * `listProviders()` and delegates to `inference()` across candidates with
   * retry/fallback (honest — labelled at runtime and in the docs).
   */
  async router(args: RouterArgs): Promise<InferenceResult> {
    // Resolve model + prefer once (per-call wins, then the constructor default)
    // so templates that pin { model } / { provider } on the client don't repeat
    // them per request. `prefer` only steers the client-side fallback ordering.
    const resolved: RouterArgs = {
      ...args,
      model: args.model ?? this.cfg.model,
      prefer: args.prefer ?? this.cfg.provider,
    };
    if (this.cfg.routerApiKey) {
      return this.routeViaEndpoint(resolved, this.cfg.routerApiKey);
    }
    return this.routeClientSide(resolved);
  }

  /** Explicit-provider path — a thin alias for {@link inference} (D13: no rename). */
  async direct(args: InferenceArgs): Promise<InferenceResult> {
    return this.inference(args);
  }

  private async routeViaEndpoint(
    args: RouterArgs,
    apiKey: string
  ): Promise<InferenceResult> {
    if (!args.model) {
      throw new ConfigError(
        `router() needs a { model } when using the 0G Router endpoint.`,
        `Pass a model (browse GET ${
          this.cfg.routerUrl ?? defaultRouterUrl(this.cfg.network)
        }/models), or unset ROUTER_API_KEY to select a provider client-side.`
      );
    }
    const base = this.cfg.routerUrl ?? defaultRouterUrl(this.cfg.network);
    const body = {
      model: args.model,
      messages: args.messages,
      ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
      ...(args.sort ? { sort: args.sort } : {}),
    };
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(
        `0G Router request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        `Check the router endpoint (${base}) and your network connectivity.`
      );
    }
    if (!res.ok) {
      throw new NetworkError(
        `0G Router returned HTTP ${res.status}.`,
        `Verify ROUTER_API_KEY is valid and the router balance is funded (pc.0g.ai).`
      );
    }
    const raw = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      output: raw.choices?.[0]?.message?.content ?? "",
      receipt: { latencyMs: Date.now() - startedAt },
      raw,
    };
  }

  private async routeClientSide(args: RouterArgs): Promise<InferenceResult> {
    if (!warnedClientRouting) {
      console.warn(
        "@foundryprotocol/0gkit-compute: router() is selecting a provider " +
          "client-side over listProviders().\n" +
          "  Set ROUTER_API_KEY (from pc.0g.ai) to use the managed 0G Router " +
          "endpoint with server-side selection + failover."
      );
      warnedClientRouting = true;
    }
    const raw = await this.listProviders();
    const candidates = selectProviders(
      raw
        .map(toProviderInfo)
        .filter((p): p is ProviderInfo => p !== undefined),
      { model: args.model, prefer: args.prefer }
    );
    if (candidates.length === 0) {
      throw new NetworkError(
        `No 0G compute provider is reachable${
          args.model ? ` for model '${args.model}'` : ""
        }.`,
        `Run \`0g doctor\` to check the broker RPC, set ROUTER_API_KEY to use the 0G Router, or pass { prefer } with a known provider.`
      );
    }
    const limit = Math.min(
      args.maxAttempts ?? candidates.length,
      candidates.length
    );
    let lastErr: unknown;
    for (let i = 0; i < limit; i++) {
      try {
        return await this.inference({
          provider: candidates[i].provider,
          model: args.model,
          messages: args.messages,
          temperature: args.temperature,
        });
      } catch (e) {
        lastErr = e; // fall through to the next candidate
      }
    }
    throw lastErr;
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
