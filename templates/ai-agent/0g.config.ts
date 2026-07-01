import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("0G network for compute calls."),
    BROKER_KEY: z
      .string()
      .min(64)
      .describe("Funded broker key for 0G Compute client-side routing (testnet OK)."),
    ROUTER_API_KEY: z
      .string()
      .optional()
      .describe(
        "0G Router API key (pc.0g.ai); set to use the managed Router endpoint."
      ),
    PROVIDER: z
      .string()
      .optional()
      .describe("Optional pinned compute provider address; router picks one if blank."),
    MODEL: z
      .string()
      .optional()
      .describe("Optional pinned model name; defaults to provider's default."),
  },
});
