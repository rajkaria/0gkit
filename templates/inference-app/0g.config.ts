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
      .describe("Funded 0G broker private key for inference."),
    PROVIDER: z
      .string()
      .optional()
      .describe("Pin a provider address; blank = auto-discover."),
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
