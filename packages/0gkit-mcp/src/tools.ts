import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  ConfigError,
  createClient,
  getNetwork,
  type NetworkName,
} from "@foundryprotocol/0gkit-core";
import { faucet, balance, attachExplorerUrl } from "@foundryprotocol/0gkit-chain";
import { Storage } from "@foundryprotocol/0gkit-storage";
import { Compute } from "@foundryprotocol/0gkit-compute";
import { DA } from "@foundryprotocol/0gkit-da";
import {
  parseEnvelope,
  verifyEnvelope,
  reportEnvelope,
} from "@foundryprotocol/0gkit-attestation";
import { formatEther } from "viem";
import {
  dataNetwork,
  fail,
  ok,
  resolveNetwork,
  type ToolCallResult,
} from "./context.js";

/**
 * The neutral 0G capability surface, dependency-injected so every tool is
 * testable without a live network. Mirrors the `@foundryprotocol/0gkit-cli` command set 1:1.
 */
export interface McpDeps {
  createClient: typeof createClient;
  getNetwork: typeof getNetwork;
  faucet: typeof faucet;
  balance: typeof balance;
  attachExplorerUrl: typeof attachExplorerUrl;
  makeStorage: (cfg: ConstructorParameters<typeof Storage>[0]) => Storage;
  makeCompute: (cfg: ConstructorParameters<typeof Compute>[0]) => Compute;
  makeDA: (cfg: ConstructorParameters<typeof DA>[0]) => DA;
  attest: {
    parseEnvelope: typeof parseEnvelope;
    verifyEnvelope: typeof verifyEnvelope;
    reportEnvelope: typeof reportEnvelope;
  };
  env: Record<string, string | undefined>;
}

export function defaultDeps(
  env: Record<string, string | undefined> = process.env
): McpDeps {
  return {
    createClient,
    getNetwork,
    faucet,
    balance,
    attachExplorerUrl,
    makeStorage: (cfg) => new Storage(cfg),
    makeCompute: (cfg) => new Compute(cfg),
    makeDA: (cfg) => new DA(cfg),
    attest: { parseEnvelope, verifyEnvelope, reportEnvelope },
    env,
  };
}

const NET = z
  .enum(["aristotle", "galileo", "local"])
  .optional()
  .describe("0G network; defaults to ZEROG_NETWORK or 'galileo' (testnet).");

const StoragePutArgs = z.object({
  data: z.string().min(1).describe("UTF-8 text to upload."),
  network: NET,
  rpc: z.string().optional(),
  private_key: z
    .string()
    .optional()
    .describe("Signer key that funds the upload tx (or env ZEROG_PRIVATE_KEY)."),
});
const StorageGetArgs = z.object({
  root: z.string().min(3),
  network: NET,
  rpc: z.string().optional(),
});
const StorageExistsArgs = z.object({
  root: z.string().min(3),
  network: NET,
  rpc: z.string().optional(),
});
const InferArgs = z.object({
  message: z.string().min(1),
  provider: z
    .string()
    .optional()
    .describe("0G inference provider address (or env ZEROG_PROVIDER)."),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  network: NET,
  rpc: z.string().optional(),
  broker_key: z
    .string()
    .optional()
    .describe("Funded broker key (or env ZEROG_BROKER_KEY / ZEROG_PRIVATE_KEY)."),
});
const DaPublishArgs = z.object({
  payload: z.string().min(1).describe("UTF-8 payload to publish."),
  network: NET,
});
const DaVerifyArgs = z.object({
  payload: z.string().min(1),
  digest: z.string().min(3).describe("The digest returned by og_da_publish."),
  network: NET,
});
const ChainFaucetArgs = z.object({
  address: z.string().min(3),
  network: NET,
});
const ChainBalanceArgs = z.object({
  address: z.string().min(3),
  network: NET,
  rpc: z.string().optional(),
});
const AttestVerifyArgs = z.object({
  signed_envelope: z
    .string()
    .min(2)
    .describe("A SignedEnvelope as JSON: { envelope, digest, signature }."),
  signer: z.string().min(3).describe("The address that must have signed."),
});

