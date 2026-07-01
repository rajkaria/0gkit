import { define0GConfig } from "@foundryprotocol/0gkit-core";
import { z } from "zod";

export const config = define0GConfig({
  server: {
    ZEROG_NETWORK: z
      .enum(["galileo", "aristotle", "local"])
      .default("galileo")
      .describe("0G network for inference."),
    BROKER_KEY: z
      .string()
      .min(64)
      .describe("Funded 0G broker key for client-side routing (used when ROUTER_API_KEY is blank)."),
    ROUTER_API_KEY: z
      .string()
      .optional()
      .describe("0G Router API key (pc.0g.ai); set to use the managed Router endpoint."),
    PROVIDER: z
      .string()
      .optional()
      .describe("Pin a provider address; blank = router picks one."),
    MODEL: z
      .string()
      .optional()
      .describe("Pin a model name; blank = provider default."),
    PROMPT: z
      .string()
      .default("In one sentence, what is the 0G network?")
      .describe("Prompt to send."),
  },
});
