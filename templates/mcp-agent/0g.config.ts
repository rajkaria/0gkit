import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe('Network preset: "galileo", "aristotle", or "local".'),
    ZEROG_RPC_URL: z
      .string()
      .url()
      .optional()
      .describe("Override the preset EVM JSON-RPC URL."),
    ZEROG_PRIVATE_KEY: z.string().optional().describe("Signer for og_storage_put."),
    ZEROG_BROKER_KEY: z.string().optional().describe("Broker for og_infer."),
    ZEROG_PROVIDER: z
      .string()
      .optional()
      .describe("Pinned compute provider address for og_infer."),
    ZEROG_FOUNDRY: z
      .enum(["0", "1"])
      .default("0")
      .describe("Enable opt-in Foundry plugin (1 = on, 0 = off)."),
  },
});