export const TOOLS: Tool[] = [
  {
    name: "og_storage_put",
    description:
      "Upload bytes to 0G Storage. Returns the storage root and the funding tx hash (+ explorer link). Needs a signer key.",
    inputSchema: {
      type: "object",
      required: ["data"],
      properties: {
        data: { type: "string", description: "UTF-8 text to upload." },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
        rpc: { type: "string" },
        private_key: { type: "string" },
      },
    },
  },
  {
    name: "og_storage_get",
    description:
      "Download a blob from 0G Storage by root. Returns the UTF-8 text and byte length.",
    inputSchema: {
      type: "object",
      required: ["root"],
      properties: {
        root: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
        rpc: { type: "string" },
      },
    },
  },
  {
    name: "og_storage_exists",
    description: "Return whether a 0G Storage root is retrievable.",
    inputSchema: {
      type: "object",
      required: ["root"],
      properties: {
        root: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
        rpc: { type: "string" },
      },
    },
  },
  {
    name: "og_infer",
    description:
      "Run a chat completion against a 0G compute provider. Returns the model output and the on-chain fee receipt.",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        temperature: { type: "number" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
        rpc: { type: "string" },
        broker_key: { type: "string" },
      },
    },
  },
  {
    name: "og_da_publish",
    description:
      "Publish a blob to 0G Data Availability (local-digest mode off-net). Returns the keccak digest, daRef, and mode.",
    inputSchema: {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
      },
    },
  },
  {
    name: "og_da_verify",
    description:
      "Local integrity check: recompute the DA digest of a payload and compare to an expected digest.",
    inputSchema: {
      type: "object",
      required: ["payload", "digest"],
      properties: {
        payload: { type: "string" },
        digest: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
      },
    },
  },
  {
    name: "og_chain_faucet",
    description:
      "Request testnet funds for an address. On galileo this returns the web-faucet URL.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
      },
    },
  },
  {
    name: "og_chain_balance",
    description: "Read the native 0G balance of an address.",
    inputSchema: {
      type: "object",
      required: ["address"],
      properties: {
        address: { type: "string" },
        network: { type: "string", enum: ["aristotle", "galileo", "local"] },
        rpc: { type: "string" },
      },
    },
  },
  {
    name: "og_attest_verify",
    description:
      "Verify a TEE attestation envelope: digest integrity AND signer identity. Never throws — reports which check failed.",
    inputSchema: {
      type: "object",
      required: ["signed_envelope", "signer"],
      properties: {
        signed_envelope: { type: "string" },
        signer: { type: "string" },
      },
    },
  },
];

interface SignedLike {
  envelope: unknown;
  digest: string;
  signature: string;
}

