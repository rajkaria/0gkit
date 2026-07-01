import { z } from "zod";
import { define0GConfig, galileo } from "@foundryprotocol/0gkit-core";

/**
 * Golden-path typed config (define0GConfig). Galileo testnet is the default —
 * the public network-status panel reads real galileo data with no secrets.
 * The write/AI features degrade to honest "configure X" states when their
 * optional keys are absent, so the app deploys keyless and never fabricates.
 */
export const config = define0GConfig({
  server: {
    OG_RPC_URL: z
      .string()
      .url()
      .default(galileo.rpcUrl ?? "https://evmrpc-testnet.0g.ai")
      .describe("0G galileo JSON-RPC endpoint (read-only network status)"),
    OG_PRIVATE_KEY: z
      .string()
      .optional()
      .describe("signer key — optional; enables 0G Storage pins + live-feed posts"),
    ROUTER_API_KEY: z
      .string()
      .optional()
      .describe(
        "0G Router key (pc.0g.ai) — optional; enables the AI summary via Compute.router()"
      ),
    OG_FEED_CONTRACT_ADDRESS: z
      .string()
      .optional()
      .describe("deployed FeedEvents address — optional; enables reorg-safe live-feed"),
  },
  client: {
    NEXT_PUBLIC_OG_NETWORK: z
      .string()
      .default("galileo")
      .describe("network label shown in the UI"),
  },
});

export const galileoPreset = galileo;