export function makeHandlers(
  deps: McpDeps
): Record<string, (args: Record<string, unknown>) => Promise<ToolCallResult>> {
  const net = (n: string | undefined): NetworkName => resolveNetwork(n, deps.env);

  return {
    og_storage_put: async (raw) => {
      try {
        const a = StoragePutArgs.parse(raw);
        const network = dataNetwork(net(a.network));
        const privateKey = a.private_key ?? deps.env.ZEROG_PRIVATE_KEY;
        if (!privateKey) {
          throw new ConfigError(
            `og_storage_put requires a signer key (funds the upload tx).`,
            `Set ZEROG_PRIVATE_KEY or pass "private_key".`
          );
        }
        const data = new TextEncoder().encode(a.data);
        const s = deps.makeStorage({ network, rpcUrl: a.rpc, privateKey });
        const r = await s.upload(data);
        const tx = deps.attachExplorerUrl(r.tx, deps.getNetwork(network));
        return ok({
          root: r.root,
          txHash: tx.txHash ?? null,
          explorerUrl: tx.explorerUrl ?? null,
          bytes: data.length,
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_storage_get: async (raw) => {
      try {
        const a = StorageGetArgs.parse(raw);
        const network = dataNetwork(net(a.network));
        const s = deps.makeStorage({ network, rpcUrl: a.rpc });
        const bytes = await s.download(a.root);
        return ok({
          root: a.root,
          bytes: bytes.length,
          text: new TextDecoder().decode(bytes),
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_storage_exists: async (raw) => {
      try {
        const a = StorageExistsArgs.parse(raw);
        const network = dataNetwork(net(a.network));
        const s = deps.makeStorage({ network, rpcUrl: a.rpc });
        return ok({ root: a.root, exists: await s.exists(a.root) });
      } catch (e) {
        return fail(e);
      }
    },

    og_infer: async (raw) => {
      try {
        const a = InferArgs.parse(raw);
        const network = net(a.network);
        const brokerKey =
          a.broker_key ?? deps.env.ZEROG_BROKER_KEY ?? deps.env.ZEROG_PRIVATE_KEY;
        if (!brokerKey) {
          throw new ConfigError(
            `og_infer requires a funded broker key.`,
            `Set ZEROG_BROKER_KEY (or ZEROG_PRIVATE_KEY) or pass "broker_key".`
          );
        }
        const provider = a.provider ?? deps.env.ZEROG_PROVIDER;
        if (!provider) {
          throw new ConfigError(
            `og_infer requires a provider address.`,
            `Pass "provider" or set ZEROG_PROVIDER.`
          );
        }
        const compute = deps.makeCompute({
          network:
            network === "aristotle" || network === "galileo" ? network : undefined,
          brokerKey,
          brokerRpc: a.rpc,
          provider,
          model: a.model,
        });
        const r = await compute.inference({
          messages: [{ role: "user", content: a.message }],
          model: a.model,
          temperature: a.temperature,
        });
        return ok({
          output: r.output,
          provider,
          txHash: r.receipt.txHash ?? null,
          latencyMs: r.receipt.latencyMs,
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_da_publish: async (raw) => {
      try {
        const a = DaPublishArgs.parse(raw);
        const network = net(a.network);
        const client = deps.makeDA({
          network:
            network === "aristotle" || network === "galileo" ? network : undefined,
        });
        const r = await client.publish(new TextEncoder().encode(a.payload));
        return ok({
          digest: r.digest,
          daRef: r.daRef ?? null,
          blobId: r.blobId ?? null,
          mode: r.mode,
          latencyMs: r.latencyMs,
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_da_verify: async (raw) => {
      try {
        const a = DaVerifyArgs.parse(raw);
        const network = net(a.network);
        const client = deps.makeDA({
          network:
            network === "aristotle" || network === "galileo" ? network : undefined,
        });
        const verified = client.verify(new TextEncoder().encode(a.payload), a.digest);
        return ok({ digest: a.digest, verified });
      } catch (e) {
        return fail(e);
      }
    },

    og_chain_faucet: async (raw) => {
      try {
        const a = ChainFaucetArgs.parse(raw);
        const network = net(a.network);
        const r = await deps.faucet(deps.getNetwork(network), a.address);
        return ok({
          address: a.address,
          network,
          txHash: r.txHash ?? null,
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_chain_balance: async (raw) => {
      try {
        const a = ChainBalanceArgs.parse(raw);
        const network = net(a.network);
        const client = deps.createClient({ network, rpcUrl: a.rpc });
        const wei = await deps.balance(client, a.address);
        return ok({
          address: a.address,
          network,
          wei: wei.toString(),
          zg: formatEther(wei),
        });
      } catch (e) {
        return fail(e);
      }
    },

    og_attest_verify: async (raw) => {
      try {
        const a = AttestVerifyArgs.parse(raw);
        let parsed: unknown;
        try {
          parsed = JSON.parse(a.signed_envelope);
        } catch (e) {
          throw new ConfigError(
            `signed_envelope is not valid JSON: ${(e as Error).message}`,
            `Pass a SignedEnvelope JSON string: { envelope, digest, signature }.`
          );
        }
        const s = parsed as Partial<SignedLike>;
        if (!s || typeof s !== "object" || !s.envelope || !s.digest || !s.signature) {
          throw new ConfigError(
            `signed_envelope is not a SignedEnvelope.`,
            `Expected { envelope, digest, signature } (output of signEnvelope()).`
          );
        }
        deps.attest.parseEnvelope(s.envelope);
        const result = await deps.attest.verifyEnvelope(s as never, a.signer);
        return ok({
          verified: result.ok,
          checks: result.checks,
          signer: result.signer,
          report: deps.attest.reportEnvelope(s as never),
        });
      } catch (e) {
        return fail(e);
      }
    },
  };
}
